/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE]
 * Fix: Gộp update profile và status để tránh lỗi hiển thị UI.
 */

import { Zalo, API } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus } from "@/lib/types/database.types";

// Kiểu lưu trữ runtime
type BotRuntime = {
  instance: Zalo;
  api: API | null;
  status: ZaloBotStatus["state"];
};

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();
  private messagePipeline: MessagePipeline;

  private constructor() {
    console.log("[BotManager] Khởi tạo Multi-Tenant Engine...");
    this.messagePipeline = new MessagePipeline();
    this.restoreBotsFromDB();
  }

  public static getInstance(): BotRuntimeManager {
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  /**
   * [AUTO-RESTORE] Khôi phục tất cả bot active từ DB khi khởi động lại
   */
  public async restoreBotsFromDB() {
    // (Logic cũ giữ nguyên)
    const { data: bots } = await supabase
      .from("zalo_bots")
      .select("*")
      .eq("is_active", true);
    if (bots) {
      bots.forEach((b) => {
        if (b.access_token)
          this.loginWithCredentials(b.id, b.access_token).catch(console.error);
      });
    }
  }

  public getOrInitBot(botId: string): BotRuntime {
    if (this.bots.has(botId)) return this.bots.get(botId)!;
    const instance = new Zalo({ selfListen: true, logging: true });
    const runtime = { instance, api: null, status: "STOPPED" as const };
    this.bots.set(botId, runtime);
    return runtime;
  }

  /**
   * [FLOW 1] Đăng nhập bằng QR
   */
  public async startLoginQR(botId: string) {
    const runtime = this.getOrInitBot(botId);

    if (runtime.status === "LOGGED_IN") return;

    // Update DB: Chờ QR
    await this.updateBotStatusInDB(botId, "QR_WAITING");
    runtime.status = "QR_WAITING";

    try {
      const api = await runtime.instance.loginQR({}, async (qrData: any) => {
        let base64 = typeof qrData === "string" ? qrData : qrData.data?.image;
        if (base64 && !base64.startsWith("data:image"))
          base64 = `data:image/png;base64,${base64}`;
        await this.updateBotStatusInDB(botId, "QR_WAITING", undefined, base64);
      });
      await this.handleLoginSuccess(botId, api);
    } catch (error: any) {
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", error.message);
    }
  }

  /**
   * [FLOW 2] Đăng nhập bằng Token (Hoặc Restore)
   */
  public async loginWithCredentials(botId: string, credentials: any) {
    const runtime = this.getOrInitBot(botId);
    if (runtime.status === "LOGGED_IN") return { success: true };

    await this.updateBotStatusInDB(botId, "STARTING");
    runtime.status = "STARTING";

    try {
      const api = await runtime.instance.login(credentials);
      await this.handleLoginSuccess(botId, api);
      return { success: true };
    } catch (error: any) {
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", error.message);
      throw error;
    }
  }

  /**
   * [UPDATED] Xử lý login thành công với cơ chế Atomic Update
   */
  private async handleLoginSuccess(botId: string, api: API) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    if (runtime.api) {
      try {
        runtime.api.listener.stop();
      } catch {}
    }

    // Gán API mới
    runtime.api = api;
    runtime.status = "LOGGED_IN";

    console.log(`[BotManager] Bot ${botId} -> LOGGED IN. Fetching Profile...`);

    // 1. Fetch Profile info TRƯỚC
    let profileUpdate = {};
    try {
      const info: any = await api.fetchAccountInfo();
      profileUpdate = {
        global_id: info.userId || info.id || info.uid,
        name: info.displayName || info.zaloName || info.name || "Zalo Bot",
        avatar: info.avatar || info.img || info.picture || "",
        phone: info.phone || info.phoneNumber || null,
      };
    } catch (e) {
      console.warn("[BotManager] Failed to fetch profile:", e);
    }

    // 2. Prepare Credentials
    const context = api.getContext();
    const credentials = {
      cookie: context.cookie,
      imei: context.imei,
      userAgent: context.userAgent,
    };

    // 3. ATOMIC UPDATE: Cập nhật TẤT CẢ (Status + Profile + Token) trong 1 lệnh
    // Điều này đảm bảo khi UI nhận được event UPDATE, data đã đầy đủ.
    await supabase
      .from("zalo_bots")
      .update({
        ...profileUpdate,
        access_token: credentials,
        is_active: true,
        status: {
          state: "LOGGED_IN",
          last_login: new Date().toISOString(),
          error_message: null,
          qr_code: null,
        },
      })
      .eq("id", botId);

    // 4. Start Listener
    this.setupMessageListener(botId, api);
  }

  private setupMessageListener(botId: string, api: API) {
    // Không gọi api.listener.off vì api mới tinh
    api.listener.on("message", async (message: any) => {
      // Đẩy vào Pipeline
      await this.messagePipeline.process(botId, message);
    });

    api.listener.start();
  }

  private async updateBotStatusInDB(
    botId: string,
    state: ZaloBotStatus["state"],
    error?: string,
    qrCode?: string,
  ) {
    const statusObj = {
      state,
      error_message: error,
      qr_code: qrCode,
      last_update: new Date().toISOString(),
    };
    await supabase
      .from("zalo_bots")
      .update({ status: statusObj })
      .eq("id", botId);
  }

  public getBotAPI(botId: string): API {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api)
      throw new Error(`Bot ${botId} chưa sẵn sàng.`);
    return runtime.api;
  }

  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      if (runtime.api)
        try {
          runtime.api.listener.stop();
        } catch {}
      runtime.api = null;
      runtime.status = "STOPPED";
      await this.updateBotStatusInDB(botId, "STOPPED");
    }
  }
}
