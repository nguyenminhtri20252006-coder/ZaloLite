/* eslint-disable @typescript-eslint/no-explicit-any */

import supabase from "@/lib/supabaseServer";
import { DebugLogger } from "@/lib/utils/debug-logger";
import { ZaloMessageParser } from "./parsers/zalo-message-parser";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ConversationService } from "@/lib/core/services/conversation-service";
import { FriendService } from "@/lib/core/services/friend-service";
// [NEW] Import Notification Service
import { NotificationService } from "@/lib/core/services/notification-service";

/**
 * PIPELINE V18.0 - INTEGRATED SSE DISPATCHER
 * - Added: Call NotificationService.dispatchMessage after DB upsert.
 */
export class AdvancedMessagePipeline {
  public async process(botId: string, rawMsg: any) {
    // 1. Debug Log Input
    if (process.env.NODE_ENV === "development") {
      DebugLogger.logPipeline("Input", "Raw Msg", {
        type: rawMsg.data?.msgType,
        id: rawMsg.data?.msgId,
      });
    }

    // 2. Parse & Normalize
    const normalized = ZaloMessageParser.parse(rawMsg);

    if (!normalized) return; // Error logged in parser

    // 3. [FILTER] Skip Non-Persistable Events
    if (["undo", "reaction", "unknown"].includes(normalized.type)) {
      return;
    }

    // 4. Process New Message
    await this.handleNewMessage(botId, rawMsg, normalized);
  }

  // --- MAIN HANDLER (INSERT ONLY) ---

  private async handleNewMessage(botId: string, rawMsg: any, normalized: any) {
    const { senderUid, targetId, msgId, ts, isGroup, cliMsgId } =
      normalized.meta;

    let threadId = targetId;
    if (!threadId || threadId === "0") {
      threadId = rawMsg.isSelf ? rawMsg.data.idTo : senderUid;
    }

    // --- A. RESOLVE SENDER ---
    let senderType = "customer";
    let senderIdentityId: string | null = null;

    if (rawMsg.isSelf || senderUid === botId) {
      senderType = "bot";
      senderIdentityId = botId;
    } else {
      // Fast path: Check cache/DB connection
      const { data: conn } = await supabase
        .from("zalo_connections")
        .select("target_id")
        .eq("observer_id", botId)
        .eq("external_uid", senderUid)
        .single();

      if (conn) {
        senderIdentityId = conn.target_id;
      } else {
        // Slow path: Fetch User Info form Zalo API
        senderIdentityId = await this.slowPathResolveSender(botId, senderUid);
      }
    }

    // --- B. RESOLVE CONVERSATION ---
    let conversationId: string | null = null;

    // Fast path: Check DB membership
    const { data: member } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", botId)
      .eq("thread_id", threadId)
      .single();

    if (member) {
      conversationId = member.conversation_id;
    } else {
      // Slow path: Create Conversation & Sync Group Info
      DebugLogger.logPipeline(
        "Warning",
        `Thread ${threadId} missing. Auto-creating...`,
      );
      conversationId = await this.slowPathCreateConversation(
        botId,
        threadId,
        isGroup,
        senderIdentityId,
      );
    }

    if (!conversationId) {
      DebugLogger.logPipeline(
        "Error",
        `Failed to resolve Conversation ${threadId}.`,
      );
      return;
    }

    // --- C. PERSISTENCE (UPSERT) ---
    const finalContent = {
      ...normalized,
      cliMsgId: String(cliMsgId),
    };

    const payload = {
      conversation_id: conversationId,
      zalo_msg_id: msgId,
      sender_identity_id: senderIdentityId,
      sender_type: senderType,
      content: finalContent,
      raw_content: rawMsg, // Backup raw data
      sent_at: new Date(ts).toISOString(),
      created_at: new Date().toISOString(),
      listening_bot_ids: [botId],
      flags: { status: "sent", is_undo: false },
    };

    const { data: insertedMsg, error } = await supabase
      .from("messages")
      .upsert(payload, { onConflict: "conversation_id, zalo_msg_id" })
      .select()
      .single();

    if (error) {
      DebugLogger.logPipeline("Error", "DB Insert Failed", error.message);
    } else {
      // Update Conversation Last Message
      await supabase
        .from("conversations")
        .update({
          last_activity_at: new Date().toISOString(),
          last_message: finalContent,
        })
        .eq("id", conversationId);

      // [NEW] DISPATCH NOTIFICATION (Realtime)
      // Gửi sự kiện SSE tới Client ngay lập tức
      if (insertedMsg) {
        await NotificationService.dispatchMessage(botId, insertedMsg, threadId);
      }
    }
  }

  // --- HELPERS (SLOW PATHS) ---

  private async slowPathCreateConversation(
    botId: string,
    threadId: string,
    isGroup: boolean,
    targetIdentityId: string | null,
  ): Promise<string | null> {
    try {
      const api = await BotRuntimeManager.getInstance().getBotAPI(botId);
      if (!api) return null;

      if (isGroup) {
        const groupRes: any = await api.getGroupInfo(threadId);
        const map = groupRes?.gridInfoMap || {};
        const gData = map[threadId] || Object.values(map)[0];
        if (!gData) return null;

        const globalGroupId =
          gData.globalId || `${gData.creatorId}_${gData.createdTime}`;
        const convId = await ConversationService.upsertGroupConversation(
          globalGroupId,
          gData.name,
          gData.avt || gData.fullAvt,
          gData,
        );
        if (convId) {
          await ConversationService.addMember(
            convId,
            botId,
            "member",
            threadId,
          );
          return convId;
        }
      } else {
        if (!targetIdentityId) {
          targetIdentityId = await this.slowPathResolveSender(botId, threadId);
          if (!targetIdentityId) return null;
        }
        const { data: identity } = await supabase
          .from("zalo_identities")
          .select("root_name, avatar")
          .eq("id", targetIdentityId)
          .single();
        if (!identity) return null;

        const convId = await ConversationService.upsertPrivateConversation(
          botId,
          targetIdentityId,
          identity.root_name,
          identity.avatar,
          {}, // rawData
          threadId, // <--- thread_id (UID)
        );

        if (convId) {
          await ConversationService.addMember(
            convId,
            botId,
            "member",
            threadId,
          );
          await ConversationService.addMember(
            convId,
            targetIdentityId,
            "member",
            null,
          );
          return convId;
        }
      }
    } catch (e) {
      console.error("[SlowPath] Error creating conversation:", e);
    }
    return null;
  }

  private async slowPathResolveSender(
    botId: string,
    senderUid: string,
  ): Promise<string | null> {
    try {
      const api = await BotRuntimeManager.getInstance().getBotAPI(botId);
      if (!api) return null;

      const userInfo: any = await api.getUserInfo(senderUid);
      const uData = userInfo[senderUid];
      if (!uData || (!uData.userId && !uData.globalId)) return null;

      const globalId = uData.globalId || uData.userId;
      const identityId = await FriendService.upsertIdentity(
        globalId,
        uData,
        "user",
      );

      if (identityId) {
        await FriendService.upsertConnection(botId, identityId, senderUid, {
          is_friend: uData.isFr == 1,
          type: uData.isFr == 1 ? "friend" : "stranger",
          source: "auto_resolve_pipeline",
        });
        return identityId;
      }
    } catch (e) {
      console.error("[SlowPath] Error resolving sender:", e);
    }
    return null;
  }
}
