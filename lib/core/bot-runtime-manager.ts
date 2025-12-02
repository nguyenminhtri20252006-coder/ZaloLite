/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE]
 * Quản lý đa luồng (Multi-Threaded) các instance Zalo Bot.
 * Thay thế hoàn toàn ZaloSingletonService cũ.
 */

import { Zalo, API } from "zca-js";
import { globalZaloEmitter, ZALO_EVENTS } from "@/lib/event-emitter";
import supabase from "@/lib/supabaseClient";
import { ZaloBot, ZaloBotStatus } from "@/lib/types/database.types";

// Kiểu lưu trữ runtime của một Bot
type BotRuntime = {
  instance: Zalo;
  api: API | null;
  status: ZaloBotStatus["state"];
  qrCode?: string;
};

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;

  // Map lưu trữ các bot đang chạy: <BotUUID, Runtime>
  private bots: Map<string, BotRuntime> = new Map();

  private constructor() {
    console.log("[BotManager] Khởi tạo Multi-Tenant Engine...");
  }

  public static getInstance(): BotRuntimeManager {
    // Đảm bảo Singleton Global để không bị reset khi HMR (Hot Module Reload)
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  /**
   * Khởi động một Bot từ cấu hình (Database hoặc New)
   */
  public getOrInitBot(botId: string): BotRuntime {
    if (this.bots.has(botId)) {
      return this.bots.get(botId)!;
    }

    console.log(`[BotManager] Khởi tạo Runtime cho Bot: ${botId}`);

    // Tạo instance Zalo mới
    const zaloInstance = new Zalo(
      {
        selfListen: true,
        logging: true,
      },
      // Session storage custom (nếu cần, hiện tại để default in-memory)
    );

    const runtime: BotRuntime = {
      instance: zaloInstance,
      api: null,
      status: "STOPPED",
    };

    this.bots.set(botId, runtime);
    return runtime;
  }

  /**
   * Kích hoạt đăng nhập QR cho một Bot cụ thể
   */
  public async startLoginQR(botId: string) {
    const runtime = this.getOrInitBot(botId);

    if (runtime.status === "LOGGED_IN" || runtime.status === "STARTING") {
      console.warn(`[BotManager] Bot ${botId} đang chạy hoặc đang đăng nhập.`);
      return;
    }

    runtime.status = "QR_WAITING";
    this.emitBotStatus(botId, "QR_WAITING");

    try {
      // Gọi hàm loginQR của zca-js
      const api = await runtime.instance.loginQR(
        {
          // Có thể truyền imei hoặc cookie cũ nếu muốn resume session
        },
        (qrData: any) => {
          // Callback nhận QR
          // Xử lý base64 image
          let base64 = "";
          if (typeof qrData === "string") base64 = qrData;
          else if (qrData.data?.image) base64 = qrData.data.image;

          if (base64 && !base64.startsWith("data:image")) {
            base64 = `data:image/png;base64,${base64}`;
          }

          runtime.qrCode = base64;
          console.log(`[BotManager] QR Generated for ${botId}`);

          // Emit sự kiện kèm botId để UI biết QR của ai
          globalZaloEmitter.emit(ZALO_EVENTS.QR_GENERATED, {
            botId,
            qrCode: base64,
          });
        },
      );

      // Login thành công
      this.handleLoginSuccess(botId, api);
    } catch (error: any) {
      console.error(`[BotManager] Lỗi Login Bot ${botId}:`, error);
      runtime.status = "ERROR";
      this.emitBotStatus(botId, "ERROR", error.message);
    }
  }

  /**
   * Xử lý khi đăng nhập thành công
   */
  private async handleLoginSuccess(botId: string, api: API) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    runtime.api = api;
    runtime.status = "LOGGED_IN";
    runtime.qrCode = undefined; // Clear QR

    console.log(`[BotManager] Bot ${botId} -> LOGGED IN`);
    this.emitBotStatus(botId, "LOGGED_IN");

    // 1. Lưu Credentials vào DB (access_token)
    await this.saveBotCredentials(botId, api);

    // 2. Cập nhật thông tin Bot (Name, Avatar, OA ID)
    await this.syncBotProfile(botId, api);

    // 3. Kích hoạt lắng nghe tin nhắn
    this.setupMessageListener(botId, api);
  }

  /**
   * Lưu Cookie/Token vào DB để lần sau tự đăng nhập
   */
  private async saveBotCredentials(botId: string, api: API) {
    const context = api.getContext(); // Lấy cookie, imei, userAgent

    // Chỉ lưu các trường cần thiết để resume session
    const credentials = {
      cookie: context.cookie,
      imei: context.imei,
      userAgent: context.userAgent,
      secretKey: context.secretKey, // Nếu có
    };

    await supabase
      .from("zalo_bots")
      .update({
        access_token: credentials, // Lưu vào cột JSONB
        updated_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", botId);
  }

  /**
   * Đồng bộ thông tin cơ bản của Bot về DB
   */
  private async syncBotProfile(botId: string, api: API) {
    try {
      // Giả sử zca-js có hàm getOwnId hoặc fetchAccountInfo
      // Nếu API hiện tại không có getOwnId, ta dùng fetchAccountInfo()
      const info: any = await api.fetchAccountInfo();

      const updateData = {
        global_id: info.userId || info.id || "unknown_id",
        name: info.displayName || info.zaloName || "Zalo Bot",
        avatar: info.avatar || "",
        phone: info.phone || null,
        // Cập nhật trạng thái JSONB
        status: {
          state: "LOGGED_IN",
          last_login: new Date().toISOString(),
        },
      };

      await supabase.from("zalo_bots").update(updateData).eq("id", botId);
    } catch (e) {
      console.error(`[BotManager] Sync profile failed for ${botId}`, e);
    }
  }

  /**
   * Thiết lập lắng nghe tin nhắn (Realtime Pipeline)
   */
  private setupMessageListener(botId: string, api: API) {
    api.listener.on("message", async (message: any) => {
      // Gọi Pipeline xử lý tin nhắn tại đây (sẽ implement ở file message-pipeline.ts)
      // Tạm thời log ra console
      // console.log(`[Bot ${botId}] New Message:`, message.data?.content);

      // Emit sự kiện nội bộ nếu cần (nhưng chính là lưu vào DB)
      globalZaloEmitter.emit(ZALO_EVENTS.NEW_MESSAGE, {
        botId,
        message,
      });
    });

    api.listener.start();
  }

  /**
   * Helper: Emit status update ra Global Emitter (để SSE đẩy về Client)
   */
  private emitBotStatus(
    botId: string,
    state: ZaloBotStatus["state"],
    error?: string,
  ) {
    globalZaloEmitter.emit(ZALO_EVENTS.STATUS_UPDATE, {
      botId,
      status: { state, error_message: error },
    });
  }

  /**
   * Public API: Lấy Zalo API instance để gửi tin nhắn
   */
  public getBotAPI(botId: string): API {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) {
      throw new Error(`Bot ${botId} chưa đăng nhập hoặc không tồn tại.`);
    }
    return runtime.api;
  }

  /**
   * Public API: Khôi phục tất cả bot từ DB (Dùng khi server restart)
   */
  public async restoreBotsFromDB() {
    const { data: bots } = await supabase
      .from("zalo_bots")
      .select("*")
      .eq("is_active", true);

    if (!bots) return;

    console.log(`[BotManager] Found ${bots.length} active bots. Restoring...`);

    for (const bot of bots) {
      if (bot.access_token && Object.keys(bot.access_token).length > 0) {
        this.resumeBotSession(bot.id, bot.access_token);
      }
    }
  }

  private async resumeBotSession(botId: string, credentials: any) {
    const runtime = this.getOrInitBot(botId);
    runtime.status = "STARTING";
    this.emitBotStatus(botId, "STARTING");

    try {
      // Login với credentials cũ
      const api = await runtime.instance.login(credentials);
      this.handleLoginSuccess(botId, api);
    } catch (e) {
      console.error(`[BotManager] Failed to resume bot ${botId}`, e);
      runtime.status = "ERROR";
      this.emitBotStatus(botId, "ERROR", "Session expired or invalid");

      // Update DB là bot đã chết
      await supabase
        .from("zalo_bots")
        .update({
          status: { state: "ERROR", error: "Session expired" },
        })
        .eq("id", botId);
    }
  }
  /**
   * [NEW] Đăng nhập thủ công bằng Token/Credentials (JSON)
   */
  public async loginWithCredentials(botId: string, credentials: any) {
    const runtime = this.getOrInitBot(botId);

    if (runtime.status === "LOGGED_IN") {
      throw new Error(
        "Bot này đang hoạt động. Vui lòng tắt trước khi đăng nhập lại.",
      );
    }

    runtime.status = "STARTING";
    this.emitBotStatus(botId, "STARTING");

    try {
      console.log(`[BotManager] Login with Token for ${botId}...`);

      // Gọi thư viện login với credentials được cung cấp
      const api = await runtime.instance.login(credentials);

      // Nếu thành công -> Xử lý như bình thường
      await this.handleLoginSuccess(botId, api);

      return { success: true };
    } catch (error: any) {
      console.error(`[BotManager] Token Login Failed for ${botId}:`, error);
      runtime.status = "ERROR";
      this.emitBotStatus(botId, "ERROR", error.message);
      throw error;
    }
  }

  /**
   * [NEW] Logout Bot (Dừng runtime)
   */
  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      // Dừng listener nếu có
      // runtime.api?.listener?.stop(); // Nếu thư viện hỗ trợ
      runtime.api = null;
      runtime.status = "STOPPED";
      this.emitBotStatus(botId, "STOPPED");
      console.log(`[BotManager] Stopped bot ${botId}`);
    }
  }
}
