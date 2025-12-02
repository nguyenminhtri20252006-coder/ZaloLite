"use server";

/**
 * lib/actions/chat.actions.ts
 * [REFACTORED] Hỗ trợ Multi-Bot thông qua BotRuntimeManager.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ThreadInfo, ThreadType, MessageContent } from "@/lib/types/zalo.types";

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
    // Lưu ý: zca-js trả về gridVerMap hoặc gridInfoMap tùy version
    // Ở đây ta giả định lấy ID và map đơn giản. Nếu cần tên nhóm chính xác,
    // cần gọi getGroupInfo cho từng nhóm (hoặc batch).
    // Để tối ưu tốc độ list, ta tạm lấy ID làm tên nếu chưa có cache.
    const groupIds = Object.keys(rawGroupsData.gridVerMap || {});

    // Tối ưu: Chỉ lấy Group ID trước, UI sẽ fetch detail sau hoặc cache
    // Tuy nhiên để demo chạy được, ta trả về danh sách ID
    const groupThreads: ThreadInfo[] = groupIds.map((gid) => ({
      id: gid,
      name: `Group ${gid.slice(0, 6)}...`, // Placeholder
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
 * Gửi tin nhắn
 */
export async function sendMessageAction(
  botId: string,
  content: string | MessageContent,
  threadId: string,
  type: ThreadType,
) {
  try {
    const api = getBotAPI(botId);

    // Gọi hàm sendMessage của zca-js
    const result = await api.sendMessage(
      content,
      threadId,
      type === ThreadType.Group ? 1 : 0,
    );

    return { success: true, data: result };
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
