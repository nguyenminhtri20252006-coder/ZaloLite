/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE - V5.0 ACTIVE CHECK & SELF-HEALING]
 * - [NEW] initSystem: Chạy ngay khi instrumentation gọi.
 * - [UPDATE] restoreBotsFromDB: Logic chặt chẽ, update trạng thái ERROR nếu login thất bại.
 * - [FIX] resetAllBotStatusOnStartup: Reset sạch sẽ trạng thái treo.
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
};

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
const INACTIVE_THRESHOLD = 10 * 60 * 1000;

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();
  private messagePipeline: MessagePipeline;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    console.log("[BotManager] 🚀 Khởi tạo Engine V5.1 (Proxy Support)...");
    this.messagePipeline = new MessagePipeline();
    // Khởi chạy hệ thống ngay lập tức
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
      console.log("[BotManager] ⏳ Starting Initialization Sequence...");
      // 1. Reset trạng thái cũ (để tránh hiển thị sai là đang Online khi vừa reboot)
      await this.resetAllBotStatusOnStartup();

      // 2. Phục hồi các bot đang Active
      await this.restoreBotsFromDB();

      // 3. Bắt đầu vòng lặp bác sĩ khám bệnh
      this.startHealthCheckLoop();
    } catch (e) {
      console.error("[BotManager] ❌ Init System Critical Failure:", e);
    }
  }

  // --- RESET & RESTORE (STRICT MODE) ---

  private async resetAllBotStatusOnStartup() {
    console.log("[BotManager] 🧹 Cleaning up zombie states...");
    // Chỉ reset những bot đang (hoặc được cho là) chạy.
    // Giữ nguyên trạng thái ERROR để admin biết mà fix.
    const { error } = await supabase
      .from("zalo_bots")
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
    const { data: bots, error } = await supabase
      .from("zalo_bots")
      .select("*")
      .eq("is_active", true);

    if (error) {
      console.error("[BotManager] Fetch active bots failed:", error);
      return;
    }

    if (bots && bots.length > 0) {
      console.log(
        `[BotManager] Found ${bots.length} active bots. Starting sequence...`,
      );

      // [IMPORTANT] Dùng for...of để xử lý tuần tự (Sequential) thay vì Promise.all
      // Lý do: Tránh spike CPU/Memory nếu restore hàng loạt bot cùng lúc.
      for (const b of bots) {
        // Cast type an toàn
        const creds = b.access_token as unknown as ZaloCredentials | null;

        if (!creds || !creds.cookie) {
          console.warn(
            `[Restore] ⚠️ Bot ${b.name} (${b.id}) has no credentials. Skipping.`,
          );
          continue;
        }

        try {
          console.log(
            `[Restore] ▶️ Restoring ${b.name} (Proxy: ${
              creds.proxy || "None"
            })...`,
          );
          await this.loginWithCredentials(b.id, creds, b.auto_sync_interval);
          console.log(`[Restore] ✅ Restored ${b.name} successfully.`);
        } catch (e) {
          console.error(`[Restore] ❌ Failed to restore ${b.name}.`, e);
          // Restore thất bại -> Gọi handleBotDeath để quyết định có tắt luôn hay không
          await this.handleBotDeath(b.id, e);
        }
      }
    } else {
      console.log("[BotManager] No active bots found.");
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
  private async runHealthCheck() {
    // Logic tách ra từ startHealthCheckLoop để code gọn hơn
    // Thực hiện ping check như version cũ
    const now = Date.now();
    for (const [botId, runtime] of this.bots.entries()) {
      if (runtime.status !== "LOGGED_IN" || !runtime.api) continue;
      const lastActive = runtime.lastPing || 0;
      if (now - lastActive > INACTIVE_THRESHOLD) {
        // ... Perform Ping ...
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await runtime.api.fetchAccountInfo();
          this.updateHeartbeat(botId);
        } catch (e) {
          await this.handleBotDeath(botId, e);
        }
      }
    }
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
    const errStr = (rawErr.message || String(error)).toUpperCase();

    // Kiểm tra nếu bot đã chết rồi thì không spam update DB nữa
    const runtime = this.bots.get(botId);
    if (runtime && runtime.status === "ERROR") {
      return;
    }

    console.error(`[BotManager] 💀 Bot Died ${botId}. Cause:`, errStr);

    // 1. Dừng Runtime
    await this.stopBot(botId);

    // 2. Phân loại lỗi
    // Các lỗi Fatal => Tắt is_active (Cần user can thiệp)
    const isFatal =
      errStr.includes("SESSION_EXPIRED") ||
      errStr.includes("401") ||
      errStr.includes("UNAUTHORIZED") ||
      errStr.includes("VERIFY") || // Checkpoint verify
      errStr.includes("-1357"); // Zalo Block

    // Các lỗi Mạng/Hệ thống => Giữ is_active (Tự retry lần sau)
    // (Mặc định là không fatal)

    // 3. Chuẩn bị payload update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {
      status: {
        state: "ERROR",
        error_message: rawErr.message || String(error),
        last_update: new Date().toISOString(),
        debug_code: rawErr.code,
      },
      health_check_log: {
        timestamp: new Date().toISOString(),
        action: "ERROR_HANDLER",
        status: "FAIL",
        message: rawErr.message,
        raw_data: rawErr,
        error_stack: rawErr.stack,
      },
    };

    if (isFatal) {
      console.log(
        `[BotManager] 🛑 Fatal Error detected. Disabling auto-restart for ${botId}.`,
      );
      updatePayload.is_active = false;
    } else {
      console.log(
        `[BotManager] ⚠️ Temporary Error detected. Keeping auto-restart enabled for ${botId}.`,
      );
      // Không set is_active, giữ nguyên giá trị cũ trong DB (thường là true)
    }

    await supabase.from("zalo_bots").update(updatePayload).eq("id", botId);
  }

  // --- CORE ACTIONS ---

  /**
   * [UPDATED] Lấy hoặc Khởi tạo Bot với cấu hình Proxy mới
   * Nếu proxy thay đổi, sẽ tạo instance mới.
   */
  public getOrInitBot(botId: string, proxyUrl?: string): BotRuntime {
    let runtime = this.bots.get(botId);

    // Kiểm tra nếu cần tạo lại instance (do chưa có hoặc proxy thay đổi)
    const needRecreate = !runtime || proxyUrl !== runtime.currentProxy;

    if (needRecreate) {
      if (runtime) {
        // Cleanup cũ nếu có
        console.log(
          `[BotManager] ♻️ Recreating instance for ${botId} (Proxy changed or init)`,
        );
        this.stopBot(botId);
      }

      // Config cho Zalo Instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zaloOptions: any = {
        selfListen: true,
        logging: false,
      };

      // [IMPORTANT] Setup Proxy Agent
      if (proxyUrl && proxyUrl.trim() !== "") {
        try {
          // Sử dụng http-proxy-agent để support cả HTTP/HTTPS proxy
          zaloOptions.httpAgent = new HttpProxyAgent(proxyUrl);
          console.log(`[BotManager] 🌐 Configured Proxy for ${botId}`);
        } catch (e) {
          console.error(`[BotManager] ❌ Invalid Proxy URL for ${botId}:`, e);
          // Vẫn tiếp tục tạo bot nhưng không có proxy, hoặc throw?
          // Tốt nhất là throw để báo lỗi ngay
          throw new Error(`Invalid Proxy URL: ${(e as Error).message}`);
        }
      }

      const instance = new Zalo(zaloOptions);

      runtime = {
        instance,
        api: null,
        status: "STOPPED",
        lastPing: Date.now(),
        currentProxy: proxyUrl,
      };
      this.bots.set(botId, runtime);
    }

    return runtime!;
  }

  public async loginWithCredentials(
    botId: string,
    credentials: unknown,
    autoSyncInterval: number = 0,
  ) {
    const creds = credentials as ZaloCredentials;

    // [UPDATE] Gọi getOrInitBot với tham số Proxy từ credentials
    const runtime = this.getOrInitBot(botId, creds.proxy);

    await this.updateBotStatusInDB(botId, "STARTING");
    runtime.status = "STARTING";

    try {
      // Login với credentials (cookie, imei, userAgent)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = await runtime.instance.login(creds as any);

      // Nếu thành công -> Update DB & State
      await this.handleLoginSuccess(botId, api, autoSyncInterval);
      return { success: true };
    } catch (error: unknown) {
      console.error(`[BotManager] Login Failed (${botId})`);
      // Ném lỗi để caller xử lý hoặc handleBotDeath xử lý
      // Ở đây ta để handleBotDeath xử lý việc update DB
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

    await this.saveHealthCheckLog(botId, {
      timestamp: new Date().toISOString(),
      action: "LOGIN",
      status: "OK",
      message: "Login successful",
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
      // Socket error -> Bot chết -> Ghi nhận cái chết
      await this.handleBotDeath(botId, err);
    });
    api.listener.start();
  }

  private async triggerSync(botId: string, source: string) {
    try {
      const res = await SyncService.syncAll(botId);
      if (res.success) {
        this.updateHeartbeat(botId);
      } else {
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
      // Merge context với runtime currentProxy để đảm bảo save đủ
      const runtime = this.bots.get(botId);

      const credentials: ZaloCredentials = {
        cookie: context.cookie,
        imei: context.imei,
        userAgent: context.userAgent,
        proxy: runtime?.currentProxy, // Lưu lại proxy đang dùng vào DB
      };

      await supabase
        .from("zalo_bots")
        .update({
          global_id: globalId,
          name:
            profile?.displayName || profile?.zaloName || `Zalo Bot ${globalId}`,
          avatar: profile?.avatar || profile?.picture || "",
          raw_data: parsedInfo,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          access_token: credentials as any, // Cast any do JSONB DB
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
