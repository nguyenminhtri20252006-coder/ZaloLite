/**
 * instrumentation.ts
 * [SYSTEM HOOK]
 * Logic: Kích hoạt Bot Runtime Manager ngay khi Server khởi động (Eager Init).
 * Đảm bảo Bot tự động online lại sau khi Docker container restart mà không cần chờ request từ user.
 */

export async function register() {
  // Chỉ chạy trên môi trường Node.js (Server-side), bỏ qua Edge Runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[System] 🚀 Server Booting... Initializing Services...");

    try {
      // Import động để tránh lỗi circular dependency hoặc build-time error
      const { BotRuntimeManager } = await import(
        "@/lib/core/bot-runtime-manager"
      );

      // Kích hoạt Singleton Instance
      // Hàm initSystem() bên trong sẽ tự động chạy reset và restore
      BotRuntimeManager.getInstance();

      console.log("[System] ✅ BotRuntimeManager Triggered Successfully.");
    } catch (error) {
      console.error("[System] ❌ Failed to initialize services:", error);
    }
  }
}
