"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { ZaloBot } from "@/lib/types/database.types";

/**
 * Lấy danh sách Bot
 */
export async function getBotsAction() {
  const { data, error } = await supabase
    .from("zalo_bots")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as ZaloBot[];
}

/**
 * [FLOW 1] Tạo Bot Placeholder cho QR Login
 * Tên tạm: "New Bot..." -> Sẽ được update sau khi login thành công
 */
export async function createPlaceholderBotAction() {
  const tempName = `New Bot ${new Date().toLocaleTimeString()}`;

  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: tempName,
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

/**
 * [FLOW 1] Trigger Login QR
 */
export async function startBotLoginAction(botId: string) {
  const manager = BotRuntimeManager.getInstance();
  // Chạy background, không await kết quả login
  manager.startLoginQR(botId);
  return { success: true };
}

/**
 * [FLOW 2] Thêm Bot bằng Token JSON
 */
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
    // 1. Tạo Bot Placeholder trước
    const bot = await createPlaceholderBotAction();

    // 2. Gọi Runtime để login thử
    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(bot.id, credentials);

    revalidatePath("/dashboard");
    return { success: true, botId: bot.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * [RETRY] Thử đăng nhập lại với Token cũ trong DB
 */
export async function retryBotLoginAction(botId: string) {
  // 1. Lấy token từ DB
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
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteBotAction(botId: string) {
  const { error } = await supabase.from("zalo_bots").delete().eq("id", botId);
  if (error) throw new Error(error.message);

  // Stop runtime
  const manager = BotRuntimeManager.getInstance();
  await manager.stopBot(botId);

  revalidatePath("/dashboard");
}
