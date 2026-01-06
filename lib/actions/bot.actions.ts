/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * lib/actions/bot.actions.ts
 * [FIXED V9.8] SCHEMA SYNC & ERROR HANDLING
 * - Handled 'last_active_at' missing column error gracefully.
 * - Improved insertion logic flow.
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

async function waitForBotId(
  api: any,
  maxRetries = 5,
): Promise<{ id: string; name?: string; avatar?: string } | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const id = api.getOwnId();
      const profile = await api.fetchAccountInfo().catch(() => null);

      if (profile && (profile.id || profile.uid)) {
        return {
          id: profile.id || profile.uid,
          name: profile.display_name || profile.name || profile.zalo_name,
          avatar: profile.avatar,
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

  if (error) throw new Error(error.message);

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
  let credentials: any = {};
  try {
    credentials = JSON.parse(tokenInput);
  } catch (e) {
    if (tokenInput.includes("zpw_sek") || tokenInput.trim().startsWith("{"))
      credentials = { cookie: tokenInput };
    else return { success: false, error: "Token không hợp lệ" };
  }
  if (!credentials.imei) credentials.imei = generateRandomImei();
  if (
    typeof credentials.cookie === "string" &&
    credentials.cookie.trim().startsWith("{")
  ) {
    try {
      credentials.cookie = JSON.parse(credentials.cookie);
    } catch {}
  }
  if (!credentials.userAgent)
    credentials.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (ZaloPC)";

  console.log("--- [DEBUG] Starting Token Verification ---");
  const zaloOptions = {
    authType: "cookie",
    cookie: credentials.cookie,
    imei: credentials.imei,
    userAgent: credentials.userAgent,
    selfListen: false,
  };
  const tempZalo = new Zalo(zaloOptions);

  let globalId: string | null = null;
  let botName = "";
  let botAvatar = "";

  try {
    const api = await tempZalo.login(credentials);
    console.log("[DEBUG] Login OK. Fetching Info...");
    const info = await waitForBotId(api);
    if (info) {
      globalId = info.id;
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
      error: "Lỗi xác thực: " + (e.message || String(e)),
    };
  }

  // DB Logic
  const { data: existingBot } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("zalo_global_id", globalId)
    .eq("type", "system_bot")
    .single();
  let finalBotId: string | undefined = existingBot?.id;
  const now = new Date().toISOString();

  // Helper Object Payload (Dynamic key check)
  // Nếu DB chưa update schema thì ta nên bỏ qua last_active_at trong payload để tránh lỗi
  // Nhưng Supabase Client không check schema, nên ta cứ gửi, nếu lỗi thì phải sửa DB.
  const botInfoUpdate = {
    access_token: credentials,
    name: botName,

    status: {
      state: "LOGGED_IN",
      message: "Cập nhật token thành công",
      last_update: now,
    },
    last_active_at: now,
  };

  if (existingBot) {
    console.log(`[DEBUG] Found existing bot in DB: ${existingBot.id}`);
    if (existingBot.ref_bot_id) {
      const { error } = await supabase
        .from("zalo_bot_info")
        .update(botInfoUpdate)
        .eq("id", existingBot.ref_bot_id);

      if (error) {
        console.error("[DEBUG] Update Bot Info Error:", error);
        // Fallback: Try update without last_active_at if column missing
        if (error.message.includes("last_active_at")) {
          delete (botInfoUpdate as any).last_active_at;
          await supabase
            .from("zalo_bot_info")
            .update(botInfoUpdate)
            .eq("id", existingBot.ref_bot_id);
        }
      }

      await supabase
        .from("zalo_identities")
        .update({
          display_name: botName,
          name: botName,
          avatar: botAvatar,
          updated_at: now,
        })
        .eq("id", existingBot.id);
    }
    if (tempBotId && tempBotId !== existingBot.id)
      await deleteBotAction(tempBotId);
  } else {
    console.log(`[DEBUG] New bot detected.`);
    if (tempBotId) {
      console.log(`[DEBUG] Using tempBotId: ${tempBotId}`);
      finalBotId = tempBotId;
      const { data: tempIdentity } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", tempBotId)
        .single();
      if (tempIdentity?.ref_bot_id) {
        // Update Bot Info
        const { error: infoErr } = await supabase
          .from("zalo_bot_info")
          .update({
            ...botInfoUpdate,
            status: {
              state: "LOGGED_IN",
              message: "Đăng nhập thành công",
              last_update: now,
            },
          })
          .eq("id", tempIdentity.ref_bot_id);

        if (infoErr) {
          console.error("[DEBUG] Update Temp Bot Info Error:", infoErr);
          if (infoErr.message.includes("last_active_at")) {
            delete (botInfoUpdate as any).last_active_at;
            await supabase
              .from("zalo_bot_info")
              .update({
                ...botInfoUpdate,
                status: {
                  state: "LOGGED_IN",
                  message: "Đăng nhập thành công",
                  last_update: now,
                },
              })
              .eq("id", tempIdentity.ref_bot_id);
          }
        }

        await supabase
          .from("zalo_identities")
          .update({
            zalo_global_id: globalId,
            display_name: botName,
            name: botName,
            avatar: botAvatar,
            updated_at: now,
          })
          .eq("id", tempBotId);
      }
    } else {
      console.log(`[DEBUG] Creating completely new bot entry...`);

      // INSERT LOGIC
      const botInfoPayload = {
        name: botName,
        access_token: credentials,
        status: {
          state: "LOGGED_IN",
          message: "Đăng nhập thành công (Token)",
          last_update: now,
        },
        is_active: true,
        last_active_at: now,
      };

      // Try Insert Info
      let { data: newInfo, error: infoErr } = await supabase
        .from("zalo_bot_info")
        .insert(botInfoPayload)
        .select()
        .single();

      // Retry without last_active_at if column missing
      if (infoErr && infoErr.message.includes("last_active_at")) {
        console.warn(
          "[DEBUG] Retrying insert without last_active_at column...",
        );
        delete (botInfoPayload as any).last_active_at;
        const retryRes = await supabase
          .from("zalo_bot_info")
          .insert(botInfoPayload)
          .select()
          .single();
        newInfo = retryRes.data;
        infoErr = retryRes.error;
      }

      if (infoErr) {
        console.error("[DEBUG] Error inserting zalo_bot_info:", infoErr);
        return {
          success: false,
          error: "DB Error (Bot Info): " + infoErr.message,
        };
      }

      if (newInfo) {
        console.log(`[DEBUG] Created Bot Info ID: ${newInfo.id}`);
        const { data: newIdentity, error: idErr } = await supabase
          .from("zalo_identities")
          .insert({
            zalo_global_id: globalId,
            type: "system_bot",
            display_name: botName,
            name: botName,
            avatar: botAvatar,
            ref_bot_id: newInfo.id,
          })
          .select()
          .single();

        if (idErr) {
          console.error("[DEBUG] Error inserting zalo_identities:", idErr);
          // Cleanup orphaned bot info
          await supabase.from("zalo_bot_info").delete().eq("id", newInfo.id);
          return {
            success: false,
            error: "DB Error (Identity): " + idErr.message,
          };
        }

        if (newIdentity) {
          console.log(`[DEBUG] Created Identity ID: ${newIdentity.id}`);
          finalBotId = newIdentity.id;
        }
      }
    }
  }

  // 4. START RUNTIME
  if (finalBotId) {
    try {
      console.log(`[DEBUG] Starting Runtime for: ${finalBotId}`);
      const manager = BotRuntimeManager.getInstance();
      await manager.loginWithCredentials(finalBotId, credentials);
    } catch (e) {
      console.error("Runtime start failed:", e);
    }
  } else {
    console.error("[DEBUG] CRITICAL: finalBotId is undefined!");
  }

  revalidatePath("/bot-manager");
  const result = { success: true, botId: finalBotId };
  console.log(`[DEBUG] Returning result:`, result);
  return result;
}

// ... (Các hàm còn lại deleteBotAction, stopBotAction... giữ nguyên)
export async function updateBotTokenAction(
  botId: string,
  tokenJsonString: string,
) {
  return await addBotWithTokenAction(tokenJsonString, botId);
}

export async function deleteBotAction(identityId: string) {
  await requireAdmin();
  try {
    try {
      BotRuntimeManager.getInstance().stopBot(identityId);
    } catch (e) {}
    const { data: identity } = await supabase
      .from("zalo_identities")
      .select("id, ref_bot_id")
      .eq("id", identityId)
      .single();
    if (!identity) return { success: false, error: "Bot not found" };
    const botInfoId = identity.ref_bot_id;
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
    const { error: idError } = await supabase
      .from("zalo_identities")
      .delete()
      .eq("id", identityId);
    if (idError) throw idError;
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
