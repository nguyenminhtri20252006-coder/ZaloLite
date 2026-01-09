/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { SyncService } from "@/lib/core/services/sync-service";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/actions/staff.actions";
import { ZaloBot } from "@/lib/types/database.types";
import { Zalo } from "zca-js";

async function requireAdmin() {
  const session = await getStaffSession();
  if (!session || session.role !== "admin")
    throw new Error("Unauthorized: Admin required");
  return session;
}

async function resolveIdentityId(
  inputId: string,
): Promise<{ identityId: string; botInfoId: string | null } | null> {
  const { data: byId } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("id", inputId)
    .single();
  if (byId) return { identityId: byId.id, botInfoId: byId.ref_bot_id };
  const { data: byRef } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("ref_bot_id", inputId)
    .single();
  if (byRef) return { identityId: byRef.id, botInfoId: byRef.ref_bot_id };
  return null;
}

function generateRandomImei(): string {
  let result = "";
  const characters = "0123456789";
  for (let i = 0; i < 15; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

async function waitForBotId(
  api: any,
  maxRetries = 5,
): Promise<{ id: string; name?: string; avatar?: string } | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const id = api.getOwnId();
      const rawInfo = await api.fetchAccountInfo().catch(() => null);
      const profile = rawInfo?.data || rawInfo?.profile || rawInfo;
      if (profile && (profile.id || profile.uid || profile.userId)) {
        return {
          id: profile.id || profile.uid || profile.userId,
          name:
            profile.displayName ||
            profile.name ||
            profile.zaloName ||
            profile.username,
          avatar: profile.avatar || profile.avt,
        };
      }
      if (id && id !== "0" && id !== "undefined") return { id };
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}

export async function getBotsAction(): Promise<ZaloBot[]> {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized");
  const { data, error } = await supabase
    .from("zalo_identities")
    .select(
      `
            id, name:root_name, avatar, zalo_global_id,
            bot_info:zalo_bot_info!inner (id, access_token, status, is_active, is_realtime_active, health_check_log, created_at, updated_at, sync_status)
        `,
    )
    .eq("type", "system_bot")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Get Bots Error: ${error.message}`);
  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    avatar: item.avatar,
    global_id: item.zalo_global_id,
    ...item.bot_info,
    bot_info_id: item.bot_info.id,
  }));
}

export async function createPlaceholderBotAction() {
  await requireAdmin();
  console.warn("[Legacy Action] createPlaceholderBotAction called.");
  return { id: "deprecated" };
}

export async function addBotWithTokenAction(
  tokenInput: string,
  tempBotId?: string,
) {
  await requireAdmin();
  let credentials: any = {};
  try {
    credentials = JSON.parse(tokenInput);
  } catch (e) {
    if (tokenInput.includes("zpw_sek") || tokenInput.trim().startsWith("{"))
      credentials = { cookie: tokenInput };
    else return { success: false, error: "Token không hợp lệ" };
  }
  if (!credentials.imei) credentials.imei = generateRandomImei();
  if (!credentials.userAgent)
    credentials.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (ZaloPC)";
  if (
    typeof credentials.cookie === "string" &&
    credentials.cookie.trim().startsWith("{")
  ) {
    try {
      credentials.cookie = JSON.parse(credentials.cookie);
    } catch {}
  }
  const zaloOptions = {
    authType: "cookie",
    cookie: credentials.cookie,
    imei: credentials.imei,
    userAgent: credentials.userAgent,
    selfListen: false,
  };
  let globalId: string | null = null;
  let botName = "Zalo Bot";
  let botAvatar = "";
  try {
    const tempZalo = new Zalo(zaloOptions);
    const api = await tempZalo.login(credentials);
    const info = await waitForBotId(api);
    if (info) {
      globalId = String(info.id);
      botName = info.name || `Zalo User ${globalId}`;
      botAvatar = info.avatar || "";
    } else {
      throw new Error("Token hợp lệ nhưng không lấy được ID.");
    }
  } catch (e: any) {
    return {
      success: false,
      error: "Lỗi xác thực Zalo: " + (e.message || String(e)),
    };
  }

  const now = new Date().toISOString();
  let finalBotId: string | undefined = undefined;
  const { data: existingBot } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("zalo_global_id", globalId)
    .eq("type", "system_bot")
    .single();
  let botInfoIdToUpsert = existingBot?.ref_bot_id;
  const botInfoPayload = {
    access_token: credentials,
    name: botName,
    avatar: botAvatar,
    status: {
      state: "LOGGED_IN",
      message: "Cập nhật token thành công",
      last_update: now,
    },
    last_active_at: now,
    is_active: true,
  };
  try {
    if (botInfoIdToUpsert) {
      await supabase
        .from("zalo_bot_info")
        .update(botInfoPayload)
        .eq("id", botInfoIdToUpsert);
    } else {
      const { data: newInfo } = await supabase
        .from("zalo_bot_info")
        .insert(botInfoPayload)
        .select("id")
        .single();
      botInfoIdToUpsert = newInfo?.id;
    }
    const identityPayload = {
      zalo_global_id: globalId,
      root_name: botName,
      avatar: botAvatar,
      type: "system_bot",
      ref_bot_id: botInfoIdToUpsert,
      updated_at: now,
    };
    if (existingBot) {
      await supabase
        .from("zalo_identities")
        .update(identityPayload)
        .eq("id", existingBot.id);
      finalBotId = existingBot.id;
    } else {
      const { data: newIdentity } = await supabase
        .from("zalo_identities")
        .insert(identityPayload)
        .select("id")
        .single();
      finalBotId = newIdentity?.id;
    }
  } catch (dbError: any) {
    return { success: false, error: "DB Error: " + dbError.message };
  }

  if (finalBotId) {
    try {
      const manager = BotRuntimeManager.getInstance();
      await manager.resumeSession(finalBotId);
    } catch (e) {}
  }
  revalidatePath("/bot-manager");
  return { success: true, botId: finalBotId };
}
export async function resolveLoginConflictAction(
  botId: string,
  decision: "retry" | "create_new",
) {
  await requireAdmin();
  try {
    const manager = BotRuntimeManager.getInstance();
    await manager.resolveConflict(botId, decision);
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function cancelLoginAction(tempId: string) {
  try {
    BotRuntimeManager.getInstance().cleanupTempSession(tempId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateBotTokenAction(
  botId: string,
  tokenJsonString: string,
) {
  return await addBotWithTokenAction(tokenJsonString, botId);
}

export async function deleteBotAction(inputId: string) {
  await requireAdmin();
  try {
    const resolved = await resolveIdentityId(inputId);
    if (!resolved) return { success: false, error: "Bot not found" };
    const { identityId, botInfoId } = resolved;
    try {
      BotRuntimeManager.getInstance().stopBot(identityId);
    } catch (e) {}

    await supabase
      .from("messages")
      .delete()
      .eq("sender_identity_id", identityId);
    await supabase
      .from("conversation_members")
      .delete()
      .eq("identity_id", identityId);
    await supabase
      .from("zalo_connections")
      .delete()
      .eq("observer_id", identityId);
    await supabase
      .from("zalo_connections")
      .delete()
      .eq("target_id", identityId);
    if (botInfoId)
      await supabase
        .from("staff_bot_permissions")
        .delete()
        .eq("bot_id", botInfoId);
    await supabase.from("zalo_identities").delete().eq("id", identityId);
    if (botInfoId)
      await supabase.from("zalo_bot_info").delete().eq("id", botInfoId);
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function stopBotAction(botId: string) {
  await requireAdmin();
  try {
    const resolved = await resolveIdentityId(botId);
    if (!resolved) return { success: false, error: "Bot Identity Not Found" };

    const manager = BotRuntimeManager.getInstance();
    await manager.stopBot(resolved.identityId); // Ensure Identity ID is used
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// [UPDATED] Quản lý Realtime: Bật/Tắt listener
export async function toggleRealtimeAction(botId: string, enable: boolean) {
  await requireAdmin();
  const manager = BotRuntimeManager.getInstance();

  // 1. Phân giải ID để lấy đúng identityId và ref_bot_id
  const resolved = await resolveIdentityId(botId);
  if (!resolved || !resolved.botInfoId) {
    return {
      success: false,
      error: "Bot not found or not linked to Info (Check Identity Table)",
    };
  }

  const { identityId, botInfoId } = resolved;

  // 2. Update DB trước (Optimistic UI)
  await supabase
    .from("zalo_bot_info")
    .update({ is_realtime_active: enable })
    .eq("id", botInfoId);

  // 3. Gọi Runtime Manager với ID CHUẨN (identityId)
  try {
    if (enable) {
      await manager.startRealtime(identityId);
    } else {
      await manager.stopRealtime(identityId);
    }
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    // Rollback
    await supabase
      .from("zalo_bot_info")
      .update({ is_realtime_active: !enable })
      .eq("id", botInfoId);
    return { success: false, error: e.message };
  }
}

export async function startBotLoginAction(identityId: string) {
  try {
    console.log(`[Action] Received Start Login Request for: ${identityId}`);
    const manager = BotRuntimeManager.getInstance();
    await manager.startLoginQR(identityId);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function retryBotLoginAction(identityId: string) {
  try {
    // Resolve ID để chắc chắn
    const resolved = await resolveIdentityId(identityId);
    if (!resolved) throw new Error("Bot ID not valid");

    const manager = BotRuntimeManager.getInstance();
    await manager.resumeSession(resolved.identityId);
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function debugBotInfoAction(inputId: string) {
  await requireAdmin();
  try {
    const resolved = await resolveIdentityId(inputId);
    if (!resolved) return { success: false, error: `Không tìm thấy Bot` };
    const res = await SyncService.debugFetchFullInfo(resolved.identityId);
    return res;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function syncBotDataAction(inputId: string) {
  try {
    await requireAdmin();
    const resolved = await resolveIdentityId(inputId);
    if (!resolved) return { success: false, error: `Không tìm thấy Bot` };

    // Async call - không await để trả về UI ngay
    SyncService.syncAll(resolved.identityId, inputId).catch(console.error);

    return { success: true, message: "Sync started in background" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function stopBotSyncAction(inputId: string) {
  try {
    await requireAdmin();
    const resolved = await resolveIdentityId(inputId);
    if (!resolved) return { success: false, error: "Bot not found" };

    // Gọi service để set cờ abort
    const targetBotId = resolved.botInfoId;

    if (targetBotId) {
      await supabase
        .from("zalo_bot_info")
        .update({
          sync_status: {
            state: "STOPPED",
            message: "User cancelled manually",
            last_updated: new Date().toISOString(),
          },
        })
        .eq("id", targetBotId);

      // Gọi hàm stop in-memory (nếu service đang cache)
      SyncService.stopSync(resolved.identityId);
      return { success: true };
    }

    return { success: false, error: "Bot Info ID not found" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
