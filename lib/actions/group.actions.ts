"use server";

/**
 * lib/actions/group.actions.ts
 * Lớp Logic (Server Actions) - Nghiệp vụ Quản lý Nhóm.
 * Đã được tái cấu trúc đầy đủ và định kiểu nghiêm ngặt.
 */

import { ZaloSingletonService } from "@/lib/runtime-service";
import {
  CreateGroupOptions,
  GetGroupLinkDetailResponse,
  ReviewPendingMemberRequestPayload,
  ReviewPendingMemberRequestResponse,
  UpdateGroupSettingsOptions,
  GroupInfoResponse,
  GetGroupMembersInfoResponse,
  GroupMemberProfile,
  GroupInviteBoxParams,
} from "@/lib/types/zalo.types";

export async function getPendingGroupMembersAction(groupId: string) {
  console.log(
    `[Action] Yêu cầu getPendingGroupMembersAction cho nhóm: '${groupId}' (Type: ${typeof groupId})`,
  );

  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    console.error("[Action Error] groupId không hợp lệ:", groupId);
    throw new Error("ID nhóm không hợp lệ (trống hoặc sai định dạng).");
  }

  try {
    const result =
      await ZaloSingletonService.getInstance().getPendingGroupMembers(groupId);
    console.log(
      `[Action] getPendingGroupMembersAction thành công. Kết quả:`,
      result ? "Có dữ liệu" : "Rỗng",
    );
    return result;
  } catch (error: unknown) {
    // Log toàn bộ lỗi object để debug
    console.error(
      "[Action Error] getPendingGroupMembersAction:",
      JSON.stringify(error, null, 2),
    );

    // Re-throw với message rõ ràng
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy danh sách chờ",
    );
  }
}
export async function createGroupAction(options: CreateGroupOptions) {
  console.log(`[Action] Yêu cầu createGroupAction: ${options.name}`);
  try {
    return await ZaloSingletonService.getInstance().createGroup(options);
  } catch (error: unknown) {
    console.error("[Action Error] createGroupAction:", error);
    throw new Error(error instanceof Error ? error.message : "Lỗi tạo nhóm");
  }
}

/**
 * [API] Lấy thông tin chi tiết (Info) của nhóm
 */
export async function getGroupInfoAction(
  groupId: string | string[],
): Promise<GroupInfoResponse> {
  console.log(`[Action] Yêu cầu getGroupInfoAction cho nhóm: ${groupId}`);
  try {
    // Đảm bảo đầu vào luôn là mảng
    const groupIds = Array.isArray(groupId) ? groupId : [groupId];
    return await ZaloSingletonService.getInstance().getGroupInfo(groupIds);
  } catch (error: unknown) {
    console.error("[Action Error] getGroupInfoAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy thông tin nhóm",
    );
  }
}

/**
 * [API] Lấy thông tin (Profile) của thành viên nhóm
 */
export async function getGroupMembersInfoAction(
  memberId: string | string[],
): Promise<GetGroupMembersInfoResponse> {
  console.log(`[Action] Yêu cầu getGroupMembersInfoAction cho: ${memberId}`);
  try {
    // FIX: Service mong đợi string[], cần chuyển đổi nếu đầu vào là string
    const memberIds = Array.isArray(memberId) ? memberId : [memberId];

    return await ZaloSingletonService.getInstance().getGroupMembersInfo(
      memberIds,
    );
  } catch (error: unknown) {
    console.error("[Action Error] getGroupMembersInfoAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy thông tin thành viên",
    );
  }
}

/**
 * [API] Quét thành viên nhóm (Kết hợp Info & Profile)
 * Dùng cho tính năng Cache
 */
