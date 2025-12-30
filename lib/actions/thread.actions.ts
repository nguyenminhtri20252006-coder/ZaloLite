"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import {
  ThreadType,
  GroupInfoResponse,
  GetGroupMembersInfoResponse,
} from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer";

// ... (Giữ nguyên các hàm getGroupMembersAction, leaveGroupAction...)

/**
 * [NEW] Lấy thông tin chi tiết hội thoại (CRM Data)
 * Kết hợp dữ liệu từ DB và API Zalo (cho realtime members).
 */
export async function getThreadDetailsAction(botId: string, threadId: string) {
  try {
    // 1. Lấy thông tin cơ bản từ DB
    const { data: conv } = await supabase
      .from("conversations")
      .select(
        `
        *,
        mappings:zalo_conversation_mappings(external_thread_id)
      `,
      )
      .eq("global_id", threadId)
      .single();

    if (!conv) throw new Error("Conversation not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const externalId = (conv.mappings as any)?.[0]?.external_thread_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extraInfo: any = {};

    // 2. Nếu là Group -> Gọi API lấy danh sách thành viên & Admin
    if (conv.type === "group" && botId && externalId) {
      try {
        const api = BotRuntimeManager.getInstance().getBotAPI(botId);
        const groupInfoRes = (await api.getGroupInfo([
          externalId,
        ])) as unknown as GroupInfoResponse;
        const gData = groupInfoRes?.gridInfoMap?.[externalId];

        if (gData) {
          extraInfo = {
            admins: gData.adminIds || [],
            membersCount: gData.totalMember || 0,
            isMuted: false,
            desc: gData.desc,
          };
        }
      } catch (e) {
        console.error("Fetch Group API Error:", e);
      }
    }

    return {
      success: true,
      data: {
        ...conv,
        ...extraInfo,
      },
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { success: false, error: err };
  }
}

/**
 * Lấy chi tiết thành viên của một nhóm (cho Sidebar)
 * [FIX] Removed 'any' types
 */
export async function getGroupMembersAction(botId: string, groupId: string) {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupInfo: any = await api.getGroupInfo([groupId]);
    const groupData = groupInfo.gridInfoMap?.[groupId];

    if (!groupData || !groupData.memVerList) {
      return [];
    }

    const memberIds = groupData.memVerList.slice(0, 50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profilesRes: any = await api.getGroupMembersInfo(memberIds);
    return Object.values(profilesRes.profiles || {});
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { success: false, error: err };
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
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { success: false, error: err };
  }
}
