/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/bot-runtime-manager.ts
 * [VERSION 15.2 - FIX SSE TYPE ERROR]
 * - Fix: Removed 'sseManager.onClientDisconnect' assignment (Property removed in SSE v10).
 * - Logic: Cleanup relies on explicit actions or timeouts.
 */

import { Zalo, API } from "zca-js";
import { HttpProxyAgent } from "http-proxy-agent";
import { createClient } from "@supabase/supabase-js";
import { sseManager } from "@/lib/core/sse-manager";
import { SyncService } from "@/lib/core/services/sync-service";
// [NEW] Import Event Listener
import { ZaloEventListener } from "@/lib/core/listeners/zalo-event-listener";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("[BotManager] 🛑 CRITICAL: MISSING SUPABASE KEYS");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ZaloCredentials {
  imei: string;
  cookie: any;
  userAgent: string;
  zpw_enk?: string;
  session_key?: string;
}

type PendingSessionData = {
  api: API;
  credentials: ZaloCredentials;
  profile: any;
  globalId: string;
  rootName: string;
  avatar: string;
};

type BotRuntime = {
  instance: any;
  api: API | null;
  // [NEW] Add Event Listener Instance to Runtime
  eventListener?: ZaloEventListener;
  status:
    | "STOPPED"
    | "QR_WAITING"
    | "LOGGED_IN"
    | "ERROR"
    | "STARTING"
    | "ACTIVE"
    | "CONFLICT";
  lastPing?: number;
  botInfoId?: string;
  currentProxy?: string;
  credentials?: ZaloCredentials;
  pendingSession?: PendingSessionData;
};

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
const INACTIVE_THRESHOLD = 10 * 60 * 1000;

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();

  private healthCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    console.log("[BotManager] 🚀 Runtime Engine Initialized (v15.0 Modular).");
    this.initSystem();
  }

  public static getInstance(): BotRuntimeManager {
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  // --- CORE METHODS ---

  public async getBotAPI(inputId: string): Promise<API> {
    // 1. Try to get from Memory first
    let runtime = this.bots.get(inputId);

    // Smart resolve: Try finding by botInfoId if IdentityID fails
    if (!runtime) {
      for (const [_, rt] of this.bots.entries()) {
        if (rt.botInfoId === inputId) {
          runtime = rt;
          break;
        }
      }
    }

    // 2. If valid in Memory -> Return
    if (runtime && runtime.status === "LOGGED_IN" && runtime.api) {
      return runtime.api;
    }

    // 3. If missing/stopped -> Attempt Auto-Resume
    console.warn(
      `[BotManager] ⚠️ Bot ${inputId} missing in RAM. Attempting Auto-Resume...`,
    );
    try {
      // Resolve IDs
      const botInfoId = await this.resolveBotInfoId(inputId);
      // Determine Identity ID (Key for Map)
      const { data: identity } = await supabaseAdmin
        .from("zalo_identities")
        .select("id")
        .eq("ref_bot_id", botInfoId)
        .single();

      const realIdentityId = identity?.id || inputId;

      // Check DB Status
      const { data: botInfo } = await supabaseAdmin
        .from("zalo_bot_info")
        .select("access_token")
        .eq("id", botInfoId)
        .single();

      if (!botInfo || !botInfo.access_token) {
        throw new Error("Bot data not found or no token.");
      }

      // Restore
      await this.loginWithCredentials(realIdentityId, botInfo.access_token);

      // Re-fetch runtime after login
      runtime = this.bots.get(realIdentityId);
      if (runtime && runtime.api) {
        console.log(`[BotManager] ✅ Auto-Resume Success: ${realIdentityId}`);
        return runtime.api;
      }
    } catch (e: any) {
      console.error(`[BotManager] ❌ Auto-Resume Failed: ${e.message}`);
    }

    throw new Error(
      `Bot ${inputId} chưa sẵn sàng hoặc mất kết nối (Auto-Resume Failed).`,
    );
  }

  // [Note: Changed return type to Promise<API> due to async nature of Resume]

  public getOrInitBot(id: string, proxyUrl?: string): BotRuntime {
    let runtime = this.bots.get(id);
    if (!runtime) {
      const zaloOptions: any = {
        selfListen: true,
        checkUpdate: false,
        logging: false,
      };
      if (proxyUrl) {
        try {
          zaloOptions.httpAgent = new HttpProxyAgent(proxyUrl);
        } catch {}
      }

      runtime = {
        instance: new Zalo(zaloOptions),
        api: null,
        status: "STOPPED",
        lastPing: Date.now(),
        botInfoId: undefined,
        currentProxy: proxyUrl,
        eventListener: undefined, // Will be init on login
      };
      this.bots.set(id, runtime);
    }
    return runtime;
  }

  public cleanupTempSession(tempId: string) {
    const runtime = this.bots.get(tempId);
    if (runtime) {
      // [NEW] Stop using Module
      if (runtime.eventListener) {
        runtime.eventListener.stop();
      } else if (runtime.api && (runtime.api as any).listener) {
        // Fallback cleanup
        try {
          (runtime.api as any).listener.stop();
        } catch {}
      }
      this.bots.delete(tempId);
      console.log(`[BotManager] 🧹 Cleaned up session: ${tempId}`);
    }
  }

  // --- LOGIN FLOWS ---

  public async startLoginQR(tempSessionId: string) {
    const runtime = this.getOrInitBot(tempSessionId, undefined);
    try {
      console.log(`[LoginQR] Starting Session: ${tempSessionId}`);
      this.notifyStatus(tempSessionId, "STARTING", "Đang kết nối Zalo...");

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
          // [UPDATED] Broadcast QR to topic 'tempSessionId'
          sseManager.broadcast(tempSessionId, "qr", { image: base64 });
          runtime.status = "QR_WAITING";
        }
      });

      console.log(`[LoginQR] Scan Success: ${tempSessionId}`);
      sseManager.broadcast(tempSessionId, "status", {
        message: "Đăng nhập thành công! Đang xử lý...",
      });

      const credentials = this.extractCredentials(api, runtime.instance);
      await this.handleLoginSuccess_InMemory(tempSessionId, api, credentials);
    } catch (e: any) {
      console.error(`[LoginQR] Error:`, e.message);
      sseManager.broadcast(tempSessionId, "error", { message: e.message });
      this.bots.delete(tempSessionId);
    }
  }

  public async resumeSession(inputId: string) {
    try {
      // 1. Resolve Info ID first
      const botInfoId = await this.resolveBotInfoId(inputId);

      // 2. Fetch Token
      const { data } = await supabaseAdmin
        .from("zalo_bot_info")
        .select("access_token")
        .eq("id", botInfoId)
        .single();

      if (!data) throw new Error("Token not found in DB");

      // 3. [IMPORTANT] Resolve Canonical Identity ID
      // Find which identity owns this botInfoId
      const { data: identity } = await supabaseAdmin
        .from("zalo_identities")
        .select("id")
        .eq("ref_bot_id", botInfoId)
        .single();

      // Use Identity ID as the main key for the Map.
      // If not found (orphan bot info), fallback to inputId.
      const realIdentityId = identity?.id || inputId;

      // 4. Init Runtime with Correct ID
      const runtime = this.getOrInitBot(realIdentityId);
      runtime.botInfoId = botInfoId;

      await this.updateBotStatusInDB(
        botInfoId,
        "STARTING",
        "Đang khôi phục phiên...",
      );
      console.log(`[Resume] Restoring session for Identity: ${realIdentityId}`);

      await this.loginWithCredentials(realIdentityId, data.access_token);
    } catch (e: any) {
      console.error(`[Resume] Failed: ${e.message}`);
      try {
        const r = await this.resolveBotInfoId(inputId);
        await this.updateBotStatusInDB(r, "ERROR", e.message);
      } catch {}
      throw e;
    }
  }

  public async loginWithCredentials(
    identityId: string,
    credentials: ZaloCredentials,
  ) {
    // Ensure runtime exists at canonical ID
    const runtime = this.getOrInitBot(identityId);
    try {
      // Normalize cookie string if needed
      let cookieData = credentials.cookie;
      if (typeof cookieData === "string" && cookieData.trim().startsWith("{")) {
        try {
          cookieData = JSON.parse(cookieData);
        } catch {}
      }
      const finalCreds = { ...credentials, cookie: cookieData };

      const api = await runtime.instance.login(finalCreds);

      // Merge credentials to prevent data loss (IMEI/UA)
      const extracted = this.extractCredentials(api, runtime.instance);
      const mergedCredentials = {
        ...finalCreds,
        ...extracted,
        imei: extracted.imei || finalCreds.imei,
        userAgent: extracted.userAgent || finalCreds.userAgent,
        cookie:
          extracted.cookie && Object.keys(extracted.cookie).length > 0
            ? extracted.cookie
            : finalCreds.cookie,
      };

      if (!runtime.botInfoId) {
        runtime.botInfoId = await this.resolveBotInfoId(identityId);
      }

      await this.handleLoginSuccess(
        identityId,
        runtime.botInfoId!,
        api,
        mergedCredentials,
      );
    } catch (e: any) {
      throw new Error("Token không hợp lệ hoặc hết hạn.");
    }
  }

  // --- CORE LOGIC: LOGIN SUCCESS & CONFLICT HANDLING ---

  private async handleLoginSuccess_InMemory(
    sessionId: string,
    api: API,
    credentials: any,
  ) {
    const runtime = this.bots.get(sessionId);
    if (!runtime) return;

    runtime.api = api;
    const ownId = api.getOwnId();
    const info = (await api.fetchAccountInfo()) as any;

    const profile = info.profile || info.data || info;
    const globalId = profile.globalId || profile.userId || profile.uid || ownId;
    const rootName = profile.displayName || profile.zaloName || "Bot Mới";
    const avatar = profile.avatar || "";

    const isReLogin = !sessionId.startsWith("sess_");
    let realIdentityId: string = "";
    let realBotInfoId: string = "";
    let actionType: "created" | "updated" = "created";
    const now = new Date().toISOString();

    if (isReLogin) {
      // === RE-LOGIN FLOW ===
      const { data: currentIdentity } = await supabaseAdmin
        .from("zalo_identities")
        .select("zalo_global_id, ref_bot_id, root_name")
        .eq("id", sessionId)
        .single();

      if (currentIdentity) {
        // CONFLICT CHECK
        if (currentIdentity.zalo_global_id !== String(globalId)) {
          console.warn(
            `[Login] ⚠️ CONFLICT: Old(${currentIdentity.zalo_global_id}) vs New(${globalId})`,
          );
          runtime.status = "CONFLICT";
          runtime.pendingSession = {
            api,
            credentials,
            profile,
            globalId: String(globalId),
            rootName,
            avatar,
          };
          sseManager.broadcast(sessionId, "conflict", {
            message: "Tài khoản Zalo không khớp!",
            oldId: currentIdentity.zalo_global_id,
            newId: globalId,
            botId: sessionId,
          });
          return;
        }

        // Match -> Update
        realIdentityId = sessionId;
        realBotInfoId = currentIdentity.ref_bot_id;
        actionType = "updated";

        await supabaseAdmin
          .from("zalo_bot_info")
          .update({
            access_token: credentials,
            status: {
              state: "LOGGED_IN",
              message: "Đăng nhập lại thành công",
              last_update: now,
              qr_code: null,
            },
            last_active_at: now,
            is_active: true,
            name: rootName,
            avatar: avatar,
          })
          .eq("id", realBotInfoId);

        await supabaseAdmin
          .from("zalo_identities")
          .update({
            avatar: avatar,
            raw_data: { ...profile, _relogin: now },
            updated_at: now,
          })
          .eq("id", realIdentityId);
      } else {
        throw new Error("Re-login ID not found");
      }
    } else {
      // === CREATE NEW FLOW ===
      const { data: existingIdentity } = await supabaseAdmin
        .from("zalo_identities")
        .select("id, ref_bot_id, type")
        .eq("zalo_global_id", String(globalId))
        .single();
      if (existingIdentity) {
        console.log(
          `[Login] Identity exists (${existingIdentity.type}). Updating...`,
        );
        realIdentityId = existingIdentity.id;
        actionType = "updated";
        if (existingIdentity.ref_bot_id) {
          realBotInfoId = existingIdentity.ref_bot_id;
          await supabaseAdmin
            .from("zalo_bot_info")
            .update({
              access_token: credentials,
              status: {
                state: "LOGGED_IN",
                message: "Đăng nhập (Upgrade/Relogin)",
                last_update: now,
                qr_code: null,
              },
              last_active_at: now,
              is_active: true,
              name: rootName,
              avatar: avatar,
            })
            .eq("id", realBotInfoId);
        } else {
          const { data: newInfo } = await supabaseAdmin
            .from("zalo_bot_info")
            .insert({
              name: rootName,
              avatar: avatar,
              access_token: credentials,
              status: {
                state: "LOGGED_IN",
                message: "Đăng nhập mới (Upgrade)",
                last_update: now,
              },
              is_active: true,
              is_realtime_active: false,
            })
            .select("id")
            .single();
          realBotInfoId = newInfo!.id;
        }
        await supabaseAdmin
          .from("zalo_identities")
          .update({
            type: "system_bot",
            ref_bot_id: realBotInfoId,
            root_name: rootName,
            avatar: avatar,
            raw_data: { ...profile, _login: now },
            updated_at: now,
          })
          .eq("id", realIdentityId);
      } else {
        // Create All New
        const { data: newInfo } = await supabaseAdmin
          .from("zalo_bot_info")
          .insert({
            name: rootName,
            avatar: avatar,
            access_token: credentials,
            status: {
              state: "LOGGED_IN",
              message: "Đăng nhập mới thành công",
              last_update: now,
            },
            is_active: true,
            is_realtime_active: false,
          })
          .select("id")
          .single();
        realBotInfoId = newInfo!.id;
        const { data: newIdentity } = await supabaseAdmin
          .from("zalo_identities")
          .insert({
            zalo_global_id: String(globalId),
            root_name: rootName,
            avatar: avatar,
            type: "system_bot",
            ref_bot_id: realBotInfoId,
            raw_data: { ...profile, _first_login: now },
          })
          .select("id")
          .single();
        realIdentityId = newIdentity!.id;
      }
    }

    this.finalizeLogin(
      runtime,
      sessionId,
      realIdentityId,
      realBotInfoId,
      credentials,
      api,
      actionType,
    );
  }

  private async finalizeLogin(
    runtime: BotRuntime,
    tempKey: string,
    realId: string,
    botInfoId: string,
    creds: any,
    api: any,
    actionType: any,
  ) {
    runtime.botInfoId = botInfoId;
    runtime.status = "LOGGED_IN";
    runtime.credentials = creds;

    this.bots.set(realId, runtime);
    if (tempKey !== realId) {
      this.bots.delete(tempKey);
    }

    // [NEW] Init Listener
    runtime.eventListener = new ZaloEventListener(realId, api);

    // [UPDATED] Broadcast success
    sseManager.broadcast(tempKey, "success", {
      message: "Thành công!",
      realId,
      action: actionType,
    });
  }

  // --- RESOLVE CONFLICT ---

  public async resolveConflict(
    botId: string,
    decision: "retry" | "create_new",
  ) {
    const runtime = this.bots.get(botId);
    if (!runtime || runtime.status !== "CONFLICT" || !runtime.pendingSession) {
      throw new Error("Không tìm thấy session xung đột.");
    }

    const { api, credentials, profile, globalId, rootName, avatar } =
      runtime.pendingSession;
    const now = new Date().toISOString();

    if (decision === "retry") {
      console.log(`[Conflict] User chose RETRY -> Clearing session`);
      const { data: identity } = await supabaseAdmin
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();

      if (identity?.ref_bot_id) {
        await supabaseAdmin
          .from("zalo_bot_info")
          .update({
            status: {
              state: "STOPPED",
              message: "Hủy đăng nhập",
              last_update: new Date().toISOString(),
            },
          })
          .eq("id", identity.ref_bot_id);
      }

      runtime.pendingSession = undefined;
      runtime.status = "STOPPED";
      sseManager.broadcast(botId, "status", { message: "Đã hủy." });
      return;
    }

    if (decision === "create_new") {
      const { data: newInfo } = await supabaseAdmin
        .from("zalo_bot_info")
        .insert({
          name: rootName,
          avatar,
          access_token: credentials,
          status: {
            state: "LOGGED_IN",
            message: "New Bot",
            last_update: new Date().toISOString(),
          },
          is_active: true,
        })
        .select("id")
        .single();
      const { data: newIdentity } = await supabaseAdmin
        .from("zalo_identities")
        .insert({
          zalo_global_id: String(globalId),
          root_name: rootName,
          avatar,
          type: "system_bot",
          ref_bot_id: newInfo!.id,
          raw_data: { ...profile },
        })
        .select("id")
        .single();

      // Stop Old
      const { data: old } = await supabaseAdmin
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();
      if (old?.ref_bot_id)
        await supabaseAdmin
          .from("zalo_bot_info")
          .update({ status: { state: "STOPPED", message: "Replaced" } })
          .eq("id", old.ref_bot_id);

      this.bots.delete(botId);
      runtime.pendingSession = undefined;

      this.finalizeLogin(
        runtime,
        botId,
        newIdentity!.id,
        newInfo!.id,
        credentials,
        api,
        "created",
      );
    }
  }

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

    // [NEW] Initialize ZaloEventListener but DO NOT START yet
    runtime.eventListener = new ZaloEventListener(identityId, api);

    try {
      await SyncService.syncBotIdentity(identityId, api);
    } catch (e) {}

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

    console.log(
      `[BotManager] 🎉 Identity ${identityId} Logged In. Listener Standby.`,
    );
  }

  // --- REALTIME CONTROL (UPDATED) ---

  public async startRealtime(identityId: string) {
    let runtime = this.bots.get(identityId);

    // Auto-resume if missing
    if (!runtime || !runtime.api) {
      try {
        await this.resumeSession(identityId);
        runtime = this.bots.get(identityId);
      } catch (e) {
        throw new Error("Không thể bật Realtime: Bot chưa đăng nhập.");
      }
    }

    if (runtime && runtime.botInfoId) {
      // [NEW] Use Module to Start
      if (!runtime.eventListener) {
        // Fallback init if missing
        if (runtime.api)
          runtime.eventListener = new ZaloEventListener(
            identityId,
            runtime.api,
          );
      }

      if (runtime.eventListener) {
        runtime.eventListener.start();

        await this.updateBotStatusInDB(
          runtime.botInfoId,
          "ACTIVE",
          "Đang hoạt động (Realtime ON)",
        );
        // Also set local status
        runtime.status = "ACTIVE";
        console.log(`[Realtime] ✅ STARTED for ${identityId}`);
      } else {
        throw new Error("Listener Initialization Failed");
      }
    }
  }

  public async stopRealtime(identityId: string) {
    const runtime = this.bots.get(identityId);
    if (runtime && runtime.botInfoId) {
      // [NEW] Use Module to Stop
      if (runtime.eventListener) {
        runtime.eventListener.stop();
      }

      await this.updateBotStatusInDB(
        runtime.botInfoId,
        "LOGGED_IN",
        "Đã tắt Realtime",
      );
      runtime.status = "LOGGED_IN";
      console.log(`[Realtime] 🛑 STOPPED for ${identityId}`);
    }
  }

  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      // [NEW] Stop Listener Module
      if (runtime.eventListener) runtime.eventListener.stop();

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

  private async initSystem() {
    try {
      await supabaseAdmin
        .from("zalo_bot_info")
        .update({
          status: { state: "STOPPED", message: "Server Restarted" },
        })
        .neq("status->>state", "STOPPED");
    } catch (e) {
      console.error("[Init] Error:", e);
    }
    this.startHealthCheckLoop();
  }

  private async resolveBotInfoId(inputId: string): Promise<string> {
    const { data: identity } = await supabaseAdmin
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", inputId)
      .single();
    if (identity && identity.ref_bot_id) return identity.ref_bot_id;

    const { data: botInfo } = await supabaseAdmin
      .from("zalo_bot_info")
      .select("id")
      .eq("id", inputId)
      .single();
    if (botInfo) return botInfo.id;

    return inputId;
  }

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

  private notifyStatus(id: string, state: string, msg: string) {
    sseManager.broadcast(id, "status", { message: msg });
    const rt = this.bots.get(id);
    if (rt?.botInfoId) this.updateBotStatusInDB(rt.botInfoId, state, msg);
  }

  private async updateBotStatusInDB(
    botInfoId: string,
    state: string,
    msg?: string,
  ) {
    await supabaseAdmin
      .from("zalo_bot_info")
      .update({
        status: { state, message: msg, last_update: new Date().toISOString() },
      })
      .eq("id", botInfoId);
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
            if (runtime.api && runtime.botInfoId) {
              await runtime.api.fetchAccountInfo();
              const rt = this.bots.get(botId);
              if (rt) rt.lastPing = Date.now();
            }
          } catch (error) {
            await this.stopBot(botId);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }
}
