/* eslint-disable @typescript-eslint/no-explicit-any */
import supabase from "@/lib/supabaseServer";
import { DebugLogger } from "@/lib/utils/debug-logger";

export class SimpleMessagePipeline {
  /**
   * Xử lý tin nhắn thô và lưu vào Database
   */
  public async process(botId: string, rawMsg: any) {
    try {
      const data = rawMsg.data || {};

      // 1. EXTRACTION (Trích xuất dữ liệu)
      // Dựa trên mẫu JSON: threadId nằm ở root, uidFrom nằm ở data

      const msgType = data.msgType || "unknown"; // "webchat", "chat.photo", etc.
      const uidFrom = data.uidFrom || data.id; // Sender ID (Local)

      // Resolve Thread ID
      // Ưu tiên 1: Root threadId (Có trong Private Chat payload mẫu)
      // Ưu tiên 2: data.sourceId (Thường là Group ID)
      // Ưu tiên 3: uidFrom (Fallback cho private chat cũ)
      let threadId = rawMsg.threadId;

      if (!threadId || threadId === "0") {
        threadId = data.sourceId;
      }
      if (!threadId || threadId === "0") {
        // Logic fallback: Nếu bot tự nhắn (isSelf=true hoặc uidFrom=botId) -> threadId = idTo
        // Ngược lại -> threadId = uidFrom
        if (rawMsg.isSelf || uidFrom === botId) {
          threadId = data.idTo;
        } else {
          threadId = uidFrom;
        }
      }

      // Msg ID
      const zaloMsgId = data.msgId || data.cliMsgId || `${Date.now()}`;

      DebugLogger.logPipeline("Extract", `Resolved IDs`, {
        uidFrom,
        threadId,
        zaloMsgId,
        msgType,
      });

      if (!uidFrom || !threadId) {
        DebugLogger.logPipeline(
          "Error",
          "Skipped: Missing uidFrom or threadId",
        );
        return;
      }

      // 2. ROUTING (Định tuyến)
      // Tìm conversation_members để lấy UUID Conversation
      const { data: member } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("identity_id", botId)
        .eq("thread_id", threadId)
        .single();

      if (!member) {
        DebugLogger.logPipeline(
          "Error",
          `⚠️ Thread ${threadId} not found in DB for Bot ${botId}. Sync required.`,
        );
        return;
      }
      const conversationId = member.conversation_id;

      // 3. SENDER RESOLUTION (Xác định người gửi)
      let senderIdentityId: string | null = null;
      let senderType = "customer";

      if (rawMsg.isSelf || uidFrom === "0" || uidFrom === botId) {
        senderIdentityId = botId;
        senderType = "bot";
      } else {
        // Tìm khách hàng trong bảng connection
        const { data: conn } = await supabase
          .from("zalo_connections")
          .select("target_id")
          .eq("observer_id", botId)
          .eq("external_uid", uidFrom)
          .single();

        if (conn) {
          senderIdentityId = conn.target_id;
        } else {
          DebugLogger.logPipeline(
            "Warning",
            `Unknown Sender ${uidFrom}. No connection found.`,
          );
          // Vẫn lưu tin nhắn nhưng không có sender_identity_id (sẽ hiện "Unknown" ở UI)
        }
      }

      // 4. CONTENT CONSTRUCTION (Xây dựng nội dung)
      let normalizedContent: any = { type: "text", data: { text: "" } };

      // Xử lý cơ bản các loại tin nhắn
      if (msgType === "webchat" || msgType === "chat.text") {
        normalizedContent = {
          type: "text",
          data: { text: data.content },
        };
      } else if (msgType === "chat.photo") {
        normalizedContent = {
          type: "image",
          data: {
            url: data.url || data.href, // Zalo có thể trả về nhiều kiểu
            caption: data.caption,
          },
        };
      } else if (msgType === "chat.sticker") {
        normalizedContent = {
          type: "sticker",
          data: {
            url: data.url || data.stickerUrl,
          },
        };
      } else {
        // Fallback: Hiển thị thô cho các loại chưa support
        normalizedContent = {
          type: "text",
          data: { text: `[${msgType}] ${data.content || ""}` },
        };
      }

      // Đính kèm raw data để debug
      normalizedContent.data.raw_debug = data;

      // 5. PERSISTENCE (Lưu DB)
      const payload = {
        conversation_id: conversationId,
        zalo_msg_id: String(zaloMsgId),
        sender_identity_id: senderIdentityId,
        sender_type: senderType,
        content: normalizedContent,
        raw_content: rawMsg,
        sent_at: new Date(Number(data.ts || Date.now())).toISOString(),
        created_at: new Date().toISOString(),
        listening_bot_ids: [botId],
      };

      // Upsert: Nếu trùng msgId thì update (ví dụ update listening_bot_ids nếu cần)
      const { error } = await supabase
        .from("messages")
        .upsert(payload, { onConflict: "conversation_id, zalo_msg_id" });

      if (error) {
        DebugLogger.logPipeline("Error", `DB Insert Failed`, error.message);
      } else {
        DebugLogger.logPipeline("Success", `✅ Saved Message ${zaloMsgId}`);

        // Update Last Message snippet
        await supabase
          .from("conversations")
          .update({
            last_activity_at: new Date().toISOString(),
            last_message: normalizedContent,
          })
          .eq("id", conversationId);
      }
    } catch (e: any) {
      DebugLogger.logPipeline("Critical", `Exception`, e);
    }
  }
}
