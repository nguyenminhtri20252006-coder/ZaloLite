"use server";

/**
 * lib/actions/bot.actions.ts
 * Server Actions để giao tiếp giữa UI và BotRuntimeManager.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import supabase from "@/lib/supabaseClient";
import { revalidatePath } from "next/cache";
import { ZaloBot } from "@/lib/types/database.types";

/**
 * Lấy danh sách tất cả các Bot
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
 * Tạo mới một Bot (Placeholder)
 */
export async function createBotAction(name: string) {
  const { data, error } = await supabase
    .from("zalo_bots")
    .insert({
      name: name,
      global_id: `temp_${Date.now()}`, // ID tạm, sẽ update khi login thành công
      status: { state: "STOPPED" },
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard"); // Refresh UI
  return data as ZaloBot;
}

/**
 * Yêu cầu bắt đầu Login QR cho Bot
 */
export async function startBotLoginAction(botId: string) {
  console.log(`[Action] Trigger Login QR for bot: ${botId}`);
  const manager = BotRuntimeManager.getInstance();

  // Hàm này là void, chạy ngầm. Kết quả trả về qua SSE event.
  // Chúng ta không await kết quả login, chỉ await việc kích hoạt.
  await manager.startLoginQR(botId);

  return { success: true, message: "QR Code is generating..." };
}

/**
 * Xóa Bot
 */
export async function deleteBotAction(botId: string) {
  const { error } = await supabase.from("zalo_bots").delete().eq("id", botId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
