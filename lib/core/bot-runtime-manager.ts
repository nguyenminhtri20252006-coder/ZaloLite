/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/bot-runtime-manager.ts
 * [UPDATED V11.4] FIX SQL ERROR - REMOVED PROXY COLUMN
 * - Removed: Querying 'proxy_url' from database (column does not exist yet).
 * - Fixed: resumeSession and startLoginQR now work without proxy data.
 * - Kept: Internal proxy support in getOrInitBot (for future implementation).
 */

import { Zalo, API } from "zca-js";
import { HttpProxyAgent } from "http-proxy-agent";
import { createClient } from "@supabase/supabase-js";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus } from "@/lib/types/database.types";
import { sseManager } from "@/lib/core/sse-manager";

// [CRITICAL] Init Admin Client để Bỏ qua RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "[BotManager] 🛑 MISSING ENV: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface ZaloCredentials {
  imei: string;
  cookie: any;
  userAgent: string;
  zpw_enk?: string;
  session_key?: string;
}

type BotRuntime = {
  instance: any;
  api: API | null;
  status: ZaloBotStatus["state"];
  lastPing?: number;
  botInfoId?: string;
  currentProxy?: string;
  credentials?: ZaloCredentials;
};

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
const INACTIVE_THRESHOLD = 10 * 60 * 1000;

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();
  private messagePipeline: MessagePipeline;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    console.log("[BotManager] 🚀 Initializing Engine V11.4 (No Proxy DB)...");
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

  // --- SYSTEM INIT ---
  private async initSystem() {
    try {
      await supabaseAdmin
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

  // --- HELPER: Resolve IdentityID -> BotInfoID ---
  private async resolveBotInfoId(inputId: string): Promise<string> {
    const { data: identity } = await supabaseAdmin
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", inputId)
      .single();

    if (identity && identity.ref_bot_id) {
      return identity.ref_bot_id;
    }
    return inputId;
  }

  // --- HELPER: Extract Credentials ---
  private extractCredentials(api: any, zaloInstance: any): ZaloCredentials {
    const context = api.getContext ? api.getContext() : {};
    const cookie = api.getCookie ? api.getCookie() : zaloInstance.cookie || {};

    return {
      cookie: cookie,
      imei: context.imei || zaloInstance.imei || "",
      userAgent: context.userAgent || zaloInstance.userAgent || "",
      zpw_enk: context.zpw_enk || zaloInstance.zpw_enk,
      session_key: context.session_key,
    };
  }

  // --- CORE: INIT BOT INSTANCE ---
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

  // ===========================================================================
  // 1. LOGIN VIA QR CODE
  // ===========================================================================
  public async startLoginQR(inputId: string) {
    const botInfoId = await this.resolveBotInfoId(inputId);

    // Init runtime không có Proxy (Mặc định)
    const runtime = this.getOrInitBot(inputId, undefined);
    runtime.botInfoId = botInfoId;

    try {
      console.log(
        `[QR-Logic] Starting QR login for: ${inputId} (InfoID: ${botInfoId})`,
      );
      this.notifyStatus(inputId, "STARTING", "Đang kết nối tới Zalo...");

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
          sseManager.sendEvent(inputId, "qr", { image: base64 });
          await this.updateBotStatusInDB(
            botInfoId,
            "QR_WAITING",
            "Vui lòng quét mã QR",
            base64,
          );
          runtime.status = "QR_WAITING";
        }
      });

      console.log(`[QR-Logic] Login Success for ${inputId}`);
      sseManager.sendEvent(inputId, "success", {
        message: "Đăng nhập thành công!",
      });

      const credentials = this.extractCredentials(api, runtime.instance);
      await this.handleLoginSuccess(inputId, botInfoId, api, credentials);
    } catch (e: any) {
      console.error(`[QR-Logic] Login Error:`, e);
      sseManager.sendEvent(inputId, "error", { message: e.message });
      await this.updateBotStatusInDB(
        botInfoId,
        "ERROR",
        e.message || "Lỗi lấy mã QR",
      );
    }
  }

  // ===========================================================================
  // 2. RESUME SESSION (Re-Login)
  // ===========================================================================
  public async resumeSession(inputId: string) {
    console.log(
      `[Resume] Attempting to resume session for UI-ID: ${inputId}...`,
    );

    try {
      const botInfoId = await this.resolveBotInfoId(inputId);
      console.log(`[Resume] Resolved Target BotInfoID: ${botInfoId}`);

      // [FIX] Removed 'proxy_url' from select
      const { data, error } = await supabaseAdmin
        .from("zalo_bot_info")
        .select("access_token")
        .eq("id", botInfoId)
        .single();

      if (error || !data) {
        console.error(`[Resume] DB Error for InfoID ${botInfoId}:`, error);
        throw new Error(`Không tìm thấy thông tin Bot (Lỗi truy cập DB)`);
      }

      const rawToken = data.access_token as any;
      if (!rawToken || !rawToken.cookie || !rawToken.imei) {
        throw new Error(
          "Token trong DB rỗng hoặc thiếu thông tin. Vui lòng quét QR lại.",
        );
      }

      console.log(
        `[Resume] Token found via Admin Client. IMEI: ${rawToken.imei.substring(
          0,
          8,
        )}...`,
      );

      // Init bot không proxy
      const runtime = this.getOrInitBot(inputId, undefined);
      runtime.botInfoId = botInfoId;

      await this.updateBotStatusInDB(
        botInfoId,
        "STARTING",
        "Đang khôi phục phiên...",
      );

      await this.loginWithCredentials(inputId, rawToken);
    } catch (e: any) {
      console.error(`[Resume] Failed: ${e.message}`);
      try {
        const resolvedId = await this.resolveBotInfoId(inputId);
        await this.updateBotStatusInDB(resolvedId, "ERROR", e.message);
      } catch {}
      throw e;
    }
  }

  public async loginWithCredentials(
    botId: string,
    credentials: ZaloCredentials,
  ) {
    const runtime = this.bots.get(botId);
    if (!runtime) throw new Error("Runtime chưa được khởi tạo");

    try {
      let cookieData = credentials.cookie;
      if (typeof cookieData === "string") {
        try {
          if (cookieData.trim().startsWith("{"))
            cookieData = JSON.parse(cookieData);
        } catch {}
      }

      const finalCreds = {
        cookie: cookieData,
        imei: credentials.imei,
        userAgent:
          credentials.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (ZaloPC)",
      };

      const api = await runtime.instance.login(finalCreds);
      const updatedCreds = this.extractCredentials(api, runtime.instance);

      if (runtime.currentProxy) {
        (updatedCreds as any).proxy = runtime.currentProxy;
      }

      if (!runtime.botInfoId)
        runtime.botInfoId = await this.resolveBotInfoId(botId);

      await this.handleLoginSuccess(
        botId,
        runtime.botInfoId!,
        api,
        updatedCreds,
      );
    } catch (e: any) {
      console.error(`[Login] Restore Failed ${botId}:`, e);
      throw new Error(
        "Phiên đăng nhập hết hạn hoặc Token lỗi. (" + e.message + ")",
      );
    }
  }

  // ===========================================================================
  // 3. REALTIME CONTROLS
  // ===========================================================================
  public async startRealtime(inputId: string) {
    let runtime = this.bots.get(inputId);

    if (!runtime || !runtime.api) {
      try {
        await this.resumeSession(inputId);
        runtime = this.bots.get(inputId);
      } catch (e) {
        throw new Error(
          "Không thể bật Realtime: Bot chưa đăng nhập hoặc Session lỗi.",
        );
      }
    }

    if (runtime && runtime.api && runtime.botInfoId) {
      (runtime.api as any).listener.start();
      await this.updateBotStatusInDB(
        runtime.botInfoId,
        "ACTIVE",
        "Đang hoạt động (Realtime)",
      );
    }
  }

  public async stopRealtime(inputId: string) {
    const runtime = this.bots.get(inputId);
    if (runtime && runtime.api && runtime.botInfoId) {
      (runtime.api as any).listener.stop();
      await this.updateBotStatusInDB(
        runtime.botInfoId,
        "LOGGED_IN",
        "Đã tắt Realtime",
      );
    }
  }

  // ===========================================================================
  // 4. HANDLE SUCCESS
  // ===========================================================================
  private async handleLoginSuccess(
    identityId: string,
    botInfoId: string,
    api: API,
    credentials: any,
  ) {
    const runtime = this.bots.get(identityId);
    if (!runtime) return;

    runtime.api = api;
    runtime.status = "LOGGED_IN";
    runtime.credentials = credentials;

    this.syncProfileToIdentities(identityId, api);

    await supabaseAdmin
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
      .eq("id", botInfoId);

    this.setupMessageListener(identityId, botInfoId, api);
    console.log(
      `[BotManager] 🎉 ${identityId} (Info: ${botInfoId}) is Online.`,
    );
  }

  private async syncProfileToIdentities(identityId: string, api: any) {
    try {
      const rawInfo: any = await api.fetchAccountInfo();
      let source = rawInfo;
      if (rawInfo && rawInfo.data) source = rawInfo.data;
      else if (rawInfo && rawInfo.profile) source = rawInfo.profile;

      const realZaloId =
        source.id || source.uid || source.userId || api.getOwnId();
      const displayName =
        source.displayName || source.name || source.zaloName || "Bot";
      const avatar = source.avatar || source.avt || "";

      if (realZaloId && realZaloId !== "0") {
        await supabaseAdmin
          .from("zalo_identities")
          .update({
            zalo_global_id: String(realZaloId),
            display_name: displayName,
            avatar: avatar,
            updated_at: new Date().toISOString(),
          })
          .eq("id", identityId);
      }
    } catch (e) {
      console.warn("[Login] Fetch Profile Warning:", e);
    }
  }

  private setupMessageListener(botId: string, botInfoId: string, api: API) {
    const rawApi = api as any;
    if (rawApi.listener) {
      try {
        rawApi.listener.removeAllListeners("message");
        rawApi.listener.removeAllListeners("error");
      } catch {}
    }

    if (rawApi.listener) {
      rawApi.listener.on("message", async (message: any) => {
        this.updateHeartbeat(botId, botInfoId);
        await this.messagePipeline.process(botId, message);
      });

      rawApi.listener.on("error", (err: any) => {
        console.error(`[Socket] Error ${botId}:`, err);
      });

      if (typeof rawApi.listener.start === "function") {
        rawApi.listener.start();
      }
    }
  }

  // --- UTILS ---
  private notifyStatus(botId: string, state: string, message: string) {
    sseManager.sendEvent(botId, "status", { message });
    const runtime = this.bots.get(botId);
    if (runtime?.botInfoId) {
      this.updateBotStatusInDB(runtime.botInfoId, state, message);
    }
  }

  private updateHeartbeat(botId: string, botInfoId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      runtime.lastPing = Date.now();
      supabaseAdmin
        .from("zalo_bot_info")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", botInfoId)
        .then();
    }
  }

  private async updateBotStatusInDB(
    botInfoId: string,
    state: string,
    msg?: string,
    qr?: string,
  ) {
    await supabaseAdmin
      .from("zalo_bot_info")
      .update({
        status: {
          state,
          message: msg,
          qr_code: qr,
          last_update: new Date().toISOString(),
        },
      })
      .eq("id", botInfoId);
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

  private startHealthCheckLoop() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = setInterval(async () => {
      const now = Date.now();
      for (const [botId, runtime] of this.bots.entries()) {
        if (runtime.status !== "LOGGED_IN") continue;

        const diff = now - (runtime.lastPing || 0);
        if (diff > INACTIVE_THRESHOLD) {
          try {
            if (runtime.api && runtime.botInfoId) {
              await runtime.api.fetchAccountInfo();
              this.updateHeartbeat(botId, runtime.botInfoId);
            }
          } catch (error) {
            console.error(`[HealthCheck] Bot ${botId} Died.`);
            await this.stopBot(botId);
            if (runtime.botInfoId)
              await this.updateBotStatusInDB(
                runtime.botInfoId,
                "ERROR",
                "Mất kết nối (Timeout)",
              );
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }
}
