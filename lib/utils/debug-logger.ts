/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/utils/debug-logger.ts
 * Tiện ích log chuyên dụng cho Zalo Events
 */

export type LogMode = "summary" | "detail";

// [HARD CODE] Đổi thành 'summary' nếu muốn log gọn, 'detail' để xem full JSON
const CURRENT_MODE: LogMode = "detail";

export class DebugLogger {
  static logEvent(botId: string, eventName: string, payload: any) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}][Listener:${botId}] ⚡ ${eventName}`;

    if (CURRENT_MODE === "detail") {
      console.log(`\n${prefix}`);
      console.log(JSON.stringify(payload, null, 2));
      console.log("-".repeat(50));
    } else {
      // Summary Mode
      const data = payload.data || {};
      const threadId = payload.threadId || data.sourceId || "unknown";
      const sender = data.uidFrom || "unknown";
      const type = data.msgType || "unknown";

      console.log(
        `${prefix} | Type: ${type} | Thread: ${threadId} | From: ${sender}`,
      );
    }
  }

  static logPipeline(step: string, message: string, data?: any) {
    if (CURRENT_MODE === "detail") {
      console.log(`[Pipeline:${step}] ${message}`, data ? data : "");
    } else {
      // Chỉ log lỗi hoặc success quan trọng
      if (step.includes("Error") || step.includes("Success")) {
        console.log(`[Pipeline] ${message}`);
      }
    }
  }
}
