/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * lib/actions/bot.actions.ts
 * [UPDATED V11.0] INTEGRATED WITH NEW BOT RUNTIME
 * - Optimized: retryBotLoginAction now uses manager.resumeSession().
 * - Optimized: addBotWithTokenAction uses manager.resumeSession() to verify DB persistence.
 * - Restored: toggleRealtimeAction works with startRealtime/stopRealtime.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { SyncService } from "@/lib/core/services/sync-service";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/actions/staff.actions";
import { ZaloBot } from "@/lib/types/database.types";
import { Zalo } from "zca-js";

// --- HELPERS ---
async function requireAdmin() {
  const session = await getStaffSession();
  if (!session || session.role !== "admin") throw new Error("Unauthorized");
  return session;
}

// [HELPER] Resolve Identity ID
async function resolveIdentityId(
  inputId: string,
): Promise<{ identityId: string; botInfoId: string | null } | null> {
  // 1. Try Identity ID
  const { data: byId } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("id", inputId)
    .single();

  if (byId) return { identityId: byId.id, botInfoId: byId.ref_bot_id };

  // 2. Try Ref Bot ID
  const { data: byRef } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("ref_bot_id", inputId)
    .single();

  if (byRef) {
    return { identityId: byRef.id, botInfoId: byRef.ref_bot_id };
  }

  return null;
}

async function waitForBotId(
  api: any,
  maxRetries = 5,
): Promise<{ id: string; name?: string; avatar?: string } | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const id = api.getOwnId();
      const rawInfo = await api.fetchAccountInfo().catch(() => null);

      let profile = rawInfo;
      if (rawInfo?.data) profile = rawInfo.data;
      else if (rawInfo?.profile) profile = rawInfo.profile;

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

      if (id && id !== "0" && id !== "undefined") {
        return { id };
      }
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
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

// ... (READ ACTIONS) ...
export async function getBotsAction(): Promise<ZaloBot[]> {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("zalo_identities")
    .select(
      `
        id,
        name:display_name, 
        avatar,
        zalo_global_id,
        bot_info:zalo_bot_info!inner (
          id,
          access_token,
          status,
          is_active,
          is_realtime_active,
          health_check_log,
          created_at,
          updated_at
        )
      `,
    )
    .eq("type", "system_bot")
    .order("created_at", { ascending: false });

  if (error) {
    const msg = error.message || JSON.stringify(error);
    throw new Error(`Get Bots Error: ${msg}`);
  }

  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    avatar: item.avatar,
    global_id: item.zalo_global_id,
    ...item.bot_info,
    bot_info_id: item.bot_info.id,
  }));
}

// ... (WRITE ACTIONS) ...
export async function createPlaceholderBotAction() {
  await requireAdmin();
  const name = `Bot Mới ${new Date().toLocaleTimeString()}`;

  const { data: info, error: infoError } = await supabase
    .from("zalo_bot_info")
    .insert({
      name: name,
      status: { state: "QR_WAITING", message: "Đang chờ quét QR..." },
      is_active: true,
      is_realtime_active: false,
    })
    .select()
    .single();

  if (infoError) throw infoError;

  const { data: identity, error } = await supabase
    .from("zalo_identities")
    .insert({
      zalo_global_id: `temp_${info.id}`,
      type: "system_bot",
      display_name: name,
      ref_bot_id: info.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/bot-manager");
  return identity;
}

export async function addBotWithTokenAction(
  tokenInput: string,
  tempBotId?: string,
) {
  await requireAdmin();
  console.log(`[AddBot] Processing token input...`);

  // 1. Parse Token
  let credentials: any = {};
  try {
    credentials = JSON.parse(tokenInput);
  } catch (e) {
    if (tokenInput.includes("zpw_sek") || tokenInput.trim().startsWith("{"))
      credentials = { cookie: tokenInput };
    else
      return { success: false, error: "Token không hợp lệ (JSON parse error)" };
  }

  if (!credentials.imei) credentials.imei = generateRandomImei();
  if (!credentials.userAgent)
    credentials.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (ZaloPC)";

  // Handle cookie as string if needed
  if (
    typeof credentials.cookie === "string" &&
    credentials.cookie.trim().startsWith("{")
  ) {
    try {
      credentials.cookie = JSON.parse(credentials.cookie);
    } catch {}
  }

  // 2. Verify Token with ZCA-JS (Test Connection First)
  console.log("--- [DEBUG] Verifying Token with ZCA-JS ---");
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
      throw new Error(
        "Token hợp lệ nhưng không lấy được ID (Session Timeout).",
      );
    }
  } catch (e: any) {
    return {
      success: false,
      error: "Lỗi xác thực Zalo: " + (e.message || String(e)),
    };
  }

  // 3. Database Sync Logic
  const now = new Date().toISOString();
  let finalBotId: string | undefined = undefined;

  const { data: existingBot } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("zalo_global_id", globalId)
    .eq("type", "system_bot")
    .single();

  let botInfoIdToUpsert = existingBot?.ref_bot_id;

  // IMPORTANT: Save RAW credentials
  const botInfoPayload = {
    access_token: credentials, // Save Raw JSON
    name: botName,
    status: {
      state: "LOGGED_IN",
      message: "Cập nhật token thành công",
      last_update: now,
    },
    last_active_at: now,
    is_active: true,
    avatar: botAvatar,
  };

  try {
    // A. Handle Bot Info
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

    // B. Handle Identity
    const identityPayload = {
      zalo_global_id: globalId,
      display_name: botName,
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
      if (tempBotId) {
        const { data: tempCheck } = await supabase
          .from("zalo_identities")
          .select("id")
          .eq("id", tempBotId)
          .single();
        if (tempCheck) {
          await supabase
            .from("zalo_identities")
            .update(identityPayload)
            .eq("id", tempBotId);
          finalBotId = tempBotId;
        }
      }
      if (!finalBotId) {
        const { data: newIdentity } = await supabase
          .from("zalo_identities")
          .insert(identityPayload)
          .select("id")
          .single();
        finalBotId = newIdentity?.id;
      }
    }

    if (tempBotId && finalBotId !== tempBotId) {
      await deleteBotAction(tempBotId);
    }
  } catch (dbError: any) {
    return {
      success: false,
      error: "Database Save Failed: " + dbError.message,
    };
  }

  // 4. Start Runtime using RESUME SESSION (Best Practice)
  // This verifies that the saved token in DB is actually retrievable and usable
  if (finalBotId) {
    try {
      console.log(`[Runtime] Starting Bot via Resume: ${finalBotId}`);
      const manager = BotRuntimeManager.getInstance();
      await manager.resumeSession(finalBotId);
    } catch (e: any) {
      console.error("[Runtime] Start Failed:", e);
    }
  }

  revalidatePath("/bot-manager");
  return { success: true, botId: finalBotId };
}

