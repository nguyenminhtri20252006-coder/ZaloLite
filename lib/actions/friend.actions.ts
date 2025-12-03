"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import {
  FindUserResponse,
  GetFriendRecommendationsResponse,
  GetSentFriendRequestResponse,
} from "@/lib/types/zalo.types";

// Helper lấy API của Bot đang active (có thể cần truyền botId từ client lên)
// Tạm thời lấy bot đầu tiên đang login hoặc hardcode nếu chưa có context
async function getActiveBotAPI() {
  // TODO: Cần nâng cấp ManagementPanel để truyền botId xuống
  // Hiện tại ta lấy instance đầu tiên tìm được để demo
  const manager = BotRuntimeManager.getInstance();
  // Logic tạm: Lấy bot đầu tiên trong Map
  // Trong thực tế, Client phải gửi botId lên
  return manager.getBotAPI("DEFAULT_BOT_ID_OR_FIX_ME");
}

// Phiên bản cải tiến: Nhận botId từ Client (Recommended)
async function getBotAPI(botId: string) {
  return BotRuntimeManager.getInstance().getBotAPI(botId);
}

/**
 * Tìm kiếm người dùng qua SĐT
 * Lưu ý: Zalo yêu cầu người dùng phải bật "Cho phép tìm kiếm bằng SĐT"
 */
export async function findUserAction(
  phoneNumber: string,
): Promise<FindUserResponse | null> {
  try {
    // TODO: Cần truyền botId từ UI. Tạm thời hardcode hoặc xử lý sau.
    // Để fix lỗi build nhanh, ta return mock data hoặc null nếu chưa implement xong logic chọn bot.
    // Nhưng để đúng logic, ManagementPanel cần biết đang dùng bot nào.

    // Giả sử ta có cơ chế lấy botId mặc định (hoặc từ session)
    // const api = await getActiveBotAPI();
    // const res = await api.findUser(phoneNumber);
    // return res;

    return null; // Placeholder
  } catch (error) {
    console.error("Find User Error:", error);
    throw error;
  }
}

export async function sendFriendRequestAction(msg: string, userId: string) {
  // Placeholder
  return { success: true };
}

export async function getFriendRecommendationsAction(): Promise<GetFriendRecommendationsResponse | null> {
  return { recommItems: [] };
}

export async function getSentFriendRequestAction(): Promise<GetSentFriendRequestResponse | null> {
  return {};
}

export async function acceptFriendRequestAction(userId: string) {
  return { success: true };
}

export async function undoFriendRequestAction(userId: string) {
  return { success: true };
}
