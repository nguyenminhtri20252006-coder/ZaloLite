"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import {
  ZaloUserResult,
  GetFriendRecommendationsResponse,
  GetSentFriendRequestResponse,
} from "@/lib/types/zalo.types";

async function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (error) {
    throw new Error(`Bot connection not found for ID: ${botId}`);
  }
}

// Helper debug
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debugLog(step: string, data: any) {
  console.log(
    `[DEBUG-FRIEND] ${step}:`,
    typeof data === "object" ? JSON.stringify(data, null, 2) : data,
  );
}

// --- ACTIONS ---

export async function findUserAction(
  botId: string,
  phoneNumber: string,
): Promise<{ success: boolean; data?: ZaloUserResult; error?: string }> {
  try {
    debugLog("FindUser Start", { botId, phoneNumber });
    const api = await getBotAPI(botId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await api.findUser(phoneNumber);

    if (!res)
      return { success: false, error: "Không tìm thấy (hoặc bị chặn)." };

    // Ưu tiên uid -> userId -> id
    const rawId = res.uid || res.userId || res.id || res.userKey;
    const cleanId = rawId ? String(rawId).replace(/[^0-9]/g, "") : "";

    const data: ZaloUserResult = {
      userId: cleanId,
      displayName: res.displayName || res.name || res.display_name || "Unknown",
      avatar: res.avatar || "",
      zaloName: res.zaloName || res.zalo_name || "",
      gender: res.gender ?? 0,
      phoneNumber: res.phoneNumber || phoneNumber,
      raw: res,
    };
    return { success: true, data };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function sendFriendRequestAction(
  botId: string,
  userId: string,
  msg: string = "Kết bạn nhé!",
) {
  try {
    const validUserId = String(userId).replace(/[^0-9]/g, "");
    if (validUserId.length < 5) throw new Error(`ID không hợp lệ: ${userId}`);

    const message = msg && msg.trim().length > 0 ? msg.trim() : "Kết bạn nhé!";
    const api = await getBotAPI(botId);

    console.log(
      `[ACTION] Sending Friend Request: Msg="${message}", To="${validUserId}"`,
    );

    // [FIX] Đảo ngược tham số: (message, userId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api as any).sendFriendRequest(message, validUserId);

    return { success: true };
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: any = error;
    console.error("[ERROR] Send Friend Request:", err);

    if (err?.code === 114) {
      return {
        success: false,
        error: "Lỗi 114: Tham số không hợp lệ (Sai ID hoặc Message).",
      };
    }
    return { success: false, error: err.message || "Lỗi không xác định." };
  }
}

export async function getFriendListAction(botId: string) {
  try {
    const api = await getBotAPI(botId);
    const friends = await api.getAllFriends();
    return { success: true, data: friends };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

// [MISSING METHOD RESTORED]
export async function getFriendRecommendationsAction(botId: string): Promise<{
  success: boolean;
  data?: GetFriendRecommendationsResponse;
  error?: string;
}> {
  try {
    const api = await getBotAPI(botId);
    const res = await api.getFriendRecommendations();
    return { success: true, data: res };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message, data: { recommItems: [] } };
  }
}

export async function getSentFriendRequestAction(botId: string) {
  try {
    const api = await getBotAPI(botId);
    // Hàm này trả về danh sách lời mời MÌNH đã gửi đi
    const res = await api.getSentFriendRequest();

    // Convert Object/Map -> Array để UI dễ render
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: any[] = [];
    if (res && typeof res === "object") {
      list = Object.values(res);
    }
    return { success: true, data: list };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

// [NEW] Lấy danh sách lời mời nhận được (Incoming)
export async function getIncomingFriendRequestAction(botId: string) {
  try {
    const api = await getBotAPI(botId);
    // Thử gọi hàm getFriendRequestList (nếu có trong version ZCA này)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiAny = api as any;

    if (typeof apiAny.getFriendRequestList === "function") {
      const res = await apiAny.getFriendRequestList();
      return { success: true, data: Array.isArray(res) ? res : [] };
    } else {
      // Fallback: Nếu không có API này, trả về rỗng và warning
      console.warn("[WARN] ZCA version này không hỗ trợ getFriendRequestList");
      return {
        success: true,
        data: [],
        warning: "API không hỗ trợ lấy Incoming Requests",
      };
    }
  } catch (error: unknown) {
    // Không throw lỗi để tránh crash UI, chỉ log warning
    console.warn("Error fetching incoming requests:", error);
    return { success: true, data: [] };
  }
}

export async function handleFriendAction(
  botId: string,
  userId: string,
  type: "accept" | "reject" | "undo" | "remove" | "block" | "unblock",
) {
  try {
    const api = await getBotAPI(botId);
    const uid = String(userId).replace(/[^0-9]/g, "");

    switch (type) {
      case "accept":
        await api.acceptFriendRequest(uid);
        break;
      case "reject":
        await api.rejectFriendRequest(uid);
        break;
      case "undo":
        await api.undoFriendRequest(uid);
        break;
      case "remove":
        await api.removeFriend(uid);
        break;
      case "block":
        await api.blockUser(uid);
        break;
      case "unblock":
        await api.unblockUser(uid);
        break;
    }
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}
