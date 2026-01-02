/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE - V6 IDENTITY CENTRIC + SELF HEALING]
 * - Kiến trúc: Identity (zalo_identities) + Technical Info (zalo_bot_info).
 * - Tính năng: Auto Restore, Health Check, Strict Error Handling.
 * - [NOTE]: File này sử dụng nhiều kiểu dữ liệu động từ thư viện bên thứ 3 và JSONB database
 * nên đã tắt rule no-explicit-any cho toàn bộ file để tránh lỗi lint.
 */

import { Zalo, API } from "zca-js";
import { HttpProxyAgent } from "http-proxy-agent";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus, HealthCheckLog } from "@/lib/types/database.types";
import { SyncService } from "@/lib/core/services/sync-service";

interface ZaloCredentials {
  imei: string;
  cookie: unknown;
  userAgent: string;
  proxy?: string;
}

type BotRuntime = {
  instance: Zalo;
  api: API | null;
  status: ZaloBotStatus["state"];
  pollingInterval?: NodeJS.Timeout;
  lastPing?: number;
  currentProxy?: string;

  // [IMPORTANT] Cache ID để update DB nhanh
  botInfoId?: string;
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
      "[BotManager] 🚀 Khởi tạo Engine V6 (Identity Centric + HealthCheck)...",
    );
    this.messagePipeline = new MessagePipeline();
    // Tự động khởi chạy hệ thống khi server start
    this.initSystem();
  }

  public static getInstance(): BotRuntimeManager {
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  // --- SYSTEM LIFECYCLE ---

  private async initSystem() {
    try {
      console.log("[BotManager] ⏳ Starting Initialization Sequence...");
      // 1. Reset các trạng thái treo (tránh việc Server restart mà DB vẫn báo đang chạy)
      await this.resetAllBotStatusOnStartup();

      // 2. Phục hồi các bot đang Active từ DB
      await this.restoreBotsFromDB();

      // 3. Bắt đầu bác sĩ khám bệnh định kỳ
      this.startHealthCheckLoop();
    } catch (e) {
      console.error("[BotManager] ❌ Init System Critical Failure:", e);
    }
  }

  private async resetAllBotStatusOnStartup() {
    console.log("[BotManager] 🧹 Cleaning up zombie states...");
    // Reset status trong bảng zalo_bot_info về STOPPED nếu đang không phải ERROR
    const { error } = await supabase
      .from("zalo_bot_info")
      .update({
        status: {
          state: "STOPPED",
          error_message: "System Rebooted - Restoring...",
          last_update: new Date().toISOString(),
        },
      })
      .neq("status->>state", "ERROR")
      .neq("status->>state", "STOPPED");

    if (error) console.error("[BotManager] Reset DB Error:", error);
  }

  public async restoreBotsFromDB() {
    console.log("[BotManager] 🔄 Restoring Active Bots...");

    // [V6 LOGIC] Lấy các Identity có Bot Info đang active
    const { data: identities, error } = await supabase
      .from("zalo_identities")
      .select(
        `
        id,
        zalo_global_id,
        name,
        ref_bot_id,
        bot_info:zalo_bot_info!inner (
            id,
            access_token,
            auto_sync_interval,
            is_active,
            is_realtime_active
        )
      `,
      )
      .eq("type", "system_bot")
      .eq("bot_info.is_active", true); // Chỉ restore bot được đánh dấu active

    if (error) {
      console.error("[BotManager] Fetch active bots failed:", error);
      return;
    }

    const botsToRestore = identities as any[];

    if (botsToRestore && botsToRestore.length > 0) {
      console.log(
        `[BotManager] Found ${botsToRestore.length} active bots. Restoring...`,
      );

      for (const identity of botsToRestore) {
        const botInfo = identity.bot_info;
        const creds = botInfo.access_token as unknown as ZaloCredentials | null;

        if (!creds || !creds.cookie) {
          console.warn(
            `[Restore] ⚠️ Bot ${identity.name} has no credentials. Skipping.`,
          );
          continue;
        }

        try {
          console.log(`[Restore] ▶️ Restoring ${identity.name}...`);

          // 1. Đăng nhập lại (Re-hydrate Session)
          await this.loginWithCredentials(
            identity.id,
            creds,
            botInfo.auto_sync_interval,
          );

          // 2. Nếu Bot này trước đó đang bật Realtime -> Bật lại luôn
          if (botInfo.is_realtime_active) {
            console.log(
              `[Restore] ⚡ Auto-enabling Realtime for ${identity.name}`,
            );
            await this.startRealtime(identity.id);
          }

          console.log(`[Restore] ✅ Restored ${identity.name} successfully.`);
        } catch (e) {
          console.error(`[Restore] ❌ Failed to restore ${identity.name}.`, e);
          await this.handleBotDeath(identity.id, e);
        }
      }
    } else {
      console.log("[BotManager] No active bots found.");
    }
  }

  // --- [NEW] PUBLIC ERROR REPORTING ---
  /**
   * Cho phép các Service bên ngoài (như SyncService) báo cáo lỗi nghiêm trọng
   * để BotManager xử lý (Log DB, Restart, hoặc đánh dấu Error)
   */
  public async reportError(botId: string, error: unknown) {
    await this.handleBotDeath(botId, error);
  }

  // --- CORE ACTIONS ---

  /**
   * Khởi tạo Runtime Instance (kèm Proxy nếu có)
   */
  public getOrInitBot(botId: string, proxyUrl?: string): BotRuntime {
    let runtime = this.bots.get(botId);
    const needRecreate = !runtime || proxyUrl !== runtime.currentProxy;

    if (needRecreate) {
      if (runtime) this.stopBot(botId); // Cleanup cũ

      const zaloOptions: any = {
        selfListen: true, // Zalo option
        logging: false,
      };

      if (proxyUrl && proxyUrl.trim() !== "") {
        try {
          zaloOptions.httpAgent = new HttpProxyAgent(proxyUrl);
        } catch (e) {
          console.error(`[BotManager] Invalid Proxy:`, e);
        }
      }

      const instance = new Zalo(zaloOptions);

      runtime = {
        instance,
        api: null,
        status: "STOPPED",
        lastPing: Date.now(),
        currentProxy: proxyUrl,
        botInfoId: undefined, // Sẽ được điền sau
      };
      this.bots.set(botId, runtime);
    }

    return runtime!;
  }

  /**
   * Đăng nhập Bot bằng Credentials
   */
  public async loginWithCredentials(
    botId: string, // identity_id
    credentials: unknown,
    autoSyncInterval: number = 0,
  ) {
    const creds = credentials as ZaloCredentials;
    const runtime = this.getOrInitBot(botId, creds.proxy);

    // Tìm botInfoId nếu chưa có (để update status vào đúng bảng)
    if (!runtime.botInfoId) {
      const { data } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();
      if (data?.ref_bot_id) runtime.botInfoId = data.ref_bot_id;
    }

    // Update Status: STARTING
    if (runtime.botInfoId) {
      await this.updateBotStatusInDB(runtime.botInfoId, "STARTING");
    }
    runtime.status = "STARTING";

    try {
      const api = await runtime.instance.login(creds as any);

      // Login thành công
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

    if (runtime.botInfoId) {
      await this.updateBotStatusInDB(runtime.botInfoId, "QR_WAITING");
    }
    runtime.status = "QR_WAITING";

    try {
      const api = await runtime.instance.loginQR({}, async (qrData: any) => {
        let base64 = typeof qrData === "string" ? qrData : qrData.data?.image;
        if (
          base64 &&
          typeof base64 === "string" &&
          !base64.startsWith("data:image")
        ) {
          base64 = `data:image/png;base64,${base64}`;
        }
        if (runtime.botInfoId) {
          await this.updateBotStatusInDB(
            runtime.botInfoId,
            "QR_WAITING",
            undefined,
            base64,
          );
        }
      });
      await this.handleLoginSuccess(botId, api);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      runtime.status = "ERROR";
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(runtime.botInfoId, "ERROR", errMsg);
      }
    }
  }

  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      if (runtime.pollingInterval) clearInterval(runtime.pollingInterval);

      // Stop listener safely
      try {
        const api = runtime.api as any;
        if (api && api.listener) api.listener.stop();
      } catch {}

      runtime.api = null;
      runtime.status = "STOPPED";

      // Update DB Status
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(runtime.botInfoId, "STOPPED");
      }

      this.bots.delete(botId);
    }
  }

  // --- REALTIME CONTROLS ---

  public async startRealtime(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) {
      throw new Error("Bot chưa đăng nhập (No Session).");
    }

    console.log(`[Runtime] 🟢 Enabling Realtime Listener for ${botId}`);

    const api = runtime.api as any;
    if (api.listener) {
      api.listener.start();

      // Update DB Log
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(runtime.botInfoId, "ACTIVE"); // Chuyển sang ACTIVE khi Realtime ON
      }
    }
  }

  public async stopRealtime(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) return;

    console.log(`[Runtime] 🔴 Disabling Realtime Listener for ${botId}`);

    const api = runtime.api as any;
    if (api.listener) {
      api.listener.stop();

      // Update DB Log -> Về trạng thái LOGGED_IN (Session Alive, No Listener)
      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(runtime.botInfoId, "LOGGED_IN");
      }
    }
  }

  // --- INTERNAL HANDLERS ---

  private async handleLoginSuccess(
    botId: string,
    api: API,
    autoSyncInterval: number = 0,
  ) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    if (runtime.pollingInterval) clearInterval(runtime.pollingInterval);

    runtime.api = api;
    runtime.status = "LOGGED_IN"; // Mặc định là Logged In, chưa Active Realtime
    runtime.lastPing = Date.now();

    // 1. Update Info & Heartbeat vào DB
    await this.updateBotInfoAndHeartbeat(botId, api);

    // 2. Setup Listeners (Nhưng chưa start, chờ lệnh startRealtime hoặc restore)
    this.setupMessageListener(botId, api);

    // 3. Log Success
    await this.saveHealthCheckLog(botId, {
      timestamp: new Date().toISOString(),
      action: "LOGIN",
      status: "OK",
      message: "Session established successfully",
      latency: 0,
    });

    // 4. Trigger Sync (Manual/Initial)
    console.log(`[BotManager] Bot ${botId} ready.`);
  }

  private setupMessageListener(botId: string, api: API) {
    const rawApi = api as any;

    if (rawApi.listener) {
      // Clear listeners cũ để tránh double event
      rawApi.listener.off("message");
      rawApi.listener.off("error");

      rawApi.listener.on("message", async (message: any) => {
        this.updateHeartbeat(botId);
        await this.messagePipeline.process(botId, message);
      });

      rawApi.listener.on("error", async (err: any) => {
        console.error(`[BotManager] ⚡ Socket Error (${botId}):`, err);
        // Socket lỗi -> Bot có thể đã chết
        await this.handleBotDeath(botId, err);
      });

      // Note: Không gọi start() ở đây. Action startRealtime sẽ gọi.
    }
  }

  private updateHeartbeat(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) runtime.lastPing = Date.now();

    if (runtime?.botInfoId) {
      supabase
        .from("zalo_bot_info")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", runtime.botInfoId)
        .then();
    }
  }

  // --- HEALTH CHECK & ERROR HANDLING ---

  private startHealthCheckLoop() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    this.healthCheckTimer = setInterval(async () => {
      // console.log("[HealthCheck] 🩺 Scanning bots...");
      const now = Date.now();

      for (const [botId, runtime] of this.bots.entries()) {
        // Chỉ check những bot đang được coi là sống
        if (
          (runtime.status !== "LOGGED_IN" && runtime.status !== "ACTIVE") ||
          !runtime.api
        )
          continue;

        const lastActive = runtime.lastPing || 0;
        const diff = now - lastActive;

        // Nếu quá lâu không hoạt động -> Ping thử
        if (diff > INACTIVE_THRESHOLD) {
          const start = Date.now();
          let log: HealthCheckLog;

          try {
            const response = await runtime.api.fetchAccountInfo(); // Ping nhẹ
            const latency = Date.now() - start;

            log = {
              timestamp: new Date().toISOString(),
              action: "PING",
              status: "OK",
              message: "Keep-alive Check",
              latency: latency,
              raw_data: { uid: (response as any).data?.uid || "ok" },
            };

            this.updateHeartbeat(botId);
            // console.log(`[HealthCheck] ${botId} OK (${latency}ms)`);
          } catch (error) {
            const rawErr = this.serializeError(error);
            log = {
              timestamp: new Date().toISOString(),
              action: "PING",
              status: "FAIL",
              message: rawErr.message || "Ping Timeout",
              raw_data: rawErr,
              error_stack: rawErr.stack,
            };
            console.error(`[HealthCheck] ${botId} FAILED. Handling Death...`);
            await this.handleBotDeath(botId, error);
          }

          await this.saveHealthCheckLog(botId, log);
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  private async handleBotDeath(botId: string, error: unknown) {
    const rawErr = this.serializeError(error);
    const errStr = (rawErr.message || String(error)).toUpperCase();

    const runtime = this.bots.get(botId);
    // Nếu bot đã được đánh dấu ERROR thì bỏ qua để tránh spam DB
    if (runtime && runtime.status === "ERROR") return;

    console.error(`[BotManager] 💀 Bot Died ${botId}. Cause:`, errStr);

    // 1. Stop Runtime
    await this.stopBot(botId);

    // 2. Phân tích lỗi Fatal
    const isFatal =
      errStr.includes("SESSION_EXPIRED") ||
      errStr.includes("401") ||
      errStr.includes("UNAUTHORIZED") ||
      errStr.includes("VERIFY") ||
      errStr.includes("-1357");

    // 3. Update DB
    // Cần botInfoId
    let infoId = runtime?.botInfoId;
    if (!infoId) {
      const { data } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();
      infoId = data?.ref_bot_id;
    }

    if (infoId) {
      const updatePayload: any = {
        status: {
          state: "ERROR",
          error_message: rawErr.message,
          last_update: new Date().toISOString(),
          debug_code: rawErr.code,
        },
        health_check_log: {
          timestamp: new Date().toISOString(),
          action: "ERROR_HANDLER",
          status: "FAIL",
          message: rawErr.message,
          error_stack: rawErr.stack,
        },
      };

      if (isFatal) {
        updatePayload.is_active = false;
        updatePayload.is_realtime_active = false; // Tắt luôn realtime
      }

      await supabase
        .from("zalo_bot_info")
        .update(updatePayload)
        .eq("id", infoId);
    }
  }

  private async saveHealthCheckLog(botId: string, log: HealthCheckLog) {
    const runtime = this.bots.get(botId);
    let infoId = runtime?.botInfoId;

    if (!infoId) {
      const { data } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();
      infoId = data?.ref_bot_id;
    }

    if (infoId) {
      await supabase
        .from("zalo_bot_info")
        .update({ health_check_log: log as any })
        .eq("id", infoId);
    }
  }

  // --- HELPERS ---

  private async updateBotInfoAndHeartbeat(botId: string, api: API) {
    try {
      const runtime = this.bots.get(botId);
      if (!runtime?.botInfoId) return;

      const infoResponse: any = await api.fetchAccountInfo();
      // Parsing logic...

      const context = api.getContext();
      const credentials: ZaloCredentials = {
        cookie: context.cookie,
        imei: context.imei,
        userAgent: context.userAgent,
        proxy: runtime.currentProxy,
      };

      await supabase
        .from("zalo_bot_info")
        .update({
          access_token: credentials as any,
          status: {
            state: "LOGGED_IN",
            last_login: new Date().toISOString(),
            error_message: null,
          } as any,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", runtime.botInfoId);
    } catch (e) {
      console.warn("[BotManager] Info Update Warning:", e);
    }
  }

  private async updateBotStatusInDB(
    botInfoId: string,
    state: ZaloBotStatus["state"],
    error?: string,
    qrCode?: string,
  ) {
    await supabase
      .from("zalo_bot_info")
      .update({
        status: {
          state,
          error_message: error,
          qr_code: qrCode,
          last_update: new Date().toISOString(),
        } as any,
      })
      .eq("id", botInfoId);
  }

  public getBotAPI(botId: string): API {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api)
      throw new Error(`Bot ${botId} chưa sẵn sàng.`);
    return runtime.api;
  }

  private serializeError(error: any): any {
    if (typeof error === "object" && error !== null) {
      return {
        message: error.message,
        name: error.name,
        code: error.code,
        ...error,
      };
    }
    return { message: String(error) };
  }
}
