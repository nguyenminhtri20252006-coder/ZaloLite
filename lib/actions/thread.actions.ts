"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ThreadType } from "@/lib/types/zalo.types";

/**
 * Lấy chi tiết thành viên của một nhóm (cho Sidebar)
 */
export async function getGroupMembersAction(botId: string, groupId: string) {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);

    // 1. Lấy thông tin nhóm để có danh sách ID thành viên
    const groupInfo: any = await api.getGroupInfo([groupId]);
    const groupData = groupInfo.gridInfoMap?.[groupId];

    if (!groupData || !groupData.memVerList) {
      return [];
    }

    // 2. Lấy profile chi tiết của thành viên (Chunking nếu cần, ở đây làm đơn giản)
    // Giới hạn lấy 50 thành viên đầu tiên để tối ưu UI sidebar
    const memberIds = groupData.memVerList.slice(0, 50);
    const profilesRes: any = await api.getGroupMembersInfo(memberIds);

    return Object.values(profilesRes.profiles || {});
  } catch (error: any) {
    console.error("[ThreadAction] Get Members Error:", error);
    return [];
  }
}

/**
 * Rời nhóm
 */
export async function leaveGroupAction(botId: string, groupId: string) {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    await api.leaveGroup(groupId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Xóa bạn bè
 */
export async function removeFriendAction(botId: string, userId: string) {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    await api.removeFriend(userId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
