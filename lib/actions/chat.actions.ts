"use server";

/**
 * lib/actions/chat.actions.ts
 * [REFACTORED] Hỗ trợ Multi-Bot thông qua BotRuntimeManager.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ThreadInfo, ThreadType } from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer";
import { SenderService } from "@/lib/core/services/sender-service";
import { ConversationService } from "@/lib/core/services/conversation-service";

/**
 * Helper: Lấy API của Bot và xử lý lỗi chung
 */
function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (e: any) {
    throw new Error(`Lỗi Bot (${botId}): ${e.message}`);
  }
}

/**
 * Lấy danh sách hội thoại của Bot
 */
export async function getThreadsAction(botId: string): Promise<ThreadInfo[]> {
  if (!botId) return [];

  try {
    const api = getBotAPI(botId);

    // Gọi song song lấy bạn bè và nhóm
    const [friends, rawGroupsData] = await Promise.all([
      api.getAllFriends(),
      api.getAllGroups(),
    ]);

    // Map Bạn bè
    const friendThreads: ThreadInfo[] = friends.map((u: any) => ({
      id: u.userId,
      name: u.displayName || u.zaloName || "Unknown",
      avatar: u.avatar,
      type: 0, // User
    }));

    // Map Nhóm
    const groupIds = Object.keys(rawGroupsData.gridVerMap || {});
    const groupThreads: ThreadInfo[] = groupIds.map((gid) => ({
      id: gid,
      name: `Group ${gid.slice(0, 6)}...`,
      avatar: "",
      type: 1, // Group
    }));

    // TODO: Implement batch getGroupInfo here for better UX

    return [...friendThreads, ...groupThreads];
  } catch (error: any) {
    console.error("[ChatAction] getThreads Error:", error);
    return [];
  }
}

/**
 * [NEW] Lấy lịch sử tin nhắn từ DB
 */
export async function getMessagesAction(botId: string, threadId: string) {
  // 1. Tìm Conversation ID từ mapping
  const { data: mapping } = await supabase
    .from("zalo_conversation_mappings")
    .select("conversation_id")
    .eq("bot_id", botId)
    .eq("external_id", threadId)
    .single();

  if (!mapping) return [];

  // 2. Query Messages
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", mapping.conversation_id)
    .order("sent_at", { ascending: true })
    .limit(50);

  // 3. Map về format ZaloMessage cho UI dùng lại
  return (
    messages?.map((msg) => ({
      type: 0,
      threadId: threadId,
      isSelf: msg.sender_type === "staff_on_bot",
      data: {
        msgId: msg.zalo_msg_id,
        cliMsgId: msg.zalo_msg_id, // <--- BỔ SUNG: Dùng msgId làm fallback
        content: msg.content,
        ts: new Date(msg.sent_at).getTime().toString(),
        uidFrom: msg.sender_id,
        dName: "",
        msgType:
          msg.content.type === "text" ? "webchat" : `chat.${msg.content.type}`,
      },
    })) || []
  );
}

/**
 * [UPDATED] Gửi tin nhắn và Lưu DB kèm Staff ID
 */
export async function sendMessageAction(
  staffId: string, // [NEW] Nhận Staff ID
  botId: string,
  content: string,
  threadId: string,
  type: ThreadType,
) {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);

    // Inject API vào SenderService (nếu chưa có)
    const sender = SenderService.getInstance();
    sender.setApi(api);

    const isGroup = type === ThreadType.Group;

    // 1. Gửi tin nhắn qua Zalo API
    // Kết quả trả về thường chứa msgId (tùy version zca-js)
    const result: any = await sender.sendText(content, threadId, isGroup);

    // Fallback nếu api không trả msgId ngay lập tức (dùng timestamp)
    const zaloMsgId = result.msgId || result.id || `sent_${Date.now()}`;

    // 2. Đảm bảo Conversation tồn tại trong DB
    // (Vì có thể đây là lần đầu tiên bot chủ động nhắn tin cho khách)
    const conversationUUID = await ConversationService.ensureConversation(
      botId,
      threadId,
      isGroup,
      "Unknown Conversation",
    );

    if (conversationUUID) {
      // 3. Lưu tin nhắn vào DB ngay lập tức (Ghi nhận Staff)
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        sender_type: "staff_on_bot",
        sender_id: botId, // Bot là người gửi (về mặt kỹ thuật)
        staff_id: staffId, // [QUAN TRỌNG] Người bấm nút là Staff
        content: { type: "text", text: content }, // Chuẩn hóa JSON content
        zalo_msg_id: zaloMsgId,
        sent_at: new Date().toISOString(),
      });

      if (error)
        console.error("[ChatAction] Failed to save sent message:", error);
    }

    return { success: true };
  } catch (error: any) {
    console.error("[ChatAction] Send Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Gửi Sticker
 */
export async function sendStickerAction(
  botId: string,
  stickerId: number,
  cateId: number,
  threadId: string,
  type: ThreadType,
) {
  try {
    const api = getBotAPI(botId);
    await api.sendSticker(
      {
        id: stickerId,
        cateId: cateId,
        type: 1, // <-- Added this field
      },
      threadId,
      type === ThreadType.Group ? 1 : 0,
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Bật/Tắt chế độ Echo (Bot nhại) - Lưu ý: Logic này nên chuyển vào DB hoặc Runtime State
 * Hiện tại tạm thời bỏ qua hoặc implement đơn giản.
 */
export async function setEchoBotStateAction(isEnabled: boolean) {
  // Logic Echo Bot nên được gắn với từng Bot ID cụ thể trong RuntimeManager
  // Hiện tại để trống để tránh lỗi build
  console.log("Set Echo State:", isEnabled);
}