export async function scanGroupMembersAction(
  groupId: string,
): Promise<Record<string, GroupMemberProfile>> {
  console.log(`[Action] Yêu cầu scanGroupMembersAction cho nhóm: ${groupId}`);
  const service = ZaloSingletonService.getInstance();
  try {
    // Bước 1: Lấy thông tin nhóm để có danh sách ID thành viên
    // FIX: Truyền mảng [groupId] thay vì string groupId
    const groupInfo = await service.getGroupInfo([groupId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupData = (groupInfo as any).gridInfoMap[groupId];

    if (!groupData || !groupData.memVerList) {
      // Trường hợp nhóm rỗng hoặc không lấy được list
      return {};
    }
    const memberIds = groupData.memVerList;

    if (memberIds.length === 0) {
      return {};
    }

    // Bước 2: Lấy thông tin profile của các thành viên
    const memberProfiles = await service.getGroupMembersInfo(memberIds);
    return memberProfiles.profiles; // Trả về Map { [uid]: profile }
  } catch (error: unknown) {
    console.error("[Action Error] scanGroupMembersAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi quét thành viên nhóm",
    );
  }
}

/**
 * [API] Rời khỏi nhóm
 */
export async function leaveGroupAction(
  groupId: string,
  silent?: boolean,
): Promise<void> {
  console.log(`[Action] Yêu cầu leaveGroupAction: ${groupId}`);
  try {
    await ZaloSingletonService.getInstance().leaveGroup(groupId, silent);
  } catch (error: unknown) {
    console.error("[Action Error] leaveGroupAction:", error);
    throw new Error(error instanceof Error ? error.message : "Lỗi rời nhóm");
  }
}

/**
 * [API] Giải tán nhóm
 */
export async function disperseGroupAction(groupId: string): Promise<void> {
  console.log(`[Action] Yêu cầu disperseGroupAction: ${groupId}`);
  try {
    await ZaloSingletonService.getInstance().disperseGroup(groupId);
  } catch (error: unknown) {
    console.error("[Action Error] disperseGroupAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi giải tán nhóm",
    );
  }
}

/**
 * [API] Thêm thành viên vào nhóm
 */
export async function addUserToGroupAction(
  memberId: string | string[],
  groupId: string,
) {
  console.log(`[Action] Yêu cầu addUserToGroupAction: thêm vào ${groupId}`);
  try {
    const members = Array.isArray(memberId) ? memberId : [memberId];
    return await ZaloSingletonService.getInstance().addUserToGroup(
      members,
      groupId,
    );
  } catch (error: unknown) {
    console.error("[Action Error] addUserToGroupAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi thêm thành viên",
    );
  }
}

/**
 * [API] Xóa thành viên khỏi nhóm
 */
export async function removeUserFromGroupAction(
  memberId: string | string[],
  groupId: string,
) {
  console.log(
    `[Action] Yêu cầu removeUserFromGroupAction: xóa khỏi ${groupId}`,
  );
  try {
    const members = Array.isArray(memberId) ? memberId : [memberId];
    return await ZaloSingletonService.getInstance().removeUserFromGroup(
      members,
      groupId,
    );
  } catch (error: unknown) {
    console.error("[Action Error] removeUserFromGroupAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi xóa thành viên",
    );
  }
}

/**
 * [API] Lấy danh sách lời mời vào nhóm (chờ duyệt)
 */
export async function getGroupInviteBoxListAction(
  payload?: GroupInviteBoxParams,
) {
  console.log(`[Action] Yêu cầu getGroupInviteBoxListAction`);
  try {
    return await ZaloSingletonService.getInstance().getGroupInviteBoxList(
      payload,
    );
  } catch (error: unknown) {
    console.error("[Action Error] getGroupInviteBoxListAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy danh sách lời mời",
    );
  }
}

/**
 * [API] Duyệt thành viên
 */
export async function reviewPendingMemberRequestAction(
  payload: ReviewPendingMemberRequestPayload,
  groupId: string,
) {
  try {
    return await ZaloSingletonService.getInstance().reviewPendingMemberRequest(
      payload,
      groupId,
    );
  } catch (error: unknown) {
    console.error("[Action Error] reviewPendingMemberRequestAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi duyệt thành viên",
    );
  }
}

/**
 * [API] Cập nhật cài đặt nhóm
 */
export async function updateGroupSettingsAction(
  options: UpdateGroupSettingsOptions,
  groupId: string,
) {
  console.log(
    `[Action] Yêu cầu updateGroupSettingsAction cho nhóm: ${groupId}`,
  );
  try {
    return await ZaloSingletonService.getInstance().updateGroupSettings(
      options,
      groupId,
    );
  } catch (error: unknown) {
    console.error("[Action Error] updateGroupSettingsAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi cập nhật cài đặt nhóm",
    );
  }
}

/**
 * [API] Lấy chi tiết link mời
 */
export async function getGroupLinkDetailAction(
  groupId: string,
): Promise<GetGroupLinkDetailResponse> {
  console.log(`[Action] Yêu cầu getGroupLinkDetailAction cho nhóm: ${groupId}`);
  try {
    return await ZaloSingletonService.getInstance().getGroupLinkDetail(groupId);
  } catch (error: unknown) {
    console.error("[Action Error] getGroupLinkDetailAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy chi tiết link",
    );
  }
}

/**
 * [API] Bật link mời nhóm
 */
export async function enableGroupLinkAction(groupId: string) {
  console.log(`[Action] Yêu cầu enableGroupLinkAction: ${groupId}`);
  try {
    return await ZaloSingletonService.getInstance().enableGroupLink(groupId);
  } catch (error: unknown) {
    console.error("[Action Error] enableGroupLinkAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi bật link nhóm",
    );
  }
}

/**
 * [API] Tắt link mời nhóm
 */
export async function disableGroupLinkAction(groupId: string): Promise<void> {
  console.log(`[Action] Yêu cầu disableGroupLinkAction: ${groupId}`);
  try {
    await ZaloSingletonService.getInstance().disableGroupLink(groupId);
  } catch (error: unknown) {
    console.error("[Action Error] disableGroupLinkAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi tắt link nhóm",
    );
  }
}

/**
 * [API] Chấp nhận lời mời vào nhóm
 */
export async function joinGroupInviteBoxAction(groupId: string): Promise<void> {
  console.log(`[Action] Yêu cầu joinGroupInviteBoxAction: ${groupId}`);
  try {
    await ZaloSingletonService.getInstance().joinGroupInviteBox(groupId);
  } catch (error: unknown) {
    console.error("[Action Error] joinGroupInviteBoxAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi chấp nhận lời mời nhóm",
    );
  }
}

/**
 * [API] Từ chối/Xóa lời mời vào nhóm
 */
export async function deleteGroupInviteBoxAction(
  groupId: string | string[],
  blockFutureInvite?: boolean,
) {
  console.log(`[Action] Yêu cầu deleteGroupInviteBoxAction: ${groupId}`);
  try {
    const gids = Array.isArray(groupId) ? groupId : [groupId];
    return await ZaloSingletonService.getInstance().deleteGroupInviteBox(
      gids,
      blockFutureInvite,
    );
  } catch (error: unknown) {
    console.error("[Action Error] deleteGroupInviteBoxAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi từ chối lời mời nhóm",
    );
  }
}

/**
 * [API] Lấy thông tin từ link mời (cho người ngoài nhóm)
 */
export async function getGroupLinkInfoAction(link: string) {
  console.log(`[Action] Yêu cầu getGroupLinkInfoAction: ${link}`);
  try {
    return await ZaloSingletonService.getInstance().getGroupLinkInfo(link);
  } catch (error: unknown) {
    console.error("[Action Error] getGroupLinkInfoAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi lấy thông tin link",
    );
  }
}
