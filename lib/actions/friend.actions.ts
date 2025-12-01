"use server";

/**
 * lib/actions/friend.actions.ts
 *
 * Lớp Logic (Server Actions - Lớp 2) - Nghiệp vụ Quản lý Bạn bè.
 */
import { ZaloSingletonService } from "@/lib/runtime-service";
// SỬA ĐỔI: Import đúng các type đã định nghĩa trong file SSOT mới
import {
  FindUserResponse,
  User,
  GetFriendRecommendationsResponse,
  GetSentFriendRequestResponse,
  UserInfoResponse,
} from "@/lib/types/zalo.types";

/**
 * [API] Tìm kiếm người dùng bằng SĐT
 */
export async function findUserAction(
  phoneNumber: string,
): Promise<FindUserResponse> {
  console.log(`[Action] Yêu cầu findUserAction: ${phoneNumber}`);
  try {
    return await ZaloSingletonService.getInstance().findUser(phoneNumber);
  } catch (error: unknown) {
    console.error("[Action Error] findUserAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi tìm kiếm người dùng",
    );
  }
}

/**
 * [API] Gửi lời mời kết bạn
 */
export async function sendFriendRequestAction(
  msg: string,
  userId: string,
): Promise<void> {
  console.log(`[Action] Yêu cầu sendFriendRequestAction đến: ${userId}`);
  try {
    await ZaloSingletonService.getInstance().sendFriendRequest(msg, userId);
  } catch (error: unknown) {
    console.error("[Action Error] sendFriendRequestAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi gửi lời mời kết bạn",
    );
  }
}

/**
 * [API] Chấp nhận lời mời kết bạn
 */
export async function acceptFriendRequestAction(userId: string): Promise<void> {
  console.log(`[Action] Yêu cầu acceptFriendRequestAction từ: ${userId}`);
  try {
    await ZaloSingletonService.getInstance().acceptFriendRequest(userId);
  } catch (error: unknown) {
    console.error("[Action Error] acceptFriendRequestAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi chấp nhận lời mời",
    );
  }
}

/**
 * [API] Hủy (thu hồi) lời mời đã gửi
 */
export async function undoFriendRequestAction(friendId: string): Promise<void> {
  console.log(`[Action] Yêu cầu undoFriendRequestAction đến: ${friendId}`);
  try {
    await ZaloSingletonService.getInstance().undoFriendRequest(friendId);
  } catch (error: unknown) {
    console.error("[Action Error] undoFriendRequestAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi thu hồi lời mời",
    );
  }
}

/**
 * [API] Xóa bạn
 */
export async function removeFriendAction(friendId: string): Promise<void> {
  console.log(`[Action] Yêu cầu removeFriendAction: ${friendId}`);
  try {
    await ZaloSingletonService.getInstance().removeFriend(friendId);
  } catch (error: unknown) {
    console.error("[Action Error] removeFriendAction:", error);
    throw new Error(error instanceof Error ? error.message : "Lỗi xóa bạn");
  }
}

/**
 * [API] Chặn người dùng
 */
export async function blockUserAction(userId: string): Promise<void> {
  console.log(`[Action] Yêu cầu blockUserAction: ${userId}`);
  try {
    await ZaloSingletonService.getInstance().blockUser(userId);
  } catch (error: unknown) {
    console.error("[Action Error] blockUserAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi chặn người dùng",
    );
  }
}

/**
 * [API] Bỏ chặn người dùng
 */
export async function unblockUserAction(userId: string): Promise<void> {
  console.log(`[Action] Yêu cầu unblockUserAction: ${userId}`);
  try {
    await ZaloSingletonService.getInstance().unblockUser(userId);
  } catch (error: unknown) {
    console.error("[Action Error] unblockUserAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi bỏ chặn người dùng",
    );
  }
}

/**
 * [API] Lấy danh sách gợi ý kết bạn
 */
export async function getFriendRecommendationsAction(): Promise<GetFriendRecommendationsResponse> {
  console.log(`[Action] Yêu cầu getFriendRecommendationsAction`);
  try {
    // Sử dụng 'as' để ép kiểu nếu thư viện trả về 'any'
    return (await ZaloSingletonService.getInstance().getFriendRecommendations()) as unknown as GetFriendRecommendationsResponse;
  } catch (error: unknown) {
    console.error("[Action Error] getFriendRecommendationsAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy gợi ý kết bạn",
    );
  }
}

/**
 * [API] Lấy danh sách lời mời đã gửi
 */
export async function getSentFriendRequestAction(): Promise<GetSentFriendRequestResponse> {
  console.log(`[Action] Yêu cầu getSentFriendRequestAction`);
  try {
    return (await ZaloSingletonService.getInstance().getSentFriendRequest()) as unknown as GetSentFriendRequestResponse;
  } catch (error: unknown) {
    console.error("[Action Error] getSentFriendRequestAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy lời mời đã gửi",
    );
  }
}

/**
 * [API] Lấy TOÀN BỘ danh sách bạn bè (cho User Cache)
 */
export async function getAllFriendsAction(): Promise<User[]> {
  console.log(`[Action] Yêu cầu getAllFriendsAction (cho User Cache)`);
  try {
    return await ZaloSingletonService.getInstance().getAllFriends();
  } catch (error: unknown) {
    console.error("[Action Error] getAllFriendsAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy danh sách bạn bè",
    );
  }
}

export async function getUserInfoAction(
  userId: string,
): Promise<UserInfoResponse> {
  console.log(`[Action] Yêu cầu getUserInfoAction cho: ${userId}`);
  try {
    return await ZaloSingletonService.getInstance().getUserInfo(userId);
  } catch (error: unknown) {
    console.error("[Action Error] getUserInfoAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy thông tin user",
    );
  }
}
