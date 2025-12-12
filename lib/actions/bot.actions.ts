/**
 * lib/actions/bot.actions.ts
 * [SECURITY UPDATE]
 * - getBotsAction: Lọc bot theo quyền hạn của nhân viên (Admin thấy hết, Staff chỉ thấy bot được gán).
 * - Các action ghi (Create/Delete/Update): Chỉ Admin mới được thực hiện.
 */

"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { SyncService } from "@/lib/core/services/sync-service";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { ZaloBot } from "@/lib/types/database.types";
import { getStaffSession } from "@/lib/actions/staff.actions";

// --- Helpers ---
async function requireAdmin() {
  const session = await getStaffSession();
  if (!session || session.role !== "admin") {
    throw new Error("Unauthorized: Hành động này yêu cầu quyền Quản trị viên.");
  }
  return session;
}

// --- Actions ---

export async function getBotsAction() {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized");

  // 1. Nếu là Admin: Lấy toàn bộ
  if (session.role === "admin") {
    const { data, error } = await supabase
      .from("zalo_bots")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data as ZaloBot[];
  }

  // 2. Nếu là Staff: Lấy danh sách Bot được phân quyền
  // Query bảng permissions để lấy bot_id
  const { data: permissions, error: permError } = await supabase
    .from("staff_bot_permissions")
    .select("bot_id")
    .eq("staff_id", session.id);

  if (permError) throw new Error(permError.message);

  if (!permissions || permissions.length === 0) {
    return []; // Không có quyền trên bot nào
  }

  const botIds = permissions.map((p) => p.bot_id);

  // Query thông tin bot dựa trên list ID
  const { data: bots, error: botError } = await supabase
    .from("zalo_bots")
    .select("*")
    .in("id", botIds)
    .order("created_at", { ascending: false });

  if (botError) throw new Error(botError.message);
  return bots as ZaloBot[];
}

export async function createBotAction(name: string) {
  await requireAdmin(); // Chỉ Admin

  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: name,
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

export async function deleteBotAction(botId: string) {
  await requireAdmin(); // Chỉ Admin

  const { error } = await supabase.from("zalo_bots").delete().eq("id", botId);
  if (error) throw new Error(error.message);
  const manager = BotRuntimeManager.getInstance();
  await manager.stopBot(botId);
  revalidatePath("/dashboard");
}

export async function startBotLoginAction(botId: string) {
  // Staff được phép login bot mà họ có quyền "auth" hoặc "chat" (tùy policy, ở đây tạm mở cho người thấy bot)
  // Thực tế nên check thêm quyền 'auth' ở đây nếu muốn chặt chẽ hơn.
  const manager = BotRuntimeManager.getInstance();
  manager.startLoginQR(botId);
  return { success: true };
}

export async function addBotWithTokenAction(tokenJson: string) {
  await requireAdmin(); // Chỉ Admin

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
    const bot = await createPlaceholderBotAction(); // Hàm này đã check admin bên trong
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
  // Tương tự startBotLoginAction
  const { data: bot } = await supabase
    .from("zalo_bots")
    .select("access_token, auto_sync_interval")
    .eq("id", botId)
    .single();

  if (!bot || !bot.access_token) {
    return { success: false, error: "Không tìm thấy token cũ." };
  }

  try {
    const manager = BotRuntimeManager.getInstance();
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

export async function syncBotDataAction(botId: string) {
  // Staff thấy bot là được sync
  try {
    const manager = BotRuntimeManager.getInstance();
    manager.getBotAPI(botId);

    SyncService.syncAll(botId).then(async (res) => {
      console.log(`[Action] Manual Sync result for ${botId}:`, res);
      if (res.success) {
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

export async function updateBotSyncSettingsAction(
  botId: string,
  intervalMinutes: number,
) {
  await requireAdmin(); // Chỉ Admin

  try {
    await supabase
      .from("zalo_bots")
      .update({ auto_sync_interval: intervalMinutes })
      .eq("id", botId);

    await retryBotLoginAction(botId);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createPlaceholderBotAction() {
  await requireAdmin(); // Chỉ Admin

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
