/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * lib/actions/bot.actions.ts
 * [UPDATED V7.6 - ROBUST LOGIN FALLBACK]
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

// --- READ ACTIONS ---

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

// --- WRITE ACTIONS ---

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

// [FIXED] Updated to use Full Credentials & ID Fallback
export async function addBotWithTokenAction(
  tokenJsonString: string,
  tempBotId?: string,
) {
  await requireAdmin();

  let credentials;
  try {
    credentials = JSON.parse(tokenJsonString);
    if (!credentials.cookie || !credentials.imei)
      throw new Error("Thiếu cookie hoặc imei");
  } catch (e) {
    return { success: false, error: "JSON Token không hợp lệ." };
  }

  // 1. VERIFY TOKEN (DRY RUN)
  // [FIX] Constructor takes 1 argument (merged options)
  const zaloOptions = {
    ...credentials,
    selfListen: false,
  };
  const tempZalo = new Zalo(zaloOptions);

  // Variables for bot data
  let globalId: string | null = null;
  let botName = "";
  let botAvatar = "";

  try {
    // Gọi login() để verify cookie/session key
    const api = await tempZalo.login(credentials);

    // [FALLBACK] Cố gắng lấy ID từ context trước (không cần mạng)
    try {
      const ownId = api.getOwnId();
      if (ownId && ownId !== "0" && ownId !== "undefined") {
        globalId = ownId;
        console.log("[LoginCheck] Found ID from context:", globalId);
      }
    } catch (err) {
      console.warn("[LoginCheck] Context ID check failed:", err);
    }

    // Sau đó thử fetch full profile
    try {
      const profile: any = await api.fetchAccountInfo();
      if (profile) {
        // [FIX] Check displayName (camelCase) based on TypeScript error
        globalId = profile.id || profile.uid || globalId;
        botName =
          profile.displayName ||
          profile.display_name ||
          profile.name ||
          profile.zalo_name;
        botAvatar = profile.avatar || "";
      }
    } catch (err) {
      console.warn("[LoginCheck] Fetch profile failed, using basic info.");
    }

    // Final check
    if (!globalId) {
      throw new Error(
        "Token hợp lệ nhưng không lấy được ID. Vui lòng thử lại.",
      );
    }

    if (!botName) botName = `Zalo User ${globalId}`;
  } catch (e: any) {
    console.error("Token verification failed:", e);
    return {
      success: false,
      error: "Token lỗi hoặc hết hạn: " + (e.message || String(e)),
    };
  }

  // 2. CHECK DUPLICATE & MERGE
  const { data: existingBot } = await supabase
    .from("zalo_identities")
    .select("id, ref_bot_id")
    .eq("zalo_global_id", globalId)
    .eq("type", "system_bot")
    .single();

  let finalBotId = existingBot?.id;

  if (existingBot) {
    if (existingBot.ref_bot_id) {
      await supabase
        .from("zalo_bot_info")
        .update({
          access_token: credentials, // Save FULL credentials
          name: botName,
          avatar: botAvatar,
          status: {
            state: "LOGGED_IN",
            message: "Cập nhật token thành công",
            last_update: new Date().toISOString(),
          },
          last_active_at: new Date().toISOString(),
        })
        .eq("id", existingBot.ref_bot_id);

      await supabase
        .from("zalo_identities")
        .update({
          display_name: botName,
          name: botName, // Ensure compatibility
          avatar: botAvatar,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBot.id);
    }
    if (tempBotId && tempBotId !== existingBot.id) {
      await deleteBotAction(tempBotId);
    }
  } else {
    if (tempBotId) {
      finalBotId = tempBotId;
      const { data: tempIdentity } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", tempBotId)
        .single();

      if (tempIdentity?.ref_bot_id) {
        await supabase
          .from("zalo_bot_info")
          .update({
            access_token: credentials, // Save FULL credentials
            name: botName,
            avatar: botAvatar,
            status: {
              state: "LOGGED_IN",
              message: "Đăng nhập thành công",
              last_update: new Date().toISOString(),
            },
            last_active_at: new Date().toISOString(),
          })
          .eq("id", tempIdentity.ref_bot_id);

        await supabase
          .from("zalo_identities")
          .update({
            zalo_global_id: globalId,
            display_name: botName,
            name: botName,
            avatar: botAvatar,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tempBotId);
      }
    }
  }

  // 3. START RUNTIME
  if (finalBotId) {
    try {
      const manager = BotRuntimeManager.getInstance();
      await manager.loginWithCredentials(finalBotId, credentials);
    } catch (e) {
      console.error("Runtime start failed:", e);
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

export async function deleteBotAction(identityId: string) {
  await requireAdmin();
  try {
    BotRuntimeManager.getInstance().stopBot(identityId);
  } catch (e) {}

  const { data } = await supabase
    .from("zalo_identities")
    .select("ref_bot_id")
    .eq("id", identityId)
    .single();
  await supabase.from("zalo_identities").delete().eq("id", identityId);
  if (data?.ref_bot_id) {
    await supabase.from("zalo_bot_info").delete().eq("id", data.ref_bot_id);
  }

  revalidatePath("/bot-manager");
  return { success: true };
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
