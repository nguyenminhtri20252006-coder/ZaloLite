"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";

// Lấy thông tin raw của user để inspect
export async function getRawUserInfoAction(
  userId: string,
  phoneNumber?: string | null,
) {
  try {
    // Logic tạm: Cần botId
    return {
      userId,
      phoneNumber,
      status: "Not implemented: Missing botId context",
    };
  } catch (error) {
    return { error: String(error) };
  }
}
