"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";

// --- Types ---
export interface DebugResponse {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestPayload?: any;
}

// Helper để xử lý lỗi unknown từ catch block an toàn
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * DEBUG USER ACTION
 */
export async function inspectUserAction(
  botId: string,
  payload: { userId?: string; phoneNumber?: string },
): Promise<DebugResponse> {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    const result: Record<string, unknown> = {};

    // 1. Phone Lookup
    if (payload.phoneNumber) {
      try {
        const phoneData = await api.findUser(payload.phoneNumber);
        result.phoneLookup = phoneData || "Not Found";

        // Auto-fill uid if found
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safePhoneData = phoneData as any;
        if (safePhoneData && safePhoneData.uid && !payload.userId) {
          payload.userId = safePhoneData.uid;
        }
      } catch (e: unknown) {
        result.phoneLookup = { error: getErrorMessage(e) };
      }
    }

    // 2. Profile & Relation
    if (payload.userId) {
      try {
        const [profileRes, relationRes] = await Promise.all([
          api.getUserInfo(payload.userId),
          api.getFriendRequestStatus(payload.userId),
        ]);

        result.rawProfileResponse = profileRes;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safeProfileRes = profileRes as any;
        result.profile = safeProfileRes.changed_profiles
          ? safeProfileRes.changed_profiles[payload.userId]
          : null;

        result.relationship = relationRes;
      } catch (e: unknown) {
        result.userError = getErrorMessage(e);
      }
    }

    return {
      success: true,
      data: result,
      requestPayload: { botId, ...payload },
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * DEBUG GROUP ACTION
 */
export async function inspectGroupAction(
  botId: string,
  groupId: string,
  targetMemberId?: string,
): Promise<DebugResponse> {
  try {
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    const result: Record<string, unknown> = {};

    // 1. Group Metadata & Admin Lists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let groupData: any = null;

    try {
      const groupRes = await api.getGroupInfo(groupId);
      result.rawGroupResponse = groupRes;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const safeGroupRes = groupRes as any;
      groupData = safeGroupRes.gridInfoMap
        ? safeGroupRes.gridInfoMap[groupId]
        : null;

      result.groupInfo = groupData;
    } catch (e: unknown) {
      result.groupError = getErrorMessage(e);
    }

    // 2. Member Role Check (Manual Calculation)
    try {
      const memberToCheck = targetMemberId || api.getOwnId();

      // [FIX] Chỉ truyền 1 tham số là mảng ID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memberRes: any = await api.getGroupMembersInfo([memberToCheck]);

      // Tự tính toán Role dựa trên danh sách Admin/Creator lấy được ở bước 1
      let calculatedRole = "Unknown (No Group Info)";

      if (groupData) {
        // Chuẩn hóa thành mảng string (đề phòng API trả về string đơn lẻ)
        const admins = Array.isArray(groupData.adminId)
          ? groupData.adminId
          : [groupData.adminId];
        const creators = Array.isArray(groupData.creatorId)
          ? groupData.creatorId
          : [groupData.creatorId];
        // Lưu ý: creatorId trong response group thường chứa danh sách Phó nhóm (Deputies)

        if (admins.includes(memberToCheck)) {
          calculatedRole = "Admin (Trưởng nhóm)";
        } else if (creators.includes(memberToCheck)) {
          calculatedRole = "Deputy (Phó nhóm)";
        } else {
          calculatedRole = "Member (Thành viên)";
        }
      }

      result.memberRoleCheck = {
        targetId: memberToCheck,
        profileRaw: memberRes,
        roleAnalysis: calculatedRole,
      };
    } catch (e: unknown) {
      result.memberError = getErrorMessage(e);
    }

    return {
      success: true,
      data: result,
      requestPayload: { botId, groupId, targetMemberId },
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
