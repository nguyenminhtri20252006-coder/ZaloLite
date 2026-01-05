/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/bot-runtime-manager.ts
 * [REFACTORED V8.4 - FIX QR LOGIN & CONSTRUCTOR]
 * - Reverted to 'loginQR' method (Standard ZCA).
 * - Fixed Zalo constructor arguments.
 * - Removed manual API instantiation.
 */

import { Zalo, API } from "zca-js";
import { HttpProxyAgent } from "http-proxy-agent";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus, HealthCheckLog } from "@/lib/types/database.types";

interface ZaloCredentials {
  imei: string;
  cookie: any;
  userAgent: string;
  zpw_enk?: string;
  zpw_service_token?: string;
  session_key?: string;
  proxy?: string;
}

type BotRuntime = {
  instance: any; // Use any to interact with Zalo class freely
  api: API | null;
  status: ZaloBotStatus["state"];
  pollingInterval?: NodeJS.Timeout;
  healthCheckTimer?: NodeJS.Timeout;
  lastPing?: number;
  botInfoId?: string;
  currentProxy?: string;
};

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
const INACTIVE_THRESHOLD = 10 * 60 * 1000;

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();
  private messagePipeline: MessagePipeline;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    console.log("[BotManager] 🚀 Initializing Engine V8.4...");
    this.messagePipeline = new MessagePipeline();
    this.initSystem();
  }

  public static getInstance(): BotRuntimeManager {
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  private async initSystem() {
    try {
      // Reset statuses
      await supabase
        .from("zalo_bot_info")
        .update({
          status: { state: "STOPPED", message: "Server Restarted" },
        })
        .neq("status->>state", "STOPPED");
    } catch (e) {
      console.error("[BotManager] Init System Error:", e);
    }
    this.startHealthCheckLoop();
  }

  // ===========================================================================
  // 1. INSTANCE MANAGEMENT
  // ===========================================================================

  public getOrInitBot(botId: string, proxyUrl?: string): BotRuntime {
    let runtime = this.bots.get(botId);

    if (!runtime || (proxyUrl && proxyUrl !== runtime.currentProxy)) {
      if (runtime) this.stopBot(botId);

      const zaloOptions: any = {
        selfListen: true,
      };

      if (proxyUrl && proxyUrl.trim() !== "") {
        try {
          zaloOptions.httpAgent = new HttpProxyAgent(proxyUrl);
        } catch (e) {
          console.error(`[BotManager] Invalid Proxy:`, e);
        }
      }

      // [FIX] Constructor takes 1 argument: options
      const instance = new Zalo(zaloOptions);

      runtime = {
        instance,
        api: null,
        status: "STOPPED",
        lastPing: Date.now(),
        botInfoId: undefined,
        currentProxy: proxyUrl,
      };
      this.bots.set(botId, runtime);
    }
    return runtime;
  }

  // ===========================================================================
  // 2. LOGIN FLOW: QR CODE (STANDARD LOGIN_QR)
  // ===========================================================================

  public async startLoginQR(botId: string) {
    const runtime = this.getOrInitBot(botId);

    if (!runtime.botInfoId) {
      const { data } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();
      if (data?.ref_bot_id) runtime.botInfoId = data.ref_bot_id;
    }

    if (!runtime.botInfoId) throw new Error("Bot Info ID not found in DB");

    try {
      await this.updateBotStatusInDB(
        runtime.botInfoId,
        "STARTING",
        "Đang khởi tạo QR...",
      );
      runtime.status = "STARTING";

      // [FIX] Sử dụng loginQR thay vì getQrCode
      // loginQR sẽ tự handle polling và trả về api khi thành công
      const api = await runtime.instance.loginQR(
        {
          // Có thể truyền thêm params nếu thư viện yêu cầu
        },
        async (qrData: any) => {
          // Callback nhận QR Code
          console.log(`[QR] Received for ${botId}`);

          // Xử lý format base64
          let base64 =
            typeof qrData === "string"
              ? qrData
              : qrData.data?.image || qrData.image;
          if (base64 && !base64.startsWith("data:image")) {
            base64 = `data:image/png;base64,${base64}`;
          }

          // Update DB để Client hiển thị
          await this.updateBotStatusInDB(
            runtime.botInfoId!,
            "QR_WAITING",
            "Vui lòng quét mã QR",
            base64,
          );
          runtime.status = "QR_WAITING";
        },
      );

      // Khi await loginQR xong -> Đã đăng nhập thành công
      console.log(`[QR] Login Success for ${botId}`);

      const credentials = runtime.instance.getCredentials();
      await this.handleLoginSuccess(botId, api, credentials);
    } catch (e: any) {
      console.error(`[QR] Login Error:`, e);
      await this.updateBotStatusInDB(
        runtime.botInfoId,
        "ERROR",
        e.message || "Lỗi lấy mã QR",
      );
    }
  }

  // ===========================================================================
  // 3. LOGIN FLOW: TOKEN (RESTORE)
  // ===========================================================================

  public async loginWithCredentials(
    botId: string,
    credentials: any,
    autoSyncInterval: number = 0,
  ) {
    const creds = credentials as ZaloCredentials;
    const runtime = this.getOrInitBot(botId, creds.proxy);

    if (!runtime.botInfoId) {
      const { data } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();
      if (data?.ref_bot_id) runtime.botInfoId = data.ref_bot_id;
    }

    try {
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(
          runtime.botInfoId,
          "STARTING",
          "Đang khôi phục phiên...",
        );
      }

      // [FIX] Merge credentials vào options cho Constructor
      const options = {
        ...creds,
        selfListen: true,
        httpAgent: runtime.currentProxy
          ? new HttpProxyAgent(runtime.currentProxy)
          : undefined,
      };

      // Re-create instance with credentials
      runtime.instance = new Zalo(options);

      // [FIX] Gọi login với credentials (hoặc không tham số nếu constructor đã nhận)
      // Để an toàn và tương thích nhiều version, truyền lại credentials
      const api = await runtime.instance.login(creds);

      // Lấy credentials mới nhất
      const updatedCreds = runtime.instance.getCredentials();
      if (runtime.currentProxy) {
        (updatedCreds as any).proxy = runtime.currentProxy;
      }

      await this.handleLoginSuccess(botId, api, updatedCreds);
    } catch (e: any) {
      console.error(`[Login] Restore Failed ${botId}:`, e);
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(
          runtime.botInfoId,
          "ERROR",
          "Token lỗi/hết hạn: " + e.message,
        );
      }
      throw e;
    }
  }

  // ===========================================================================
  // 4. HANDLERS
  // ===========================================================================

  private async handleLoginSuccess(botId: string, api: API, credentials: any) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.botInfoId) return;

    runtime.api = api;
    runtime.status = "LOGGED_IN";

    // 1. Sync Profile (Fallback if fail)
    try {
      // Dùng any để tránh lỗi type checker
      const info: any = await api.fetchAccountInfo();
      const displayName =
        info.display_name || info.name || info.zalo_name || "Unknown Bot";
      const avatar = info.avatar || "";

      await supabase
        .from("zalo_identities")
        .update({
          display_name: displayName,
          name: displayName,
          avatar: avatar,
          updated_at: new Date().toISOString(),
        })
        .eq("id", botId);
    } catch (e) {
      console.warn("[Login] Fetch Profile Warning:", e);
    }

    // 2. Update DB
    await supabase
      .from("zalo_bot_info")
      .update({
        access_token: credentials,
        status: {
          state: "LOGGED_IN",
          message: "Đang hoạt động",
          qr_code: null,
          last_update: new Date().toISOString(),
        },
        last_active_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", runtime.botInfoId);

    // 3. Start Listener
    this.setupMessageListener(botId, api);

    console.log(`[BotManager] ${botId} is Online & Listening.`);
  }

  private setupMessageListener(botId: string, api: API) {
    const rawApi = api as any;

    if (rawApi.listener) {
      rawApi.listener.off("message");
      rawApi.listener.off("error");
    }

    rawApi.listener.on("message", async (message: any) => {
      this.updateHeartbeat(botId);
      await this.messagePipeline.process(botId, message);
    });

    rawApi.listener.on("error", (err: any) => {
      console.error(`[Socket] Error ${botId}:`, err);
    });

    rawApi.listener.start();
  }

  private updateHeartbeat(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      runtime.lastPing = Date.now();
      if (runtime.botInfoId) {
        supabase
          .from("zalo_bot_info")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", runtime.botInfoId)
          .then();
      }
    }
  }

  private async updateBotStatusInDB(
    infoId: string,
    state: string,
    msg?: string,
    qr?: string,
  ) {
    await supabase
      .from("zalo_bot_info")
      .update({
        status: {
          state,
          message: msg,
          qr_code: qr,
          last_update: new Date().toISOString(),
        },
      })
      .eq("id", infoId);
  }

  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      try {
        if (runtime.api) (runtime.api as any).listener.stop();
      } catch {}

      runtime.status = "STOPPED";
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(
          runtime.botInfoId,
          "STOPPED",
          "Dừng thủ công",
        );
      }
      this.bots.delete(botId);
    }
  }

  public getBotAPI(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api)
      throw new Error("Bot chưa sẵn sàng (Offline)");
    return runtime.api;
  }

  // [ADDED] Methods required by bot.actions.ts
  public async startRealtime(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) throw new Error("Bot chưa đăng nhập");

    console.log(`[Runtime] Start Realtime for ${botId}`);
    (runtime.api as any).listener.start();

    if (runtime.botInfoId) {
      await this.updateBotStatusInDB(runtime.botInfoId, "ACTIVE");
    }
  }

  public async stopRealtime(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) return;

    console.log(`[Runtime] Stop Realtime for ${botId}`);
    (runtime.api as any).listener.stop();

    if (runtime.botInfoId) {
      await this.updateBotStatusInDB(runtime.botInfoId, "LOGGED_IN");
    }
  }

  private startHealthCheckLoop() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    this.healthCheckTimer = setInterval(async () => {
      const now = Date.now();

      for (const [botId, runtime] of this.bots.entries()) {
        if (runtime.status !== "LOGGED_IN" && runtime.status !== "ACTIVE")
          continue;

        const diff = now - (runtime.lastPing || 0);
        if (diff > INACTIVE_THRESHOLD) {
          try {
            // Ping check
            if (runtime.api) {
              await runtime.api.fetchAccountInfo();
              this.updateHeartbeat(botId);
            }
          } catch (error) {
            console.error(`[HealthCheck] Bot ${botId} Failed Ping.`);
            await this.handleBotDeath(botId, error);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  private async handleBotDeath(botId: string, error: unknown) {
    console.error(`[BotManager] Bot Died ${botId}`, error);
    await this.stopBot(botId);

    const { data } = await supabase
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", botId)
      .single();
    if (data?.ref_bot_id) {
      await this.updateBotStatusInDB(data.ref_bot_id, "ERROR", String(error));
    }
  }

  public async reportError(botId: string, error: any) {
    await this.handleBotDeath(botId, error);
  }
}
