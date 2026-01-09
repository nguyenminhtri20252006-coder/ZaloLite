/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE V6.3 - FIXED]
 * Logic định tuyến tin nhắn thông minh (Unified Pipeline).
 * Fast Path (Local DB) -> Slow Path (API Fetch + Create).
 * [FIX] Updated to match FriendService & ConversationService V6 signatures.
 */

import supabase from "@/lib/supabaseServer";
import { MessageParser } from "./message-parser";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { RawZaloMessage } from "@/lib/types/zalo.types";
import { FriendService } from "@/lib/core/services/friend-service";
import { ConversationService } from "@/lib/core/services/conversation-service";

export class MessagePipeline {
  private parser: MessageParser;

  constructor() {
    this.parser = new MessageParser();
  }

  /**
   * ENTRY POINT: Xử lý tin nhắn đến
   */
  public async process(botId: string, rawMsg: RawZaloMessage) {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    if (!api) return;

    // 1. Parse Message
    const message = this.parser.parse(rawMsg);
    if (!message) return;

    const payload = {
      uidFrom: message.sender.uid, // External ID người gửi
      threadId: message.threadId, // External ID luồng (Group/User)
      isGroup: message.isGroup,
      isSelf: message.isSelf,
    };

    console.log(
      `[Pipeline] Processing Msg ${message.msgId} from ${payload.uidFrom} (Group: ${payload.isGroup})`,
    );

    // =======================================================================
    // GIAI ĐOẠN 1: FAST PATH LOOKUP (Truy vấn song song)
    // =======================================================================

    // Query 1: Tìm Conversation mà Bot đã tham gia với thread_id này
    const pConv = supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", botId)
      .eq("thread_id", payload.threadId)
      .single();

    // Query 2: Tìm Sender trong danh bạ (Connections) của Bot
    // Lưu ý: uidFrom là External ID, ta cần tìm target_id (Identity UUID)
    const pSender = supabase
      .from("zalo_connections")
      .select("target_id")
      .eq("observer_id", botId)
      .eq("external_uid", payload.uidFrom)
      .single();

    const [resConv, resSender] = await Promise.all([pConv, pSender]);

    let conversationId = resConv.data?.conversation_id;
    let senderUUID = resSender.data?.target_id;

    // =======================================================================
    // GIAI ĐOẠN 2: SLOW PATH - SENDER RESOLUTION (Nếu thiếu Sender)
    // =======================================================================
    if (!senderUUID) {
      // [LOGIC] Nếu là tin nhắn tự gửi (isSelf), Sender chính là Bot.
      // Ta không cần resolve Sender là Bot, nhưng cần đảm bảo Bot ID valid.
      // Tuy nhiên, logic DB yêu cầu sender_id trỏ về 1 Identity.
      // Nếu isSelf=true, sender_id = botId (đã có).

      if (!payload.isSelf) {
        console.log(
          `[Pipeline] 🐢 Slow Path: Resolving Sender ${payload.uidFrom}...`,
        );
        try {
          // 1. Fetch Info từ Zalo (Lấy Global ID)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const userInfo: any = await api.getUserInfo(payload.uidFrom);
          const uData = userInfo[payload.uidFrom];

          if (uData) {
            // Global ID chuẩn: globalId (ưu tiên) > userId
            const globalId = uData.globalId || uData.userId;
            const isFriend = uData.isFr == 1;

            // 2. Upsert Identity (Tạo Identity trước để lấy UUID)
            // [FIX] Call FriendService.upsertIdentity
            const newIdentityId = await FriendService.upsertIdentity(
              globalId,
              uData,
              "user", // Force type 'user'/'customer'
              isFriend,
            );

            if (newIdentityId) {
              senderUUID = newIdentityId;

              // 3. Upsert Connection (Tạo mối quan hệ Bot - User)
              // [FIX] Call FriendService.upsertConnection with correct signature
              await FriendService.upsertConnection(
                botId, // Observer
                newIdentityId, // Target
                payload.uidFrom, // External ID (uidFrom)
                isFriend ? "friend" : "stranger", // Type
                { source: "inbound_msg" }, // Metadata
              );
            }
          }
        } catch (e) {
          console.error(`[Pipeline] Failed to resolve sender:`, e);
          return; // Không thể xác định người gửi -> Bỏ qua tin nhắn
        }
      } else {
        // Nếu isSelf = true, Sender là Bot
        senderUUID = botId;
      }
    }

    if (!senderUUID) return; // Vẫn không tìm được -> Exit

    // =======================================================================
    // GIAI ĐOẠN 3: SLOW PATH - CONVERSATION RESOLUTION (Nếu thiếu Conv)
    // =======================================================================
    if (!conversationId) {
      console.log(
        `[Pipeline] 🐢 Slow Path: Resolving Conversation ${payload.threadId}...`,
      );

      if (payload.isGroup) {
        // --- XỬ LÝ NHÓM ---
        try {
          // 1. Fetch Group Info lấy Global ID
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const groupRes: any = await api.getGroupInfo(payload.threadId);
          const map = groupRes?.gridInfoMap || {};
          const gData = map[payload.threadId] || Object.values(map)[0];

          if (gData) {
            const globalGroupId =
              gData.globalId || `${gData.creatorId}_${gData.createdTime}`;

            // 2. Gọi Service Upsert Group
            // [FIX] Changed from ensureGroupConversation to upsertGroupConversation
            conversationId = await ConversationService.upsertGroupConversation(
              globalGroupId, // System ID
              gData.name,
              gData.avt || gData.fullAvt,
              gData, // rawInfo
            );

            if (conversationId) {
              // 3. [IMPORTANT] Add Bot to group with thread_id for routing
              // [FIX] Explicitly call addMember
              await ConversationService.addMember(
                conversationId,
                botId,
                "admin", // Tạm thời set role admin hoặc member tùy logic
                payload.threadId, // Routing Key quan trọng
              );
            }
          }
        } catch (e) {
          console.error("[Pipeline] Failed to resolve Group:", e);
        }
      } else {
        // --- XỬ LÝ CÁ NHÂN (Private) ---

        // Xác định Target UUID (Người kia trong cuộc hội thoại)
        let targetUUID = senderUUID;
        let friendName = message.sender.name;
        let friendAvatar = message.sender.avatar || "";

        // Nếu Bot tự gửi (isSelf), Sender là Bot, vậy Target phải là người nhận (threadId)
        // Lúc này threadId là External ID của người nhận.
        if (payload.isSelf) {
          // Ta cần resolve người nhận từ threadId nếu chưa biết
          // [Optimization] Tạm thời nếu Fast Path miss ở case isSelf, ta cố gắng tìm trong connection
          // Nếu không có, ta coi threadId là ExternalID để map.
          // Để đơn giản hóa: Nếu isSelf mà chưa có Conv, ta thử fetch info người nhận (threadId)
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const targetInfo: any = await api.getUserInfo(payload.threadId);
            const tData = targetInfo[payload.threadId];
            if (tData) {
              const tGlobalId = tData.globalId || tData.userId;
              // Upsert Target Identity
              const tId = await FriendService.upsertIdentity(
                tGlobalId,
                tData,
                "user",
                tData.isFr == 1,
              );
              if (tId) {
                targetUUID = tId;
                friendName = tData.displayName;
                friendAvatar = tData.avatar;

                // Upsert Connection với người nhận luôn
                await FriendService.upsertConnection(
                  botId,
                  tId,
                  payload.threadId,
                  tData.isFr == 1 ? "friend" : "stranger",
                );
              }
            }
          } catch (e) {
            console.error("Failed to resolve target in self-msg", e);
          }
        }

        // [FIX] Changed from ensurePrivateConversation to upsertPrivateConversation
        conversationId = await ConversationService.upsertPrivateConversation(
          botId,
          targetUUID, // UUID của khách hàng
          friendName,
          friendAvatar,
        );

        if (conversationId) {
          // [FIX] Add Members explicitly to ensure routing
          // 1. Add Bot (Observer) - Quan trọng: thread_id là External ID để chat với khách
          const botRoutingId = payload.isSelf
            ? payload.threadId
            : payload.uidFrom;
          await ConversationService.addMember(
            conversationId,
            botId,
            "member",
            botRoutingId,
          );

          // 2. Add Target (Customer)
          await ConversationService.addMember(
            conversationId,
            targetUUID,
            "member",
            null,
          );
        }
      }
    }

