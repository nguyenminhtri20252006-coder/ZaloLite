/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import {
  GroupInfoResponse,
  GetGroupMembersInfoResponse,
} from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer";

// --- HELPERS ---

async function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (error) {
    throw new Error(`Bot connection not found for ID: ${botId}`);
  }
}

/**
 * [REFACTORED V6] Lấy thông tin chi tiết hội thoại
 * Sử dụng conversation_members để xác định external_thread_id thay vì bảng mappings cũ.
 */
export async function getThreadDetailsAction(botId: string, threadId: string) {
  try {
    // 1. Tìm Conversation ID từ Routing Key (threadId)
    // Ưu tiên tìm trong conversation_members của Bot để lấy ID thực tế mà Bot đang dùng để chat
    const { data: member } = await supabase
      .from("conversation_members")
      .select("conversation_id, thread_id")
      .eq("identity_id", botId)
      .eq("thread_id", threadId)
      .single();

    // Fallback: Tìm theo global_group_id nếu là Group
    let conversationId = member?.conversation_id;
    let externalId = member?.thread_id; // Đây chính là ID dùng để gọi API Zalo

    if (!conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, global_group_id")
        .eq("global_group_id", threadId)
        .single();

      if (conv) {
        conversationId = conv.id;
        externalId = conv.global_group_id;
      }
    }

    if (!conversationId) throw new Error("Conversation not found");

    // 2. Lấy thông tin chi tiết từ bảng conversations
    const { data: convInfo } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (!convInfo) throw new Error("Conversation Data Missing");

    let extraInfo: any = {};

    // 3. Nếu là Group -> Gọi API Zalo để lấy realtime info (Admin, Member Count)
    // Điều kiện: Phải có botId active và externalId hợp lệ
    if (convInfo.type === "group" && botId && externalId) {
      try {
        const api = BotRuntimeManager.getInstance().getBotAPI(botId);
        // Gọi API lấy info nhóm
        const groupInfoRes = (await api.getGroupInfo([
          externalId,
        ])) as unknown as GroupInfoResponse;

        const gData = groupInfoRes?.gridInfoMap?.[externalId];

        if (gData) {
          extraInfo = {
            admins: gData.adminIds || [],
            membersCount: gData.totalMember || 0,
            desc: gData.desc,
            // Map thêm các trường khác nếu cần
          };
        }
      } catch (e) {
        console.warn("[ThreadAction] Fetch Group API Failed (Non-fatal):", e);
        // Không throw lỗi để vẫn hiển thị được thông tin từ DB
      }
    }

    return {
      success: true,
      data: {
        ...convInfo,
        ...extraInfo,
        externalId: externalId, // Trả về để Client biết ID thực tế
      },
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { success: false, error: err };
  }
}

/**
 * Lấy chi tiết thành viên của một nhóm (cho Sidebar bên phải)
 */
export async function getGroupMembersAction(botId: string, groupId: string) {
  try {
    const api = await getBotAPI(botId);

    // 1. Lấy danh sách ID thành viên
    const groupInfo = (await api.getGroupInfo([
      groupId,
    ])) as unknown as GroupInfoResponse;
    const groupData = groupInfo.gridInfoMap?.[groupId];

    if (!groupData || !groupData.memVerList) {
      return [];
    }

    // 2. Lấy Profile chi tiết (Batch 50 người)
    // Zalo API giới hạn, nên chỉ lấy 50 người đầu tiên cho UI đỡ lag
    const memberIds = groupData.memVerList.slice(0, 50);

    const profilesRes = (await api.getGroupMembersInfo(
      memberIds,
    )) as unknown as GetGroupMembersInfoResponse;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = (profilesRes as any).profiles || profilesRes; // Fallback structure check

    return Object.values(profiles || {});
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
    const api = await getBotAPI(botId);
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
    const api = await getBotAPI(botId);
    await api.removeFriend(userId);
    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { success: false, error: err };
  }
}
