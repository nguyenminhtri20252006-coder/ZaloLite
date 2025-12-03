/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3]
 * Xử lý logic nghiệp vụ: Upsert Customer/Conversation -> Save Message -> DB.
 * [FIX] Logic phân loại Conversation Name (Group vs User).
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

      // Deduplication check (Self message)
      if (message.isSelf) {
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("zalo_msg_id", message.msgId)
          .single();

        if (existing) return;
      }

      // 2. Xác định Tên Hội Thoại (Conversation Name)
      // [CRITICAL FIX] Nếu là Group, KHÔNG dùng tên người gửi làm tên nhóm.
      // Nếu là User, tên hội thoại chính là tên người gửi.
      let conversationName = message.sender.name;
      let conversationAvatar = message.sender.avatar;

      if (message.isGroup) {
        // Với Group, ta chưa biết tên nhóm từ message event.
        // Đặt tên tạm là ID, avatar rỗng.
        // Metadata sẽ được update sau bởi tiến trình sync hoặc getThreadsAction.
        conversationName = `Group ${message.threadId}`;
        conversationAvatar = "";
      }

      // 3. Upsert Conversation
      const conversationUUID = await ConversationService.ensureConversation(
        botId,
        message.threadId,
        message.isGroup,
        conversationName,
        conversationAvatar,
      );

      if (!conversationUUID) return;

      // 4. Upsert Sender (Customer)
      // Chỉ tạo Customer nếu người gửi KHÔNG phải là Bot (isSelf = false)
      let senderUUID: string | null = null;
      let senderType = "customer";

      if (!message.isSelf) {
        senderUUID = await ConversationService.ensureCustomer(
          botId,
          message.sender.uid,
          message.sender.name,
          message.sender.avatar, // Truyền avatar vào service
        );
      } else {
        senderType = "staff_on_bot";
        senderUUID = botId;
      }

      if (!senderUUID) return;

      // 5. Insert Message
      await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        sender_type: senderType,
        sender_id: senderUUID,
        content: message.content,
        zalo_msg_id: message.msgId,
        sent_at: new Date(message.timestamp).toISOString(),
      });

      // 6. Update Last Activity
      await supabase
        .from("conversations")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", conversationUUID);
    } catch (error) {
      console.error("[Pipeline] Error:", error);
    }
  }
}
