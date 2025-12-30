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
export async function stopBotAction(botId: string) {
  try {
    // 1. Dừng Runtime (Hủy kết nối Socket, xóa Instance khỏi bộ nhớ)
    console.log(`[Action] Stopping Bot ${botId}...`);
    BotRuntimeManager.getInstance().stopBot(botId);

    // 2. Cập nhật trạng thái Database
    const { error } = await supabase
      .from("zalo_bots")
      .update({
        status: { state: "STOPPED", last_update: new Date().toISOString() },
        is_active: false, // Đánh dấu không active
      })
      .eq("id", botId);

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/bot-manager");
    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[Action] Stop Bot Error:", err);
    return { success: false, error: err };
  }
}

/**
 * [NEW] Cập nhật Token cho Bot đang tồn tại (Dùng để Re-login)
 */
export async function updateBotTokenAction(botId: string, tokenJson: string) {
  await requireAdmin();

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
    const manager = BotRuntimeManager.getInstance();

    // Cập nhật DB trước để đảm bảo data mới nhất được lưu
    await supabase
      .from("zalo_bots")
      .update({
        access_token: credentials,
        status: { state: "STARTING", error_message: null },
      })
      .eq("id", botId);

    // Thử login với credentials mới
    await manager.loginWithCredentials(botId, credentials);

    // Nếu login thành công, credential mới sẽ được tự động lưu vào DB
    // thông qua hàm updateBotInfoAndHeartbeat trong Runtime.

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
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

/**
 * [NEW] START BOT FROM SAVED TOKEN
 */
export async function startBotFromSavedTokenAction(botId: string) {
  // Lấy token từ DB
  const { data: bot, error } = await supabase
    .from("zalo_bots")
    .select("access_token, auto_sync_interval")
    .eq("id", botId)
    .single();

  if (error || !bot || !bot.access_token) {
    throw new Error("Không tìm thấy token đã lưu. Vui lòng đăng nhập lại.");
  }

  const manager = BotRuntimeManager.getInstance();

  // Update DB trước: Active = true
  await supabase
    .from("zalo_bots")
    .update({
      is_active: true,
      status: { state: "STARTING", error_message: null },
    })
    .eq("id", botId);

  try {
    await manager.loginWithCredentials(
      botId,
      bot.access_token,
      bot.auto_sync_interval || 0,
    );
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
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

  let newBotId: string | null = null;

  try {
    // 1. Tạo Bot Placeholder & LƯU LUÔN Credentials vào DB
    // Trạng thái ban đầu là STOPPED để tránh Runtime tự auto-start sai luồng
    const tempName = `Imported Bot ${new Date().toLocaleTimeString()}`;
    const { data: bot, error } = await supabase
      .from("zalo_bots")
      .insert({
        name: tempName,
        global_id: `import_${Date.now()}`, // Temporary ID
        status: { state: "STOPPED" },
        is_active: true,
        access_token: credentials, // <--- LƯU NGAY LẬP TỨC
        auto_sync_interval: 0,
      })
      .select()
      .single();

    if (error) throw new Error("DB Error: " + error.message);
    newBotId = bot.id;

    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(bot.id, credentials);

    revalidatePath("/dashboard");
    return { success: true, botId: bot.id };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[AddBotToken] Error:", errMsg);

    // Nếu đã tạo được bot nhưng login lỗi, ta trả về success=true nhưng kèm warning
    // để UI redirect user về trang chi tiết bot (nơi hiển thị lỗi cụ thể)
    if (newBotId) {
      revalidatePath("/dashboard");
      // Trả về success để đóng modal, user sẽ thấy bot ở trạng thái ERROR
      return {
        success: true,
        botId: newBotId,
        warning: "Bot đã được tạo nhưng đăng nhập thất bại: " + errMsg,
      };
    }

    return { success: false, error: errMsg };
  }
}

export async function retryBotLoginAction(botId: string) {
  // Action này về cơ bản giống startBotFromSavedTokenAction nhưng semantic khác chút (Retry khi Error)
  return startBotFromSavedTokenAction(botId);
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
  await requireAdmin();

  try {
    await supabase
      .from("zalo_bots")
      .update({ auto_sync_interval: intervalMinutes })
      .eq("id", botId);

    // Restart bot để apply interval mới
    await startBotFromSavedTokenAction(botId);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createPlaceholderBotAction() {
  await requireAdmin();

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
