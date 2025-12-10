/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3 - V2]
 * Logic: Deduplication & Upsert.
 * Updated: Thêm Logs chi tiết để debug luồng tin nhắn đến.
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
      // [DEBUG] Log đầu vào để kiểm tra
      console.log(
        `[Pipeline] Processing Msg for Bot ${botId} | isSelf: ${rawMsg.isSelf}`,
      );
      // console.log(`[Pipeline] Raw Payload:`, JSON.stringify(rawMsg).slice(0, 200) + "...");

      // 1. Parse tin nhắn (Standardize)
      const message = this.parser.parse(rawMsg);
      if (!message) {
        console.warn("[Pipeline] Failed to parse message. Skipping.");
        return;
      }

      console.log(
        `[Pipeline] Parsed MsgID: ${message.msgId} | Type: ${message.content.type}`,
      );

      // 2. Định danh Conversation
      let conversationName = message.sender.name;
      let conversationAvatar = message.sender.avatar;

      if (message.isGroup) {
        conversationName = `Group ${message.threadId}`;
        conversationAvatar = "";
      }

      // 3. Ensure Conversation & Mapping
      const conversationUUID = await ConversationService.ensureConversation(
        botId,
        message.threadId,
        message.isGroup,
        conversationName,
        conversationAvatar,
      );

      if (!conversationUUID) {
        console.error(
          "[Pipeline] Could not ensure conversation. Msg dropped.",
          message.threadId,
        );
        return;
      }

      // 4. Ensure Sender (Customer)
      let senderUUID: string = message.sender.uid;
      let senderType = "customer";

      if (!message.isSelf) {
        // Tin nhắn từ khách -> Ensure Customer
        const custUUID = await ConversationService.ensureCustomer(
          botId,
          message.sender.uid,
          message.sender.name,
          message.sender.avatar,
        );
        if (custUUID) senderUUID = custUUID;
      } else {
        // Tin nhắn từ Bot (isSelf = true)
        // Đây là tin nhắn do Staff gửi đi (hoặc Bot tự gửi)
        // Trong mô hình này, sender_id chính là botId (đại diện cho "Me")
        senderType = "staff_on_bot";
        senderUUID = botId;
      }

      // 5. UPSERT MESSAGE (Deduplication)
      // Tìm xem tin nhắn này đã tồn tại trong Conversation này chưa
      const { data: existingMsg, error: findError } = await supabase
        .from("messages")
        .select("id, bot_ids")
        .eq("conversation_id", conversationUUID)
        .eq("zalo_msg_id", message.msgId)
        .single();

      if (existingMsg) {
        // A. Đã tồn tại -> Update bot_ids array (đánh dấu là bot này cũng thấy tin nhắn đó)
        console.log(
          `[Pipeline] Msg ${message.msgId} exists. Updating bot_ids...`,
        );

        // Cast bot_ids về mảng string an toàn
        const currentBotIds = (existingMsg.bot_ids as string[]) || [];

        if (!currentBotIds.includes(botId)) {
          const newBotIds = [...currentBotIds, botId];
          await supabase
            .from("messages")
            .update({ bot_ids: newBotIds })
            .eq("id", existingMsg.id);
        }
      } else {
        // B. Insert mới (Chưa tồn tại)
        console.log(`[Pipeline] Inserting NEW Msg ${message.msgId}...`);

        // Xác định msg_type để lưu cột riêng
        const msgType =
          (message.content as { type?: string }).type || "unknown";

        const { error: insertError } = await supabase.from("messages").insert({
          conversation_id: conversationUUID,
          sender_type: senderType,
          sender_id: senderUUID,

          // Nếu là tin self, staff_id tạm thời để null vì sự kiện selfListen không mang thông tin session của staff.
          // (Có thể map sau nếu cần, nhưng quan trọng là không lưu trùng)
          staff_id: null,

          bot_ids: [botId],
          zalo_msg_id: message.msgId,

          content: message.content, // Normalized JSON
          raw_content: rawMsg, // Raw JSON đầy đủ từ Zalo
          msg_type: msgType,

          sent_at: new Date(message.timestamp).toISOString(),
        });

        if (insertError) {
          console.warn(`[Pipeline] Insert msg error:`, insertError.message);
        } else {
          // Update Last Activity cho Conversation để nó nhảy lên đầu
          await supabase
            .from("conversations")
            .update({ last_activity_at: new Date().toISOString() })
            .eq("id", conversationUUID);
        }
      }
    } catch (error) {
      console.error("[Pipeline] Critical Error:", error);
    }
  }
}