    if (!conversationId) {
      console.error(
        "[Pipeline] Failed to resolve conversation ID. Dropping message.",
      );
      return;
    }

    // =======================================================================
    // GIAI ĐOẠN 4: PERSISTENCE (Lưu & Gộp)
    // =======================================================================
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      zalo_msg_id: message.msgId,
      sender_id: senderUUID,
      sender_type: payload.isSelf ? "bot" : "customer",
      content: message.content, // JSONB Normalized
      listening_bot_ids: [botId], // Bot này đã nhận được
      sent_at: new Date(message.timestamp).toISOString(),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        // Trùng MsgID -> Merge listening_bot_ids
        const { data: existing } = await supabase
          .from("messages")
          .select("listening_bot_ids")
          .eq("conversation_id", conversationId)
          .eq("zalo_msg_id", message.msgId)
          .single();

        if (existing) {
          const currentListeners = existing.listening_bot_ids || [];
          if (!currentListeners.includes(botId)) {
            await supabase
              .from("messages")
              .update({
                listening_bot_ids: [...currentListeners, botId],
              })
              .eq("conversation_id", conversationId)
              .eq("zalo_msg_id", message.msgId);

            console.log(
              `[Pipeline] 🔄 Merged Bot ${botId} into Msg ${message.msgId}`,
            );
          }
        }
      } else {
        console.error(`[Pipeline] ❌ Insert Error: ${insertError.message}`);
      }
    } else {
      console.log(`[Pipeline] ✅ Saved Msg ${message.msgId}`);
      // Update last_activity
      await supabase
        .from("conversations")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
  }
}
