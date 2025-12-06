/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3 - V2]
 * Logic: Deduplication & Upsert.
 * Updated: Typesafe (no implicit any).
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
      // 1. Parse tin nhắn (Standardize)
      const message = this.parser.parse(rawMsg);
      if (!message) return;

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

      if (!conversationUUID) return;

      // 4. Ensure Sender (Customer)
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

      // 5. UPSERT MESSAGE (Deduplication)
      const { data: existingMsg, error: findError } = await supabase
        .from("messages")
        .select("id, bot_ids")
        .eq("conversation_id", conversationUUID)
        .eq("zalo_msg_id", message.msgId)
        .single();

      if (existingMsg) {
        // A. Đã tồn tại -> Update bot_ids array
        // (Cast bot_ids về mảng string để tránh lỗi type unknown nếu có)
        const currentBotIds = (existingMsg.bot_ids as string[]) || [];

        if (!currentBotIds.includes(botId)) {
          const newBotIds = [...currentBotIds, botId];
          await supabase
            .from("messages")
            .update({ bot_ids: newBotIds })
            .eq("id", existingMsg.id);

          console.log(
            `[Pipeline] Deduplicated msg ${message.msgId} for bot ${botId}`,
          );
        }
      } else {
        // B. Insert mới
        const { error: insertError } = await supabase.from("messages").insert({
          conversation_id: conversationUUID,
          sender_type: senderType,
          sender_id: senderUUID,

          bot_ids: [botId],
          zalo_msg_id: message.msgId,

          content: message.content, // Normalized JSON
          raw_content: rawMsg, // Raw JSON
          msg_type: (message.content as { type?: string }).type || "text", // Ép kiểu an toàn từ unknown

          sent_at: new Date(message.timestamp).toISOString(),
        });

        if (insertError) {
          console.warn(`[Pipeline] Insert msg error:`, insertError.message);
        } else {
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
