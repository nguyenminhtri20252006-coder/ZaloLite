/**
 * lib/core/pipelines/message-pipeline.ts
 * [PIPELINE STEP 3 - V3.0]
 * Logic: "Lazy Resolution" (Giải quyết định danh trễ).
 * 1. Nhận tin nhắn (chỉ có Numeric ID).
 * 2. Check DB Mapping -> Nếu có, dùng luôn.
 * 3. Nếu chưa có -> Gọi API Zalo lấy Hash ID -> Tạo mới Conversation/Customer chuẩn.
 * 4. [CRITICAL FIX] Insert đúng UUID vào bảng messages (thay vì raw ID).
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

      const numericThreadId = message.threadId; // ID Số
      const numericSenderId = message.sender.uid; // ID Số (người gửi)

      // [DEBUG]
      console.log(
        `[Pipeline] 📨 Processing Msg from Bot ${botId} | Thread(Num): ${numericThreadId} | MsgId: ${message.msgId}`,
      );

      // --- BƯỚC 1: GIẢI QUYẾT CONVERSATION UUID ---
      let conversationUUID =
        await ConversationService.findConversationByExternalId(
          botId,
          numericThreadId,
        );

      if (!conversationUUID) {
        console.log(
          `[Pipeline] ⚠️ Conversation Mapping not found for ${numericThreadId}. Fetching Global Info...`,
        );
        // Chưa có trong DB -> Gọi API lấy Global Hash ID
        const api = BotRuntimeManager.getInstance().getBotAPI(botId);
        let globalHashId = "";
        let name = message.isGroup ? `Group ${numericThreadId}` : "Unknown";
        let avatar = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let rawInfo: any = {};

        try {
          if (message.isGroup) {
            // Lấy Info Group
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const groupInfo: any = await api.getGroupInfo([numericThreadId]);
            const gData = groupInfo.gridInfoMap?.[numericThreadId];
            if (gData) {
              globalHashId = gData.globalId || gData.id; // Ưu tiên GlobalId
              name = gData.name;
              avatar = gData.avatar;
              rawInfo = gData;
            }
          } else {
            // Lấy Info User (1-1)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userInfo: any = await api.getUserInfo(numericThreadId);
            // API user info thường trả về object key là ID
            const uData = userInfo[numericThreadId];
            if (uData) {
              globalHashId = uData.globalId || uData.userId;
              name = uData.displayName || uData.zaloName;
              avatar = uData.avatar;
              rawInfo = uData;
            }
          }
        } catch (apiErr) {
          console.error(`[Pipeline] ❌ Failed to fetch Global Info:`, apiErr);
          // Fallback cực đoan: Nếu không lấy được Hash, tạm dùng Numeric làm Hash (để không mất tin)
          // Lưu ý: Điều này sẽ tạo ra dữ liệu "bẩn" nhưng chấp nhận được trong short-term
          globalHashId = numericThreadId;
        }

        if (globalHashId) {
          conversationUUID = await ConversationService.ensureConversation(
            botId,
            globalHashId, // Hash
            numericThreadId, // Numeric
            message.isGroup,
            name,
            avatar,
            rawInfo,
          );
        }
      }

      if (!conversationUUID) {
        console.error(
          `[Pipeline] ❌ Failed to resolve Conversation UUID. Dropping message.`,
        );
        return;
      }

      // --- BƯỚC 2: GIẢI QUYẾT SENDER UUID ---
      let senderUUID: string;
      let senderType = "customer";

      if (message.isSelf) {
        // Nếu là chính mình (Bot) -> Sender là Staff (hoặc Bot System)
        senderType = "staff_on_bot";
        senderUUID = botId; // UUID của Bot trong bảng zalo_bots
      } else {
        // Nếu là khách -> Tìm hoặc Tạo Customer
        let custUUID = await ConversationService.findCustomerByExternalId(
          botId,
          numericSenderId,
        );

        if (!custUUID) {
          console.log(
            `[Pipeline] ⚠️ Customer Mapping not found for ${numericSenderId}. Fetching...`,
          );
          // Tương tự, gọi API lấy thông tin người gửi
          try {
            const api = BotRuntimeManager.getInstance().getBotAPI(botId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userInfo: any = await api.getUserInfo(numericSenderId);
            const uData = userInfo[numericSenderId];

            if (uData) {
              const globalHash = uData.globalId || uData.userId;
              custUUID = await ConversationService.ensureCustomer(
                botId,
                globalHash,
                numericSenderId,
                uData.displayName || message.sender.name,
                uData.avatar || message.sender.avatar,
                uData,
              );
            } else {
              // Fallback nếu không fetch được
              custUUID = await ConversationService.ensureCustomer(
                botId,
                numericSenderId, // Fallback Hash = Numeric
                numericSenderId,
                message.sender.name,
                message.sender.avatar,
              );
            }
          } catch (e) {
            console.error("[Pipeline] Fetch Sender Error:", e);
          }
        }
        // Nếu vẫn null sau khi cố gắng tạo (hiếm), dùng fallback string (không khuyến khích)
        senderUUID = custUUID || numericSenderId;
      }

      // --- BƯỚC 3: ATOMIC INSERT (FIXED SENDER_ID) ---
      const msgType = (message.content as { type?: string }).type || "unknown";

      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        zalo_msg_id: message.msgId, // ID tin nhắn (để deduplicate)
        bot_ids: [botId], // Đánh dấu bot này đã thấy tin

        // [CRITICAL FIX] Sử dụng UUID chuẩn hóa thay vì Raw ID
        sender_id: senderUUID,
        sender_type: senderType,
        staff_id: null,

        content: message.content,
        raw_content: rawMsg,
        msg_type: msgType,
        sent_at: new Date(message.timestamp).toISOString(),
      });

      if (!insertError) {
        console.log(`[Pipeline] ✅ Saved Msg ${message.msgId}`);
        // Update Activity Time
        await supabase
          .from("conversations")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", conversationUUID);
      } else if (insertError.code === "23505") {
        // Duplicate Key -> Merge Bot ID
        console.log(
          `[Pipeline] 🔄 Duplicate Msg ${message.msgId}. Merging BotID...`,
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
              `[Pipeline] 🔗 Merged Bot ${botId} into Msg ${message.msgId}`,
            );
          }
        } else {
          console.warn(
            `[Pipeline] ⚠️ Duplicate error but msg not found? MsgId: ${message.msgId}`,
          );
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
