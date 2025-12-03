/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3]
 * Xử lý logic nghiệp vụ: Upsert Customer/Conversation -> Save Message -> DB.
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

  /**
   * Xử lý chính: Nhận Raw Message -> Lưu DB
   */
  public async process(botId: string, rawMsg: RawZaloMessage) {
    try {
      // 1. Parse tin nhắn
      const message = this.parser.parse(rawMsg);
      if (!message) return;

      // [NEW] DEDUPLICATION CHECK
      // Nếu là tin nhắn của mình (isSelf), kiểm tra xem msgId đã tồn tại chưa
      // Vì Action sendMessageAction có thể đã lưu nó vào DB rồi.
      if (message.isSelf) {
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("zalo_msg_id", message.msgId)
          .single();

        if (existing) {
          console.log(
            `[Pipeline] Skipped duplicated self-message: ${message.msgId}`,
          );
          return;
        }
      }

      console.log(`[Pipeline] Processing msg from ${message.sender.name}...`);

      // 1. Xác định Conversation ID (Dùng Service chung)
      const conversationUUID = await ConversationService.ensureConversation(
        botId,
        message.threadId,
        message.isGroup,
        message.sender.name,
      );

      if (!conversationUUID) return;

      // 2. Xác định Sender
      let senderUUID: string | null = null;
      let senderType = "customer";

      if (!message.isSelf) {
        senderUUID = await ConversationService.ensureCustomer(
          botId,
          message.sender.uid,
          message.sender.name,
        );
      } else {
        senderType = "staff_on_bot";
        senderUUID = botId;
      }

      if (!senderUUID) return;

      // 3. Insert Message
      await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        sender_type: senderType,
        sender_id: senderUUID,
        content: message.content,
        zalo_msg_id: message.msgId,
        sent_at: new Date(message.timestamp).toISOString(),
        // staff_id để null vì đây là pipeline tự động (hoặc gửi từ điện thoại)
      });

      // 4. Update Last Activity
      await supabase
        .from("conversations")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", conversationUUID);
    } catch (error) {
      console.error("[Pipeline] Error:", error);
    }
  }
}