export async function updateBotTokenAction(
  botId: string,
  tokenJsonString: string,
) {
  return await addBotWithTokenAction(tokenJsonString, botId);
}

export async function deleteBotAction(inputId: string) {
  await requireAdmin();
  console.log(`[DeleteBot] REQUEST DELETE for ID: ${inputId}`);

  try {
    const resolved = await resolveIdentityId(inputId);
    if (!resolved) {
      return { success: false, error: "Bot not found" };
    }

    const { identityId, botInfoId } = resolved;

    // Stop Runtime
    try {
      BotRuntimeManager.getInstance().stopBot(identityId);
    } catch (e) {}

    // Clean Related Data
    const { data: botMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", identityId);

    if (botMemberships && botMemberships.length > 0) {
      const convIds = botMemberships.map((m) => m.conversation_id);
      const { data: privateConvs } = await supabase
        .from("conversations")
        .select("id")
        .in("id", convIds)
        .eq("type", "private");

      if (privateConvs && privateConvs.length > 0) {
        const idsToDelete = privateConvs.map((c) => c.id);
        await supabase
          .from("messages")
          .delete()
          .in("conversation_id", idsToDelete);
        await supabase
          .from("conversation_members")
          .delete()
          .in("conversation_id", idsToDelete);
        await supabase.from("conversations").delete().in("id", idsToDelete);
      }
    }

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

    if (botInfoId) {
      await supabase
        .from("staff_bot_permissions")
        .delete()
        .eq("bot_id", botInfoId);
    }

    await supabase.from("zalo_identities").delete().eq("id", identityId);
    if (botInfoId) {
      await supabase.from("zalo_bot_info").delete().eq("id", botInfoId);
    }

    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    console.error(`[DeleteBot] CRITICAL FAILURE:`, e);
    return { success: false, error: e.message };
  }
}

export async function stopBotAction(botId: string) {
  await requireAdmin();
  try {
    const manager = BotRuntimeManager.getInstance();
    await manager.stopBot(botId);
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function toggleRealtimeAction(botId: string, enable: boolean) {
  await requireAdmin();

  // Update Flag in DB first
  const { data: identity } = await supabase
    .from("zalo_identities")
    .select("ref_bot_id")
    .eq("id", botId)
    .single();

  if (identity?.ref_bot_id) {
    await supabase
      .from("zalo_bot_info")
      .update({ is_realtime_active: enable })
      .eq("id", identity.ref_bot_id);
  }

  // Then Control Runtime
  const manager = BotRuntimeManager.getInstance();
  try {
    if (enable) {
      await manager.startRealtime(botId);
    } else {
      await manager.stopRealtime(botId);
    }
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: "Lỗi thao tác Realtime: " + e.message };
  }
}

export async function startBotLoginAction(identityId: string) {
  try {
    const manager = BotRuntimeManager.getInstance();
    await manager.startLoginQR(identityId);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// [UPDATED] Use Resume Session Logic
export async function retryBotLoginAction(identityId: string) {
  try {
    const manager = BotRuntimeManager.getInstance();
    // Tự động lấy token từ DB và login
    await manager.resumeSession(identityId);

    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function syncBotDataAction(botId: string) {
  try {
    await requireAdmin();
    const res = await SyncService.syncAll(botId);
    revalidatePath("/bot-manager");
    return res;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
