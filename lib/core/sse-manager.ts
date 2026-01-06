/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/sse-manager.ts
 * [FIXED V9.4] GLOBAL SINGLETON PATTERN
 * - Sử dụng globalThis để đảm bảo API Route và Server Action dùng chung 1 instance.
 */

type SSEClient = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

class SSEManager {
  // Map lưu trữ kết nối: key = sessionId, value = Client Stream
  private clients: Map<string, SSEClient> = new Map();

  constructor() {
    console.log("[SSE-Manager] 🔥 Initializing Global Instance");
  }

  // Đăng ký một client mới
  public addClient(id: string, controller: ReadableStreamDefaultController) {
    this.clients.set(id, {
      controller,
      encoder: new TextEncoder(),
    });
    console.log(
      `[SSE-Manager] Client connected: ${id} (Total: ${this.clients.size})`,
    );
  }

  // Hủy client
  public removeClient(id: string) {
    this.clients.delete(id);
    console.log(`[SSE-Manager] Client disconnected: ${id}`);
  }

  // Gửi sự kiện xuống Client cụ thể
  public sendEvent(id: string, eventName: string, data: any) {
    console.log(`[SSE-Manager] Attempting to send '${eventName}' to ${id}`);

    const client = this.clients.get(id);

    if (!client) {
      console.warn(
        `[SSE-Manager] ❌ FAILED: Client not found for ID: ${id}. Available clients: ${Array.from(
          this.clients.keys(),
        ).join(", ")}`,
      );
      return;
    }

    try {
      const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
      client.controller.enqueue(client.encoder.encode(payload));
      console.log(`[SSE-Manager] ✅ Sent ${payload.length} bytes to ${id}`);
    } catch (error) {
      console.error(`[SSE-Manager] Error sending to ${id}:`, error);
      this.removeClient(id);
    }
  }
}

// --- LOGIC SINGLETON CHUẨN CHO NEXT.JS ---
// Mở rộng global interface để TypeScript không báo lỗi (hoặc dùng @ts-nocheck ở đầu file)
const globalAny: any = global;

if (!globalAny.sseManager) {
  globalAny.sseManager = new SSEManager();
}

export const sseManager = globalAny.sseManager as SSEManager;
