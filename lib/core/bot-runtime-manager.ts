/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE - V4.4 FULL RAW LOGGING]
 * - Lưu trữ toàn bộ object lỗi (không cắt string).
 * - Lưu trữ raw response khi ping thành công.
 * - Capture stack trace đầy đủ.
 */

import { Zalo, API } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus, HealthCheckLog } from "@/lib/types/database.types";
import { SyncService } from "@/lib/core/services/sync-service";

interface ZaloCredentials {
  imei: string;
  cookie: unknown;
  userAgent: string;
}

type BotRuntime = {
  instance: Zalo;
  api: API | null;
  status: ZaloBotStatus["state"];
  pollingInterval?: NodeJS.Timeout;
  lastPing?: number;
};

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
const INACTIVE_THRESHOLD = 10 * 60 * 1000;

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();
  private messagePipeline: MessagePipeline;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    console.log(
      "[BotManager] 🚀 Khởi tạo Engine V4.5 (Centralized Error Reporting)...",
    );
    this.messagePipeline = new MessagePipeline();
    this.initSystem();
  }

  public static getInstance(): BotRuntimeManager {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  private async initSystem() {
    try {
      await this.resetAllBotStatusOnStartup();
      await this.restoreBotsFromDB();
      this.startHealthCheckLoop();
    } catch (e) {
      console.error("[BotManager] ❌ Init System Failed:", e);
    }
  }

  // --- RESET & RESTORE ---

  private async resetAllBotStatusOnStartup() {
    console.log("[BotManager] 🧹 Resetting Zombie Bots...");
    await supabase
      .from("zalo_bots")
      .update({
        status: {
          state: "STOPPED",
          error_message: "System Restarted",
          last_update: new Date().toISOString(),
        },
      })
      .neq("status->>state", "ERROR")
      .neq("status->>state", "STOPPED");
  }

  public async restoreBotsFromDB() {
    console.log("[BotManager] 🔄 Restoring Active Bots...");
    const { data: bots } = await supabase
      .from("zalo_bots")
      .select("*")
      .eq("is_active", true);

    if (bots && bots.length > 0) {
      console.log(`[BotManager] Found ${bots.length} active bots.`);
      bots.forEach((b) => {
        const creds = b.access_token as ZaloCredentials | null;
        if (creds && creds.cookie) {
          this.loginWithCredentials(b.id, creds, b.auto_sync_interval).catch(
            (e) => {
              // Log raw lỗi khôi phục
              console.warn(`[Restore] Failed ${b.name}:`, e);
            },
          );
        }
      });
    }
  }

  // [NEW] PUBLIC METHOD CHO MODULE KHÁC GỌI
  public async reportError(botId: string, error: unknown) {
    await this.handleBotDeath(botId, error);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private serializeError(error: any): any {
    if (typeof error === "object" && error !== null) {
      return {
        message: error.message,
        name: error.name,
        stack: error.stack,
        code: error.code,
        data: error.data,
        ...error,
      };
    }
    return { message: String(error) };
  }

  // --- HEALTH CHECK DOCTOR ---

  private startHealthCheckLoop() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    this.healthCheckTimer = setInterval(async () => {
      console.log("[HealthCheck] 🩺 Scanning bots...");
      const now = Date.now();

      for (const [botId, runtime] of this.bots.entries()) {
        if (runtime.status !== "LOGGED_IN" || !runtime.api) continue;

        const lastActive = runtime.lastPing || 0;
        const diff = now - lastActive;

        if (diff > INACTIVE_THRESHOLD) {
          const start = Date.now();
          let log: HealthCheckLog;

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await runtime.api.fetchAccountInfo();
            const latency = Date.now() - start;

            log = {
              timestamp: new Date().toISOString(),
              action: "PING",
              status: "OK",
              message: "Ping success (Keep-alive)",
              latency: latency,
              // Lưu raw response để debug nếu cần xem Zalo trả về gì
              raw_data: response,
            };

            this.updateHeartbeat(botId);
            console.log(`[HealthCheck] ${botId} OK (${latency}ms)`);
          } catch (error) {
            const rawErr = this.serializeError(error);
            const errStr = rawErr.message || String(error);

            log = {
              timestamp: new Date().toISOString(),
              action: "PING",
              status: "FAIL",
              message: errStr,
              raw_data: rawErr,
              error_stack: rawErr.stack,
            };
            console.error(`[HealthCheck] ${botId} FAILED.`);
            await this.handleBotDeath(botId, error);
          }

          await this.saveHealthCheckLog(botId, log);
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  private async saveHealthCheckLog(botId: string, log: HealthCheckLog) {
    try {
      await supabase
        .from("zalo_bots")
        .update({ health_check_log: log })
        .eq("id", botId);
    } catch (e) {
      console.error("[BotManager] Save log failed:", e);
    }
  }

  // --- STRICT ERROR HANDLING (FULL LOG) ---
  private async handleBotDeath(botId: string, error: unknown) {
    const rawErr = this.serializeError(error);
    const errStr = rawErr.message || String(error);

    // Kiểm tra nếu bot đã chết rồi thì không spam update DB nữa
    const runtime = this.bots.get(botId);
    if (runtime && runtime.status === "ERROR") {
      return;
    }

    console.error(`[BotManager] 💀 Bot Died ${botId}. Cause:`, errStr);

    // 1. Dừng Runtime
    await this.stopBot(botId);

    // 2. Cập nhật DB: ERROR & IS_ACTIVE = FALSE
    // Lưu full error message vào cột status
    await supabase
      .from("zalo_bots")
      .update({
        is_active: false,
        status: {
          state: "ERROR",
          error_message: errStr,
          last_update: new Date().toISOString(),
          // Lưu thêm context vào status nếu cần thiết debug nhanh
          debug_code: rawErr.code,
        },
        // Đồng thời cập nhật luôn health_check_log với context "ERROR_HANDLER"
        health_check_log: {
          timestamp: new Date().toISOString(),
          action: "ERROR_HANDLER",
          status: "FAIL",
          message: errStr,
          raw_data: rawErr,
          error_stack: rawErr.stack,
        },
      })
      .eq("id", botId);
  }

  // --- CORE ACTIONS ---

  public getOrInitBot(botId: string): BotRuntime {
    if (this.bots.has(botId)) return this.bots.get(botId)!;
    const instance = new Zalo({ selfListen: true, logging: false });
    const runtime: BotRuntime = {
      instance,
      api: null,
      status: "STOPPED",
      lastPing: Date.now(),
    };
    this.bots.set(botId, runtime);
    return runtime;
  }

  public async loginWithCredentials(
    botId: string,
    credentials: unknown,
    autoSyncInterval: number = 0,
  ) {
    const runtime = this.getOrInitBot(botId);
    await this.updateBotStatusInDB(botId, "STARTING");
    runtime.status = "STARTING";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = await runtime.instance.login(credentials as any);
      await this.handleLoginSuccess(botId, api, autoSyncInterval);
      return { success: true };
    } catch (error: unknown) {
      console.error(`[BotManager] Login Failed (${botId})`);
      await this.handleBotDeath(botId, error);
      throw error;
    }
  }

  public async startLoginQR(botId: string) {
    const runtime = this.getOrInitBot(botId);
    if (runtime.status === "LOGGED_IN") return;

    await this.updateBotStatusInDB(botId, "QR_WAITING");
    runtime.status = "QR_WAITING";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = await runtime.instance.loginQR({}, async (qrData: any) => {
        let base64 = typeof qrData === "string" ? qrData : qrData.data?.image;
        if (
          base64 &&
          typeof base64 === "string" &&
          !base64.startsWith("data:image")
        ) {
          base64 = `data:image/png;base64,${base64}`;
        }
        await this.updateBotStatusInDB(botId, "QR_WAITING", undefined, base64);
      });
      await this.handleLoginSuccess(botId, api);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", errMsg);
    }
  }

  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      if (runtime.pollingInterval) clearInterval(runtime.pollingInterval);
      if (runtime.api) {
        try {
          runtime.api.listener.stop();
        } catch {}
      }
      runtime.api = null;
      runtime.status = "STOPPED";
      await this.updateBotStatusInDB(botId, "STOPPED");
      this.bots.delete(botId);
    }
  }

  // --- HANDLERS ---

  private async handleLoginSuccess(
    botId: string,
    api: API,
    autoSyncInterval: number = 0,
  ) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    if (runtime.pollingInterval) clearInterval(runtime.pollingInterval);

    runtime.api = api;
    runtime.status = "LOGGED_IN";
    runtime.lastPing = Date.now();

    await this.updateBotInfoAndHeartbeat(botId, api);
    this.setupMessageListener(botId, api);

    // Log sự kiện login thành công
    await this.saveHealthCheckLog(botId, {
      timestamp: new Date().toISOString(),
      action: "LOGIN",
      status: "OK",
      message: "Login successful via Credentials/QR",
      latency: 0,
    });

    this.triggerSync(botId, "LOGIN_INIT");

    if (autoSyncInterval > 0) {
      runtime.pollingInterval = setInterval(() => {
        this.triggerSync(botId, "AUTO_POLLING");
      }, autoSyncInterval * 60 * 1000);
    }
  }

  private setupMessageListener(botId: string, api: API) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("message", async (message: any) => {
      this.updateHeartbeat(botId);
      await this.messagePipeline.process(botId, message);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("error", async (err: any) => {
      console.error(`[BotManager] ⚡ Socket Error (${botId}):`, err);
      // Ghi log raw lỗi socket
      await this.handleBotDeath(botId, err);
    });
    api.listener.start();
  }

  private async triggerSync(botId: string, source: string) {
    try {
      const res = await SyncService.syncAll(botId);
      if (res.success) {
        this.updateHeartbeat(botId);
        // Log sync success (optional)
      } else {
        // Sync lỗi -> Kill và ghi log raw
        await this.handleBotDeath(botId, res.error);
      }
    } catch (e) {
      await this.handleBotDeath(botId, e);
    }
  }

  private updateHeartbeat(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) runtime.lastPing = Date.now();

    supabase
      .from("zalo_bots")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", botId)
      .then();
  }

  private async updateBotInfoAndHeartbeat(botId: string, api: API) {
    try {
      const infoResponse = await api.fetchAccountInfo();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsedInfo: any = infoResponse;
      if (typeof infoResponse === "string") {
        try {
          parsedInfo = JSON.parse(infoResponse);
        } catch {}
      }
      const profile = parsedInfo?.data || parsedInfo?.profile || parsedInfo;
      const globalId =
        profile?.userId || profile?.id || profile?.uid || api.getOwnId();

      const context = api.getContext();
      const credentials = {
        cookie: context.cookie,
        imei: context.imei,
        userAgent: context.userAgent,
      };

      await supabase
        .from("zalo_bots")
        .update({
          global_id: globalId,
          name:
            profile?.displayName || profile?.zaloName || `Zalo Bot ${globalId}`,
          avatar: profile?.avatar || profile?.picture || "",
          raw_data: parsedInfo,
          access_token: credentials,
          is_active: true,
          status: {
            state: "LOGGED_IN",
            last_login: new Date().toISOString(),
            error_message: null,
            qr_code: null,
          },
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", botId);
    } catch (e) {
      console.error("[BotManager] Update Info Error:", e);
      // Lỗi update info cũng log raw
      await this.handleBotDeath(botId, e);
    }
  }

  private async updateBotStatusInDB(
    botId: string,
    state: ZaloBotStatus["state"],
    error?: string,
    qrCode?: string,
  ) {
    await supabase
      .from("zalo_bots")
      .update({
        status: {
          state,
          error_message: error,
          qr_code: qrCode,
          last_update: new Date().toISOString(),
        },
      })
      .eq("id", botId);
  }

  public getBotAPI(botId: string): API {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api)
      throw new Error(`Bot ${botId} chưa sẵn sàng.`);
    return runtime.api;
  }
}
