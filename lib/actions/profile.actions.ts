/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ZaloUserProfile, ZaloSettingsResponse } from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer"; // Sử dụng Supabase Admin

// Helper để lấy API (Write Actions)
async function getBotAPI(botId: string) {
  try {
    // Cần đảm bảo botId ở đây là Identity ID để gọi Runtime
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (error) {
    throw new Error(
      `Bot chưa sẵn sàng (Offline). Vui lòng kiểm tra lại kết nối.`,
    );
  }
}

// [HELPER] Resolve Identity ID
async function resolveIdentityId(inputId: string): Promise<string | null> {
  const { data: byId } = await supabase
    .from("zalo_identities")
    .select("id")
    .eq("id", inputId)
    .maybeSingle();
  if (byId) return byId.id;

  const { data: byRef } = await supabase
    .from("zalo_identities")
    .select("id")
    .eq("ref_bot_id", inputId)
    .maybeSingle();
  if (byRef) return byRef.id;

  return null;
}

/**
 * [READ] Lấy thông tin Bot từ Database (Safe Mode + Smart Resolve)
 */
export async function getBotProfileAction(
  inputId: string,
): Promise<{ success: boolean; data?: ZaloUserProfile; error?: string }> {
  try {
    // 1. Resolve ID
    const botId = await resolveIdentityId(inputId);
    if (!botId) {
      return { success: false, error: "Bot không tồn tại hoặc đã bị xóa." };
    }

    // 2. Query Database
    const { data: identity, error } = await supabase
      .from("zalo_identities")
      .select(
        `
        zalo_global_id,
        display_name,
        avatar,
        raw_data,
        bot_info:ref_bot_id (
          status,
          access_token
        )
      `,
      )
      .eq("id", botId)
      .maybeSingle();

    if (error) {
      console.error("[Profile] DB Fetch Error:", error);
      return {
        success: false,
        error: "Lỗi truy vấn Database: " + error.message,
      };
    }

    if (!identity) {
      return { success: false, error: "Dữ liệu Bot không đồng bộ." };
    }

    // 3. Map Data
    const raw = (identity.raw_data as any) || {};
    const botInfo = (identity.bot_info as any) || {};

    let statusText = "---";
    if (typeof botInfo.status === "object" && botInfo.status?.message) {
      statusText = botInfo.status.message;
    }

    const profile: ZaloUserProfile = {
      userId: identity.zalo_global_id,
      displayName: identity.display_name || "Unknown Bot",
      zaloName: raw.zaloName || identity.display_name || "",
      avatar: identity.avatar || "",
      cover: raw.cover || "",
      gender: typeof raw.gender === "number" ? raw.gender : 0,
      dob: typeof raw.dob === "number" ? raw.dob : 0,
      sdob: raw.sdob || "",
      status: raw.status || statusText,
      phoneNumber: raw.phoneNumber || "Hidden",
    };

    return { success: true, data: profile };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Get Bot Profile Error:", err);
    return { success: false, error: err.message };
  }
}

export async function updateActiveStatusAction(
  botId: string,
  isActive: boolean,
) {
  try {
    const api = await getBotAPI(botId);
    await api.updateActiveStatus(isActive);
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function changeFriendAliasAction(
  botId: string,
  friendId: string,
  alias: string,
) {
  try {
    const api = await getBotAPI(botId);
    await api.changeFriendAlias(friendId, alias);
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function getBlockListAction(
  botId: string,
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    const api = await getBotAPI(botId);
    const settings =
      (await api.getSettings()) as unknown as ZaloSettingsResponse;
    const blockedUids = settings?.privacy?.blacklist || [];
    return { success: true, data: blockedUids };
  } catch (error: unknown) {
    console.warn(
      "[Profile] Fetch BlockList failed (Bot might be offline):",
      error,
    );
    return { success: true, data: [] };
  }
}

export async function toggleBlockFeedAction(
  botId: string,
  userId: string,
  isBlock: boolean,
) {
  try {
    const api = await getBotAPI(botId);
    type CorrectBlockFeedSignature = {
      blockViewFeed: (userId: string, isBlock: boolean) => Promise<unknown>;
    };
    await (api as unknown as CorrectBlockFeedSignature).blockViewFeed(
      userId,
      isBlock,
    );
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Toggle Block Feed Error:", err);
    return { success: false, error: err.message };
  }
}
