/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3 - V4.0 FINAL]
 * Logic:
 * - SEPARATION: 1-on-1 Conversations are scoped by Bot ID (Format: HashID_BotID).
 * - CRM: Customers are shared globally (Format: HashID).
 * - GROUPS: Shared globally.
 */

import supabase from "@/lib/supabaseServer";
import { MessageParser } from "./message-parser";
import { ConversationService } from "@/lib/core/services/conversation-service";
import { RawZaloMessage } from "@/lib/types/zalo.types";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";

export class MessagePipeline {
  private parser: MessageParser;

  constructor() {
    this.parser = new MessageParser();
  }

  public async process(botId: string, rawMsg: RawZaloMessage) {
    try {
      const message = this.parser.parse(rawMsg);
      if (!message) return;

      const numericThreadId = message.threadId;
      const numericSenderId = message.sender.uid;

      // =======================================================================
      // BƯỚC 1: ĐỊNH DANH (IDENTIFICATION) & FETCH INFO
      // =======================================================================

      const api = BotRuntimeManager.getInstance().getBotAPI(botId);

      // Biến lưu thông tin gốc từ Zalo
      let rawGlobalId = ""; // ID Gốc của User/Group (Chưa gán BotID)
      let name = message.isGroup ? `Group ${numericThreadId}` : "Unknown";
      let avatar = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawInfo: any = {};
      let fetchSuccess = false;

      // 1.1 Cố gắng lấy thông tin từ Zalo để có Global ID chuẩn
      try {
        if (message.isGroup) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const groupInfoRes: any = await api.getGroupInfo([numericThreadId]);
          const map = groupInfoRes?.gridInfoMap || {};
          const targetKey =
            Object.keys(map).find((k) => k === String(numericThreadId)) ||
            Object.keys(map)[0];
          const gData = map[targetKey];

          if (gData) {
            rawGlobalId = gData.globalId || gData.id || numericThreadId;
            name = gData.name || name;
            avatar = gData.avt || gData.fullAvt || gData.avatar || "";
            rawInfo = gData;
            fetchSuccess = true;
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const userInfo: any = await api.getUserInfo(numericThreadId);
          const uData = userInfo[numericThreadId];
          if (uData) {
            rawGlobalId = uData.globalId || uData.userId || numericThreadId;
            name = uData.displayName || uData.zaloName || name;
            avatar = uData.avatar || "";
            rawInfo = uData;
            fetchSuccess = true;
          }
        }
      } catch (apiErr) {
        console.error(`[Pipeline] ❌ Fetch Info Error:`, apiErr);
      }

      // Fallback nếu fetch lỗi
      if (!rawGlobalId) rawGlobalId = numericThreadId;

      // =======================================================================
      // BƯỚC 2: TÁCH BIỆT LOGIC HỘI THOẠI (SEPARATION LOGIC)
      // =======================================================================

      // A. ID cho Bảng Conversations
      // - Nếu là Group: Dùng chung ID (Shared Context)
      // - Nếu là User: Dùng ID riêng theo Bot (Private Context) -> TRÁNH XUNG ĐỘT
      let conversationGlobalId = rawGlobalId;
      if (!message.isGroup) {
        conversationGlobalId = `${rawGlobalId}_${botId}`;
        // Ví dụ: 0GN8..._5439733e-58c3...
      }

      // B. ID cho Bảng Customers
      // - Luôn dùng ID Gốc để CRM gom nhóm được lịch sử
      const customerGlobalId = rawGlobalId;

      // =======================================================================
      // BƯỚC 3: CẬP NHẬT DATABASE (UPSERT)
      // =======================================================================

      // 3.1 Ensure Conversation (Với ID đã tách biệt)
      const conversationUUID = await ConversationService.ensureConversation(
        botId,
        conversationGlobalId, // ID Hội thoại (Có thể đã gán suffix)
        numericThreadId,
        message.isGroup,
        name,
        avatar,
        rawInfo,
      );

      if (!conversationUUID) {
        console.error(`[Pipeline] ❌ Failed to ensure conversation.`);
        return;
      }

      // 3.2 Ensure Customer (Với ID Gốc - Shared CRM)
      // Chỉ tạo Customer nếu đây là tin nhắn 1-1 hoặc người gửi trong nhóm
      let customerUUID: string | null = null;
      let senderType = "customer";
      let botSendId: string | null = null;

      if (message.isSelf) {
        senderType = "bot";
        botSendId = botId;
      } else {
        // Xử lý người gửi (Customer)
        const senderNumericId = message.sender.uid;

        // Logic lấy info người gửi (nếu khác với threadId - tức là trong nhóm)
        let senderGlobalId = senderNumericId;
        let senderName = message.sender.name;
        let senderAvatar = message.sender.avatar;

        // Nếu là chat 1-1, người gửi chính là người chat (đã fetch info ở trên)
        if (
          !message.isGroup &&
          numericThreadId === numericSenderId &&
          fetchSuccess
        ) {
          senderGlobalId = rawGlobalId; // Dùng ID chuẩn vừa fetch
          senderName = name;
          senderAvatar = avatar;
        } else if (message.isGroup) {
          // Trong nhóm, cần fetch info người gửi riêng nếu muốn chuẩn (Tạm thời dùng data từ message)
        }

        customerUUID = await ConversationService.ensureCustomer(
          botId,
          senderGlobalId, // ID Gốc (Shared)
          senderNumericId,
          senderName,
          senderAvatar,
        );
      }

      // =======================================================================
      // BƯỚC 4: INSERT TIN NHẮN
      // =======================================================================
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgType = (message.content as any).type || "unknown";

      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        zalo_msg_id: message.msgId,
        sender_type: senderType,

        customer_send_id: customerUUID, // Link tới Customer Shared
        bot_send_id: botSendId,
        staff_id: null,

        content: message.content,
        raw_content: rawMsg,
        msg_type: msgType,
        sent_at: new Date(message.timestamp).toISOString(),
      });

      if (!insertError) {
        console.log(
          `[Pipeline] ✅ Saved Msg ${
            message.msgId
          } -> Conv: ${conversationGlobalId.substring(0, 15)}...`,
        );
        // Update last_activity
        await supabase
          .from("conversations")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", conversationUUID);
      } else if (insertError.code === "23505") {
        console.log(`[Pipeline] 🔄 Duplicate Msg ${message.msgId}. Skipped.`);
      } else {
        console.error(`[Pipeline] ❌ Insert Error: ${insertError.message}`);
      }
    } catch (error) {
      console.error("[Pipeline] Critical Error:", error);
    }
  }
}
