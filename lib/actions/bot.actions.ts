/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * lib/actions/bot.actions.ts
 * [UPDATED V10.7] SMART ID RESOLUTION
 * - Fixed: deleteBotAction now handles both IdentityID and BotInfoID.
 * - This prevents "Bot Identity not found" error when Client sends the wrong ID type.
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

// [HELPER] Resolve Identity ID from either IdentityID or BotInfoID
async function resolveIdentityId(
  inputId: string,
): Promise<{ identityId: string; botInfoId: string | null } | null> {
  // 1. Try finding by Identity ID (Standard Case)
  const { data: byId } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("id", inputId)
    .single();

  if (byId) return { identityId: byId.id, botInfoId: byId.ref_bot_id };

  // 2. Try finding by Ref Bot ID (Fallback Case - if Client sent Info ID)
  const { data: byRef } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("ref_bot_id", inputId)
    .single();

  if (byRef) {
    console.log(
      `[ResolveID] Input ${inputId} was actually a BotInfoID. Resolved to IdentityID: ${byRef.id}`,
    );
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

      // Unwrap profile/data
      let profile = rawInfo;
      if (rawInfo?.data) profile = rawInfo.data;
      else if (rawInfo?.profile) profile = rawInfo.profile;

      if (profile && (profile.id || profile.uid || profile.userId)) {
        return {
          id: profile.id || profile.uid || profile.userId,
          name:
            profile.displayName ||
            profile.display_name ||
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

  // 1. Create Info First
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

  // 2. Create Identity Linked to Info
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
  console.log(
    `[AddBot] Starting with token input length: ${tokenInput.length}`,
  );

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

  // Ensure necessary fields
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

  // 2. Verify Token with ZCA-JS
  console.log("--- [DEBUG] Starting Token Verification ---");
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
    console.log("[DEBUG] Login OK. Fetching Info...");
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
    console.log(`[DEBUG] SUCCESS: Identified as ${botName} (${globalId})`);
  } catch (e: any) {
    return {
      success: false,
      error: "Lỗi xác thực Zalo: " + (e.message || String(e)),
    };
  }

  // 3. Database Sync Logic
  const now = new Date().toISOString();
  let finalBotId: string | undefined = undefined;

  // Check if bot already exists by Global ID
  const { data: existingBot } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("zalo_global_id", globalId)
    .eq("type", "system_bot")
    .single();

  // Determine Bot Info ID to upsert
  let botInfoIdToUpsert = existingBot?.ref_bot_id;

  // Prepare Bot Info Payload
  const botInfoPayload = {
    access_token: credentials,
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
    // A. Handle Bot Info (The Source of Truth for Token)
    if (botInfoIdToUpsert) {
      // Update existing info
      console.log(`[DB] Updating existing Bot Info: ${botInfoIdToUpsert}`);
      const { error: updateErr } = await supabase
        .from("zalo_bot_info")
        .update(botInfoPayload)
        .eq("id", botInfoIdToUpsert);

      if (updateErr)
        throw new Error(`Update Info Failed: ${updateErr.message}`);
    } else {
      // Create new info
      console.log(`[DB] Creating NEW Bot Info...`);
      const { data: newInfo, error: insertErr } = await supabase
        .from("zalo_bot_info")
        .insert(botInfoPayload)
        .select("id")
        .single();

      if (insertErr)
        throw new Error(`Insert Info Failed: ${insertErr.message}`);
      botInfoIdToUpsert = newInfo.id;
    }

    // B. Handle Identity (The UI Representation)
    const identityPayload = {
      zalo_global_id: globalId,
      display_name: botName,
      avatar: botAvatar,
      type: "system_bot",
      ref_bot_id: botInfoIdToUpsert,
      updated_at: now,
    };

    if (existingBot) {
      // Update existing identity
      console.log(`[DB] Updating existing Identity: ${existingBot.id}`);
      await supabase
        .from("zalo_identities")
        .update(identityPayload)
        .eq("id", existingBot.id);
      finalBotId = existingBot.id;
    } else {
      // New Identity (or upgrade from Temp)
      if (tempBotId) {
        // Check if tempBot is valid to upgrade
        const { data: tempCheck } = await supabase
          .from("zalo_identities")
          .select("id")
          .eq("id", tempBotId)
          .single();
        if (tempCheck) {
          console.log(`[DB] Upgrading Temp Identity: ${tempBotId}`);
          await supabase
            .from("zalo_identities")
            .update(identityPayload)
            .eq("id", tempBotId);
          finalBotId = tempBotId;
        }
      }

      // If still no finalBotId (new bot, no temp), Insert new
      if (!finalBotId) {
        console.log(`[DB] Inserting NEW Identity...`);
        const { data: newIdentity, error: idErr } = await supabase
          .from("zalo_identities")
          .insert(identityPayload)
          .select("id")
          .single();
        if (idErr) throw new Error(`Insert Identity Failed: ${idErr.message}`);
        finalBotId = newIdentity.id;
      }
    }

    // C. Cleanup Temp Bot (If we created a new one instead of using temp)
    if (tempBotId && finalBotId !== tempBotId) {
      await deleteBotAction(tempBotId);
    }
  } catch (dbError: any) {
    console.error("[DB] Critical Error during Bot Save:", dbError);
    return {
      success: false,
      error: "Database Save Failed: " + dbError.message,
    };
  }

  // 4. Start Runtime
  if (finalBotId) {
    try {
      console.log(`[Runtime] Starting Bot: ${finalBotId}`);
      const manager = BotRuntimeManager.getInstance();
      // Ensure we pass the clean credentials object
      await manager.loginWithCredentials(finalBotId, credentials);
    } catch (e: any) {
      console.error("[Runtime] Start Failed:", e);
      // Don't return failure here, as DB save was successful. User can retry start.
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
// [FIXED] ROBUST DELETE ACTION with ID RESOLUTION
export async function deleteBotAction(inputId: string) {
  await requireAdmin();
  console.log(
    `[DeleteBot] ---------------------------------------------------`,
  );
  console.log(`[DeleteBot] 🗑️ REQUEST DELETE for ID: ${inputId}`);

  try {
    // 1. SMART ID RESOLUTION
    const resolved = await resolveIdentityId(inputId);
    if (!resolved) {
      console.error(`[DeleteBot] ❌ Bot not found in DB (ID: ${inputId})`);
      return { success: false, error: "Bot not found (Check ID)" };
    }

    const { identityId, botInfoId } = resolved;
    console.log(`[DeleteBot] 🎯 Resolved Identity ID: ${identityId}`);

    // 2. Stop Runtime
    try {
      console.log(`[DeleteBot] Stopping runtime...`);
      BotRuntimeManager.getInstance().stopBot(identityId);
    } catch (e) {
      console.warn(`[DeleteBot] Runtime stop warning (Ignored):`, e);
    }

    // 3. Clean Related Data
    console.log(`[DeleteBot] Cleaning Related Data...`);

    // Private Conversations
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
        console.log(
          `[DeleteBot]    ✅ Deleted ${idsToDelete.length} Private Convs.`,
        );
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

    // 4. Delete Identity
    console.log(`[DeleteBot] Deleting Identity...`);
    await supabase.from("zalo_identities").delete().eq("id", identityId);

    // 5. Delete Bot Info
    if (botInfoId) {
      console.log(`[DeleteBot] Deleting Bot Info...`);
      await supabase.from("zalo_bot_info").delete().eq("id", botInfoId);
    }

    console.log(`[DeleteBot] ✅ DELETE SUCCESS.`);
    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e: any) {
    console.error(`[DeleteBot] 🛑 CRITICAL FAILURE:`, e);
    return {
      success: false,
      error: e.message || "Unknown error during deletion",
    };
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
  const manager = BotRuntimeManager.getInstance();
  if (enable) {
    try {
      await manager.startRealtime(botId);
    } catch (e: any) {
      return { success: false, error: "Lỗi bật Realtime: " + e.message };
    }
  } else {
    await manager.stopRealtime(botId);
  }
  revalidatePath("/bot-manager");
  return { success: true };
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

export async function retryBotLoginAction(identityId: string) {
  try {
    const { data: identity } = await supabase
      .from("zalo_identities")
      .select("bot_info:zalo_bot_info(access_token)")
      .eq("id", identityId)
      .single();
    const token = (identity?.bot_info as any)?.access_token;
    if (!token) throw new Error("Không có token cũ.");
    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(identityId, token);
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
