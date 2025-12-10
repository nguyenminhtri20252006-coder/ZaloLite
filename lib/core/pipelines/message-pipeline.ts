/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3 - V2.2]
 * Logic: Deduplication & Atomic Upsert.
 * [FIXED] Log chi tiết Conversation ID để debug duplicate issue.
 */

import supabase from "@/lib/supabaseServer";
import { MessageParser } from "./message-parser";
import { ConversationService } from "@/lib/core/services/conversation-service";
import { RawZaloMessage } from "@/lib/types/zalo.types";

export class MessagePipeline {
  private parser: MessageParser;

  constructor() {
    this.parser = new MessageParser();
  }

  public async process(botId: string, rawMsg: RawZaloMessage) {
    try {
      // [DEBUG] Log Raw Input
      console.log(`[Pipeline] 📥 RAW EVENT from Bot ${botId}:`);
      console.log(`   - ThreadID (Raw): "${rawMsg.threadId}"`);
      console.log(`   - Type: ${rawMsg.type} (0=User, 1=Group)`);
      console.log(`   - isSelf: ${rawMsg.isSelf}`);

      const message = this.parser.parse(rawMsg);
      if (!message) return;

      // 1. Ensure Conversation (Sử dụng UPSERT mới)
      // Đây là bước quan trọng nhất để đảm bảo tính nhất quán
      let conversationName = message.sender.name;
      let conversationAvatar = message.sender.avatar;
      if (message.isGroup) {
        conversationName = `Group ${message.threadId}`;
        conversationAvatar = "";
      }

      // [DEBUG] Log trước khi gọi Service
      console.log(
        `[Pipeline] ➡️ Calling EnsureConv with GlobalID="${message.threadId}"`,
      );

      const conversationUUID = await ConversationService.ensureConversation(
        botId,
        message.threadId,
        message.isGroup,
        conversationName,
        conversationAvatar,
      );

      if (!conversationUUID) {
        console.error(
          `[Pipeline] Failed to ensure conversation for ${message.threadId}`,
        );
        return;
      }

      // [DEBUG LOG] In ra UUID để kiểm tra xem các Bot có cùng ID không
      console.log(
        `[Pipeline] Bot ${botId} -> ConvUUID: ${conversationUUID} | MsgID: ${message.msgId}`,
      );

      // 2. Ensure Sender
      let senderUUID: string = message.sender.uid;
      let senderType = "customer";

      if (!message.isSelf) {
        const custUUID = await ConversationService.ensureCustomer(
          botId,
          message.sender.uid,
          message.sender.name,
          message.sender.avatar,
        );
        if (custUUID) senderUUID = custUUID;
      } else {
        senderType = "staff_on_bot";
        senderUUID = botId;
      }

      // 3. ATOMIC INSERT-THEN-UPDATE
      const msgType = (message.content as { type?: string }).type || "unknown";

      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        zalo_msg_id: message.msgId,
        sender_type: message.isSelf ? "staff_on_bot" : "customer",
        sender_id: message.isSelf ? botId : message.sender.uid,
        bot_ids: [botId],
        content: message.content,
        raw_content: rawMsg,
        msg_type: msgType,

        sent_at: new Date(message.timestamp).toISOString(),
      });

      // CASE A: Success Insert
      if (!insertError) {
        console.log(`[Pipeline] ✅ Inserted Msg ${message.msgId} (New)`);

        // Update Activity
        await supabase
          .from("conversations")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", conversationUUID);
        return;
      }

      // CASE B: Duplicate Key (Đã tồn tại) -> Append Bot ID
      if (insertError.code === "23505") {
        console.log(
          `[Pipeline] ✅ Saved Msg ${message.msgId} to ConvUUID ${conversationUUID}`,
        );
      } else if (insertError.code === "23505") {
        console.log(
          `[Pipeline] ⚠️ Duplicate Msg ${message.msgId} in ConvUUID ${conversationUUID}. Triggering Merge...`,
        );

        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id, bot_ids")
          .eq("conversation_id", conversationUUID)
          .eq("zalo_msg_id", message.msgId)
          .single();

        if (existingMsg) {
          const currentBotIds = (existingMsg.bot_ids as string[]) || [];
          if (!currentBotIds.includes(botId)) {
            const uniqueBots = Array.from(new Set([...currentBotIds, botId]));
            await supabase
              .from("messages")
              .update({ bot_ids: uniqueBots })
              .eq("id", existingMsg.id);
            console.log(
              `[Pipeline] 🔄 Merged BotIDs: ${JSON.stringify(uniqueBots)}`,
            );
          }
        }
      } else {
        console.error(
          `[Pipeline] ❌ Insert Error: ${insertError.message} (Code: ${insertError.code})`,
        );
      }
    } catch (error) {
      console.error("[Pipeline] Critical Error:", error);
    }
  }
}
