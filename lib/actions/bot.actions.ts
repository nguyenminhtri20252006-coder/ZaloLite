"use server";

/**
 * lib/actions/bot.actions.ts
 * [UPDATED V6.5]
 * - Hỗ trợ đầy đủ luồng: Tạo -> Start QR -> Scan -> Sync -> Delete.
 * - Tương tác chuẩn với bảng zalo_bot_info và zalo_identities.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { SyncService } from "@/lib/core/services/sync-service";
import supabase from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/actions/staff.actions";
import { ZaloBot } from "@/lib/types/database.types";

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

  // Join Identities (Persona) với Bot Info (Technical)
  // Lưu ý: Type ZaloBot ở frontend mong đợi cấu trúc phẳng hoặc lồng nhau tùy define.
  // Ở đây ta trả về cấu trúc mà UI BotManagerPanel dễ xử lý nhất.
  const { data, error } = await supabase
    .from("zalo_identities")
    .select(
      `
        id,
        name,
        avatar,
        zalo_global_id,
        bot_info:zalo_bot_info!inner (
          id,
          access_token,
          status,
          is_active,
          is_realtime_active,
          created_at,
          updated_at
        )
    `,
    )
    .eq("type", "system_bot")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Map dữ liệu về dạng ZaloBot interface cho UI
  return data.map((item: any) => ({
    id: item.id, // Identity ID (dùng làm ID chính trong UI)
    name: item.name,
    avatar: item.avatar,
    // Merge fields từ bot_info
    ...item.bot_info,
    // Override ID của bot_info bằng ID của identity để consistent với các action khác
    // (Tuy nhiên cần lưu ý khi update status thì cần ID của bot_info)
    bot_info_id: item.bot_info.id,
  }));
}

// --- WRITE ACTIONS ---

export async function createBotAction(name: string) {
  await requireAdmin();

  // 1. Tạo bản ghi kỹ thuật (Info) trước
  const { data: info, error: infoError } = await supabase
    .from("zalo_bot_info")
    .insert({
      name: name,
      status: { state: "STOPPED", message: "Vừa khởi tạo" },
      is_active: true,
      is_realtime_active: false,
    })
    .select()
    .single();

  if (infoError) throw infoError;

  // 2. Tạo bản ghi định danh (Identity)
  const { data: identity, error } = await supabase
    .from("zalo_identities")
    .insert({
      zalo_global_id: `temp_${Date.now()}`, // ID tạm, sẽ update sau khi login thành công
      type: "system_bot",
      display_name: name,
      name: name,
      ref_bot_id: info.id, // Link tới Info
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/bot-manager");
  return identity;
}

export async function deleteBotAction(identityId: string) {
  await requireAdmin();

  // 1. Stop Runtime
  try {
    BotRuntimeManager.getInstance().stopBot(identityId);
  } catch (e) {}

  // 2. Get Info ID để xóa Clean
  const { data } = await supabase
    .from("zalo_identities")
    .select("ref_bot_id")
    .eq("id", identityId)
    .single();

  // 3. Xóa Identity (Cascade hoặc xóa tay tùy DB config, ở đây xóa tay cho chắc)
  await supabase.from("zalo_identities").delete().eq("id", identityId);

  // 4. Xóa Bot Info
  if (data?.ref_bot_id) {
    await supabase.from("zalo_bot_info").delete().eq("id", data.ref_bot_id);
  }

  revalidatePath("/bot-manager");
  return { success: true };
}

/**
 * Trigger quy trình Login bằng QR Code
 */
export async function startBotLoginAction(identityId: string) {
  try {
    const manager = BotRuntimeManager.getInstance();

    // Gọi hàm startLoginQR -> Hàm này sẽ update DB status = QR_WAITING kèm base64 QR
    // Client sẽ lắng nghe realtime DB để hiện QR
    manager.startLoginQR(identityId);

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Login lại từ Token đã lưu (Resume Session)
 */
export async function startBotFromSavedTokenAction(identityId: string) {
  try {
    // 1. Lấy Token từ DB
    const { data: identity } = await supabase
      .from("zalo_identities")
      .select(
        "ref_bot_id, bot_info:zalo_bot_info(access_token, auto_sync_interval)",
      )
      .eq("id", identityId)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = (identity?.bot_info as any)?.access_token;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncInterval = (identity?.bot_info as any)?.auto_sync_interval || 0;

    if (!token)
      throw new Error("Không tìm thấy token. Vui lòng đăng nhập lại.");

    // 2. Gọi Runtime
    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(identityId, token, syncInterval);

    revalidatePath("/bot-manager");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Trigger đồng bộ dữ liệu thủ công
 */
export async function syncBotDataAction(botId: string) {
  try {
    const res = await SyncService.syncAll(botId);
    revalidatePath("/dashboard");
    return res;
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
