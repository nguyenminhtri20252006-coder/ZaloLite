"use server";

/**
 * lib/actions/bot.actions.ts
 * [UPDATED V6 Strict]
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { SyncService } from "@/lib/core/services/sync-service";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/actions/staff.actions";

// Helpers
async function requireAdmin() {
  const session = await getStaffSession();
  if (!session || session.role !== "admin") throw new Error("Unauthorized");
  return session;
}

export async function getBotsAction() {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized");

  // Join Identities with Bot Info
  const query = supabase
    .from("zalo_identities")
    .select(
      `
        *,
        bot_info:zalo_bot_info(*)
    `,
    )
    .eq("type", "system_bot")
    .order("created_at", { ascending: false });

  if (session.role !== "admin") {
    // Check permission logic here (adapt if needed for V6 permission table)
    // For now, return empty or implement perms check
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function createBotAction(name: string) {
  await requireAdmin();

  // 1. Create Info First
  const { data: info, error: infoError } = await supabase
    .from("zalo_bot_info")
    .insert({
      name: name,
      status: { state: "STOPPED" },
      is_active: true,
      is_realtime_active: false,
    })
    .select()
    .single();

  if (infoError) throw infoError;

  // 2. Create Identity
  const { data: identity, error } = await supabase
    .from("zalo_identities")
    .insert({
      zalo_global_id: `temp_${Date.now()}`,
      type: "system_bot",
      display_name: name,
      ref_bot_id: info.id, // Link
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard");
  return identity;
}

export async function deleteBotAction(identityId: string) {
  await requireAdmin();
  try {
    BotRuntimeManager.getInstance().stopBot(identityId);
  } catch (e) {}

  // Delete Identity -> Cascade or clean up Info?
  // V6 Schema: ref_bot_id ON DELETE SET NULL. So we should delete Info manually or Identity.
  // Best practice: Delete Identity first.

  const { data } = await supabase
    .from("zalo_identities")
    .select("ref_bot_id")
    .eq("id", identityId)
    .single();

  await supabase.from("zalo_identities").delete().eq("id", identityId);

  if (data?.ref_bot_id) {
    await supabase.from("zalo_bot_info").delete().eq("id", data.ref_bot_id);
  }

  revalidatePath("/dashboard");
}

export async function startBotFromSavedTokenAction(identityId: string) {
  // Get Info via Identity
  const { data: identity } = await supabase
    .from("zalo_identities")
    .select("ref_bot_id, bot_info:zalo_bot_info(access_token)")
    .eq("id", identityId)
    .single();

  // @ts-expect-error: Nested join typing
  const token = identity?.bot_info?.access_token;
  const botInfoId = identity?.ref_bot_id;

  if (!token || !botInfoId) throw new Error("No token found.");

  const manager = BotRuntimeManager.getInstance();

  await supabase
    .from("zalo_bot_info")
    .update({ status: { state: "STARTING" } })
    .eq("id", botInfoId);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await manager.loginWithCredentials(identityId, token as any);

    await supabase
      .from("zalo_bot_info")
      .update({ status: { state: "ACTIVE" } })
      .eq("id", botInfoId);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    const err = String(e);
    await supabase
      .from("zalo_bot_info")
      .update({ status: { state: "ERROR", message: err } })
      .eq("id", botInfoId);
    return { success: false, error: err };
  }
}

/**
 * [NEW V2.5] Toggle Realtime Mode
 * Bật/Tắt chế độ lắng nghe sự kiện mà không cần đăng xuất Bot.
 */
export async function toggleBotRealtimeAction(
  botId: string,
  isActive: boolean,
) {
  try {
    const manager = BotRuntimeManager.getInstance();

    // 1. Cập nhật DB
    await supabase
      .from("zalo_bot_info")
      .update({ is_realtime_active: isActive })
      .eq("identity_id", botId);

    // 2. Điều khiển Runtime
    if (isActive) {
      // Bật Realtime: Kết nối Socket/Polling
      // Lưu ý: Bot phải đang có session active mới bật được
      await manager.startRealtime(botId);
    } else {
      // Tắt Realtime: Ngắt Socket, chỉ giữ Session HTTP
      await manager.stopRealtime(botId);
    }

    revalidatePath("/bot-manager");
    return { success: true };
  } catch (error: unknown) {
    const err = String(error);
    return { success: false, error: err };
  }
}

export async function syncBotDataAction(botId: string) {
  try {
    await SyncService.syncAll(botId);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
