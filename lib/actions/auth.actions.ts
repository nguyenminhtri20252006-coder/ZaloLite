"use server";

/**
 * lib/actions/auth.actions.ts
 * Chuyên trách các hành động xác thực Zalo (Zalo Authentication).
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";

/**
 * Đăng nhập Bot bằng Token (Session JSON)
 */
export async function startLoginWithTokenAction(
  botId: string,
  tokenJson: string,
) {
  if (!botId || !tokenJson) {
    return { success: false, error: "Thiếu thông tin Bot ID hoặc Token." };
  }

  try {
    // Parse JSON
    let credentials;
    try {
      credentials = JSON.parse(tokenJson);
    } catch (e) {
      return { success: false, error: "Token không đúng định dạng JSON." };
    }

    // Validate cấu trúc cơ bản
    if (!credentials.imei || !credentials.cookie) {
      return { success: false, error: "Token thiếu IMEI hoặc Cookie." };
    }

    // Gọi Runtime
    const manager = BotRuntimeManager.getInstance();
    await manager.loginWithCredentials(botId, credentials);

    return { success: true, message: "Đăng nhập thành công!" };
  } catch (error: any) {
    console.error("[AuthAction] Token Login Error:", error);
    return {
      success: false,
      error: error.message || "Lỗi đăng nhập không xác định.",
    };
  }
}

/**
 * Đăng xuất Bot (Stop Runtime)
 */
export async function logoutBotAction(botId: string) {
  try {
    const manager = BotRuntimeManager.getInstance();
    await manager.stopBot(botId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
