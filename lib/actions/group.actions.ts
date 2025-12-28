"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import {
  CreateGroupOptions,
  GroupInviteBoxParams,
  ReviewPendingMemberRequestResponse,
} from "@/lib/types/zalo.types";

async function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (error) {
    throw new Error(`Bot connection not found for ID: ${botId}`);
  }
}

export async function createGroupAction(
  botId: string,
  payload: { name: string; members: string[]; options?: CreateGroupOptions },
) {
  try {
    const api = await getBotAPI(botId);
    const groupParams = {
      groupName: payload.name,
      members: payload.members,
      ...payload.options,
    };
    const res = await api.createGroup(
      groupParams as unknown as CreateGroupOptions,
    );
    return { success: true, data: res };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function getAllGroupsAction(botId: string) {
  try {
    const api = await getBotAPI(botId);
    const rawGroups = await api.getAllGroups();

    // [CRITICAL FIX] Convert Data to Array Strictly
    let groups: { groupId: string; version: string }[] = [];

    if (rawGroups instanceof Map) {
      groups = Array.from(rawGroups.entries()).map(([id, ver]) => ({
        groupId: String(id),
        version: typeof ver === "string" ? ver : JSON.stringify(ver),
      }));
    } else if (
      typeof rawGroups === "object" &&
      rawGroups !== null &&
      !Array.isArray(rawGroups)
    ) {
      groups = Object.entries(rawGroups).map(([id, ver]) => ({
        groupId: String(id),
        version: typeof ver === "string" ? ver : JSON.stringify(ver),
      }));
    } else if (Array.isArray(rawGroups)) {
      // [FIX] Ép kiểu rawGroups thành any[] để tránh lỗi 'never' của TypeScript
      // do suy diễn luồng điều khiển (control flow analysis)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      groups = (rawGroups as any[]).map((g) => {
        if (typeof g === "string") return { groupId: g, version: "unknown" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { groupId: (g as any).id || "unknown", version: "unknown" };
      });
    }

    return { success: true, data: groups };
  } catch (error: unknown) {
    const err = error as Error;
    // Return empty array on error to prevent UI crash
    return { success: false, error: err.message, data: [] };
  }
}

export async function joinGroupByLinkAction(botId: string, link: string) {
  try {
    const api = await getBotAPI(botId);
    const res = await api.joinGroupLink(link);
    return { success: true, data: res };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function getGroupInvitesAction(
  botId: string,
  params?: GroupInviteBoxParams,
) {
  try {
    const api = await getBotAPI(botId);
    const res = await api.getGroupInviteBoxList(params);
    const data = Array.isArray(res) ? res : [];
    return { success: true, data };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message, data: [] };
  }
}

export async function handleGroupInviteAction(
  botId: string,
  inviteId: string,
  action: "join" | "delete",
) {
  try {
    const api = await getBotAPI(botId);
    if (action === "join") await api.joinGroupInviteBox(inviteId);
    else await api.deleteGroupInviteBox(inviteId);
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function reviewGroupMemberAction(
  botId: string,
  groupId: string,
  userIds: string[],
  isApprove: boolean,
) {
  try {
    const api = await getBotAPI(botId);
    type CorrectApiSignature = {
      reviewPendingMemberRequest: (
        groupId: string,
        userIds: string[],
        action: 0 | 1,
      ) => Promise<ReviewPendingMemberRequestResponse>;
    };
    const res = await (
      api as unknown as CorrectApiSignature
    ).reviewPendingMemberRequest(groupId, userIds, isApprove ? 1 : 0);
    return { success: true, data: res };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}
