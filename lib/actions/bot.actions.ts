/**
 * lib/actions/bot.actions.ts
 * [SERVER ACTIONS - V3.1]
 * Update: Hỗ trợ cấu hình Auto-Sync Interval.
 */

"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { SyncService } from "@/lib/core/services/sync-service";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { ZaloBot } from "@/lib/types/database.types";

export async function getBotsAction() {
  const { data, error } = await supabase
    .from("zalo_bots")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as ZaloBot[];
}

export async function createBotAction(name: string) {
  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: name,
      global_id: `temp_${Date.now()}`,
      status: { state: "STOPPED" },
      is_active: true,
      auto_sync_interval: 0, // Mặc định tắt auto-sync
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return data as ZaloBot;
}

export async function deleteBotAction(botId: string) {
  const { error } = await supabase.from("zalo_bots").delete().eq("id", botId);
  if (error) throw new Error(error.message);
  const manager = BotRuntimeManager.getInstance();
  await manager.stopBot(botId);
  revalidatePath("/dashboard");
}

export async function startBotLoginAction(botId: string) {
  const manager = BotRuntimeManager.getInstance();
  manager.startLoginQR(botId);
  return { success: true };
}

export async function addBotWithTokenAction(tokenJson: string) {
  let credentials;
  try {
    credentials = JSON.parse(tokenJson);
    if (!credentials.cookie || !credentials.imei) {
      throw new Error("JSON thiếu trường 'cookie' hoặc 'imei'.");
    }
  } catch (e) {
    return { success: false, error: "Format JSON không hợp lệ." };
  }

  try {
    const bot = await createPlaceholderBotAction();
    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(bot.id, credentials);

    revalidatePath("/dashboard");
    return { success: true, botId: bot.id };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
}

export async function retryBotLoginAction(botId: string) {
  const { data: bot } = await supabase
    .from("zalo_bots")
    .select("access_token, auto_sync_interval") // Lấy thêm setting sync
    .eq("id", botId)
    .single();

  if (!bot || !bot.access_token) {
    return { success: false, error: "Không tìm thấy token cũ." };
  }

  try {
    const manager = BotRuntimeManager.getInstance();
    // Truyền setting sync vào hàm login
    await manager.loginWithCredentials(
      botId,
      bot.access_token,
      bot.auto_sync_interval || 0,
    );
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
}

/**
 * [NEW] Action kích hoạt đồng bộ dữ liệu thủ công
 */
export async function syncBotDataAction(botId: string) {
  try {
    // Kiểm tra xem bot có đang online không trước khi sync
    const manager = BotRuntimeManager.getInstance();
    // (Sẽ throw error nếu bot chưa init hoặc chưa login)
    manager.getBotAPI(botId);

    // Chạy sync nền
    SyncService.syncAll(botId).then(async (res) => {
      console.log(`[Action] Manual Sync result for ${botId}:`, res);
      if (res.success) {
        // Update heartbeat thủ công
        await supabase
          .from("zalo_bots")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", botId);
      }
    });

    return { success: true, message: "Đã kích hoạt đồng bộ thủ công." };
  } catch (error: unknown) {
    return {
      success: false,
      error: "Bot chưa online. Vui lòng đăng nhập lại.",
    };
  }
}

/**
 * [NEW] Cập nhật cấu hình Auto-Sync
 */
export async function updateBotSyncSettingsAction(
  botId: string,
  intervalMinutes: number,
) {
  try {
    // 1. Update DB
    await supabase
      .from("zalo_bots")
      .update({ auto_sync_interval: intervalMinutes })
      .eq("id", botId);

    // 2. Nếu bot đang online, cần restart lại polling timer (bằng cách login lại nhẹ hoặc update runtime trực tiếp)
    // Cách đơn giản nhất: Gọi retryLogin để reload config runtime
    // Hoặc ta có thể thêm hàm updateConfig vào RuntimeManager (tốt hơn).
    // Ở đây dùng retryLogin cho chắc chắn.
    await retryBotLoginAction(botId);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ... (Giữ nguyên createPlaceholderBotAction)
export async function createPlaceholderBotAction() {
  const tempName = `New Bot ${new Date().toLocaleTimeString()}`;
  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: tempName,
      global_id: `temp_${Date.now()}`,
      status: { state: "STOPPED" },
      is_active: true,
      auto_sync_interval: 0,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return data as ZaloBot;
}
