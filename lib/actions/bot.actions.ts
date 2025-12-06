/**
 * lib/actions/bot.actions.ts
 * [SERVER ACTIONS]
 * Quản lý Bot và các lệnh điều khiển Runtime.
 * Updated: Thêm action syncBotDataAction.
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

export async function createPlaceholderBotAction() {
  const tempName = `New Bot ${new Date().toLocaleTimeString()}`;

  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: tempName,
      // Global ID tạm, sẽ update sau khi login
      global_id: `temp_${Date.now()}`,
      status: { state: "STOPPED" },
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return data as ZaloBot;
}

export async function createBotAction(name: string) {
  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: name,
      global_id: `temp_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`,
      status: { state: "STOPPED" },
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return data as ZaloBot;
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
    .select("access_token")
    .eq("id", botId)
    .single();

  if (!bot || !bot.access_token) {
    return {
      success: false,
      error: "Không tìm thấy token cũ. Vui lòng thêm lại bot.",
    };
  }

  try {
    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(botId, bot.access_token);
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
}

export async function deleteBotAction(botId: string) {
  const { error } = await supabase.from("zalo_bots").delete().eq("id", botId);
  if (error) throw new Error(error.message);

  const manager = BotRuntimeManager.getInstance();
  await manager.stopBot(botId);

  revalidatePath("/dashboard");
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

    // Chạy sync nền (không await để trả về UI ngay)
    SyncService.syncAll(botId).then((res) => {
      console.log(`[Action] Background sync result for ${botId}:`, res);
    });

    return { success: true, message: "Đã bắt đầu tiến trình đồng bộ ngầm." };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Bot chưa sẵn sàng: ${errMsg}` };
  }
}
