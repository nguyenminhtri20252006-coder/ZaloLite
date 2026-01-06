/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/bot-runtime-manager.ts
 * [FIXED V10.0] ROBUST LISTENER SETUP
 * - Fixed "The listener argument must be of type function" error.
 * - Added safe check for listener existence.
 */

import { Zalo, API } from "zca-js";
import { HttpProxyAgent } from "http-proxy-agent";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus } from "@/lib/types/database.types";
import { sseManager } from "@/lib/core/sse-manager";

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
  instance: any;
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
    console.log("[BotManager] 🚀 Initializing Engine V10.0...");
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

  // --- HELPER: Extract Credentials Manually ---
  // [NEW] Thay thế cho getCredentials()
  private extractCredentials(api: any, zaloInstance: any): ZaloCredentials {
    // 1. Lấy context từ API (thường chứa imei, userAgent, encrypt keys)
    const context = api.getContext ? api.getContext() : {};

    // 2. Lấy cookie từ API (hoặc fallback sang instance)
    const cookie = api.getCookie ? api.getCookie() : zaloInstance.cookie || {};

    // 3. Construct Credentials Object
    return {
      cookie: cookie,
      imei: context.imei || zaloInstance.imei || "",
      userAgent: context.userAgent || zaloInstance.userAgent || "",
      zpw_enk: context.zpw_enk || zaloInstance.zpw_enk,
      zpw_service_token: context.zpw_service_token,
      session_key: context.session_key,
    };
  }

  public getOrInitBot(botId: string, proxyUrl?: string): BotRuntime {
    let runtime = this.bots.get(botId);

    if (!runtime || (proxyUrl && proxyUrl !== runtime.currentProxy)) {
      if (runtime) this.stopBot(botId);

      const zaloOptions: any = {
        selfListen: true,
        checkUpdate: false,
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
        botInfoId: undefined,
        currentProxy: proxyUrl,
      };
      this.bots.set(botId, runtime);
    }
    return runtime;
  }

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

    try {
      console.log(`[QR-Logic] Starting QR login for botId: ${botId}`);
      sseManager.sendEvent(botId, "status", {
        message: "Đang kết nối tới Zalo...",
      });

      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(
          runtime.botInfoId,
          "STARTING",
          "Đang kết nối...",
        );
      }
      runtime.status = "STARTING";

      const api = await runtime.instance.loginQR({}, async (event: any) => {
        let base64 = typeof event === "string" ? event : event.data?.image;

        if (!base64 && typeof event === "object") {
          base64 = event.image || event.qr;
          if (Buffer.isBuffer(event)) base64 = event.toString("base64");
        }

        if (base64) {
          if (typeof base64 === "string" && !base64.startsWith("data:image")) {
            base64 = `data:image/png;base64,${base64}`;
          }

          console.log(`[QR-Logic] QR Extracted! Length: ${base64.length}`);
          sseManager.sendEvent(botId, "qr", { image: base64 });

          if (runtime.botInfoId) {
            await this.updateBotStatusInDB(
              runtime.botInfoId,
              "QR_WAITING",
              "Vui lòng quét mã QR",
              base64,
            );
          }
          runtime.status = "QR_WAITING";
        }
      });

      console.log(`[QR-Logic] Login Success for ${botId}`);
      sseManager.sendEvent(botId, "success", {
        message: "Đăng nhập thành công!",
      });

      // [FIX] Use manual extraction
      const credentials = this.extractCredentials(api, runtime.instance);
      await this.handleLoginSuccess(botId, api, credentials);
    } catch (e: any) {
      console.error(`[QR-Logic] Login Error:`, e);
      sseManager.sendEvent(botId, "error", { message: e.message });

      if (runtime.botInfoId) {
        await this.updateBotStatusInDB(
          runtime.botInfoId,
          "ERROR",
          e.message || "Lỗi lấy mã QR",
        );
      }
    }
  }

  public async loginWithCredentials(botId: string, credentials: any) {
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

      let cookieData = creds.cookie;
      if (typeof cookieData === "string" && cookieData.trim().startsWith("{")) {
        try {
          cookieData = JSON.parse(cookieData);
        } catch {}
      }

      const finalCreds = {
        cookie: cookieData,
        imei: creds.imei,
        userAgent:
          creds.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (ZaloPC)",
        zpw_enk: creds.zpw_enk,
        session_key: creds.session_key,
      };

      const options = {
        authType: "cookie",
        selfListen: true,
        checkUpdate: false,
        logging: false,
        httpAgent: runtime.currentProxy
          ? new HttpProxyAgent(runtime.currentProxy)
          : undefined,
      };

      runtime.instance = new Zalo(options);
      const api = await runtime.instance.login(finalCreds);

      // [FIX] Use manual extraction instead of getCredentials
      const updatedCreds = this.extractCredentials(api, runtime.instance);

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
          "Token lỗi: " + e.message,
        );
      }
      throw e;
    }
  }

  private async handleLoginSuccess(botId: string, api: API, credentials: any) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.botInfoId) return;

    runtime.api = api;
    runtime.status = "LOGGED_IN";

    // Lấy Profile để cập nhật ID thật
    try {
      const info: any = await api.fetchAccountInfo();
      const realZaloId = info.id || info.uid || api.getOwnId();

      const displayName =
        info.display_name || info.name || info.zalo_name || "Unknown Bot";
      const avatar = info.avatar || "";

      console.log(`[Login] Bot Identified: ${displayName} (${realZaloId})`);

      if (realZaloId && realZaloId !== "0") {
        // Cập nhật Zalo Global ID thật vào DB
        const { error } = await supabase
          .from("zalo_identities")
          .update({
            zalo_global_id: realZaloId,
            display_name: displayName,
            name: displayName,
            avatar: avatar,
            updated_at: new Date().toISOString(),
          })
          .eq("id", botId);

        if (error) console.error("[Login] DB Update Identity Error:", error);
      }
    } catch (e) {
      console.warn("[Login] Fetch Profile Warning:", e);
    }

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

    this.setupMessageListener(botId, api);
    console.log(`[BotManager] ${botId} is Online & Listening.`);
  }

  private setupMessageListener(botId: string, api: API) {
    const rawApi = api as any;

    // [FIX] Safer listener cleanup
    try {
      if (rawApi.listener) {
        // Remove all listeners for 'message' event safely
        rawApi.listener.removeAllListeners("message");
        rawApi.listener.removeAllListeners("error");
      }
    } catch (e) {
      console.warn("[Runtime] Cleanup listener warning:", e);
    }

    // Attach new listeners
    if (rawApi.listener) {
      rawApi.listener.on("message", async (message: any) => {
        this.updateHeartbeat(botId);
        await this.messagePipeline.process(botId, message);
      });
      rawApi.listener.on("error", (err: any) => {
        console.error(`[Socket] Error ${botId}:`, err);
      });

      // Start if method exists
      if (typeof rawApi.listener.start === "function") {
        rawApi.listener.start();
      }
    }
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

  public async startRealtime(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) throw new Error("Bot chưa đăng nhập");
    (runtime.api as any).listener.start();
    if (runtime.botInfoId)
      await this.updateBotStatusInDB(runtime.botInfoId, "ACTIVE");
  }

  public async stopRealtime(botId: string) {
    const runtime = this.bots.get(botId);
    if (!runtime || !runtime.api) return;
    (runtime.api as any).listener.stop();
    if (runtime.botInfoId)
      await this.updateBotStatusInDB(runtime.botInfoId, "LOGGED_IN");
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
