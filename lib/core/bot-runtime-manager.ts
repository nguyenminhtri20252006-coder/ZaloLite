/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE - V3.1]
 * Update:
 * 1. Auto-Polling Mechanism (Tự động Sync theo chu kỳ).
 * 2. Update Heartbeat (last_activity_at) khi Sync.
 */

import { Zalo, API } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus } from "@/lib/types/database.types";
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
  pollingInterval?: NodeJS.Timeout; // [NEW] Timer cho polling
};

export class BotRuntimeManager {
  private static instance: BotRuntimeManager;
  private bots: Map<string, BotRuntime> = new Map();
  private messagePipeline: MessagePipeline;

  private constructor() {
    console.log("[BotManager] Khởi tạo Multi-Tenant Engine V3.1...");
    this.messagePipeline = new MessagePipeline();
    setTimeout(() => this.restoreBotsFromDB(), 2000);
  }

  public static getInstance(): BotRuntimeManager {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customGlobal = globalThis as any;
    if (!customGlobal.botRuntimeManager) {
      customGlobal.botRuntimeManager = new BotRuntimeManager();
    }
    return customGlobal.botRuntimeManager;
  }

  // --- RESTORE & INIT ---

  public async restoreBotsFromDB() {
    console.log("[BotManager] 🔄 Đang khôi phục các Bot từ DB...");
    try {
      const { data: bots, error } = await supabase
        .from("zalo_bots")
        .select("*")
        .eq("is_active", true);

      if (error) {
        console.error("[BotManager] ❌ Lỗi tải bots:", error.message);
        return;
      }

      if (bots && bots.length > 0) {
        for (const b of bots) {
          const credentials = b.access_token as ZaloCredentials | null;
          if (credentials && credentials.cookie && credentials.imei) {
            // Pass thêm config polling từ DB vào hàm login
            this.loginWithCredentials(
              b.id,
              credentials,
              b.auto_sync_interval,
            ).catch((e) => {
              console.error(`[BotManager] Khôi phục lỗi (${b.id}):`, e);
            });
          }
        }
      }
    } catch (e) {
      console.error("[BotManager] Exception Restore:", e);
    }
  }

  public getOrInitBot(botId: string): BotRuntime {
    if (this.bots.has(botId)) return this.bots.get(botId)!;

    const instance = new Zalo({
      selfListen: true,
      logging: true,
    });

    const runtime = { instance, api: null, status: "STOPPED" as const };
    this.bots.set(botId, runtime);
    return runtime;
  }

  // --- LOGIN ACTIONS ---

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

      console.log(`[BotManager] ✅ QR Login Success: ${botId}`);
      await this.handleLoginSuccess(botId, api);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BotManager] QR Error:`, errMsg);
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", errMsg);
    }
  }

  public async loginWithCredentials(
    botId: string,
    credentials: unknown,
    autoSyncInterval: number = 0, // [NEW] Tham số polling
  ) {
    const runtime = this.getOrInitBot(botId);
    console.log(
      `[BotManager] 🔐 Login credential: ${botId} (Polling: ${autoSyncInterval}m)`,
    );

    await this.updateBotStatusInDB(botId, "STARTING");
    runtime.status = "STARTING";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = await runtime.instance.login(credentials as any);
      await this.handleLoginSuccess(botId, api, autoSyncInterval);
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BotManager] Login Error:`, errMsg);
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", errMsg);
      throw error;
    }
  }

  // --- CORE HANDLER ---

  private async handleLoginSuccess(
    botId: string,
    api: API,
    autoSyncInterval: number = 0,
  ) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    // Clear old Polling & Listener
    if (runtime.pollingInterval) clearInterval(runtime.pollingInterval);
    if (runtime.api) {
      try {
        runtime.api.listener.stop();
      } catch {}
    }

    runtime.api = api;
    runtime.status = "LOGGED_IN";

    // 1. Update Info & Heartbeat
    await this.updateBotInfoAndHeartbeat(botId, api);

    // 2. Setup Listener
    this.setupMessageListener(botId, api);

    // 3. Trigger Initial Sync (Ngay lập tức)
    this.triggerSync(botId, "LOGIN_INIT");

    // 4. Setup Polling (Nếu có cấu hình)
    if (autoSyncInterval > 0) {
      console.log(
        `[BotManager] ⏰ Setup Polling for ${botId}: Every ${autoSyncInterval} mins`,
      );
      runtime.pollingInterval = setInterval(() => {
        this.triggerSync(botId, "AUTO_POLLING");
      }, autoSyncInterval * 60 * 1000);
    }
  }

  // Hàm Sync Wrapper để cập nhật Heartbeat
  private async triggerSync(botId: string, source: string) {
    console.log(`[BotManager] 🔄 Trigger Sync (${source}) for ${botId}...`);
    try {
      const res = await SyncService.syncAll(botId);
      if (res.success) {
        // Cập nhật last_activity_at để chứng minh bot còn sống
        await supabase
          .from("zalo_bots")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", botId);
        console.log(
          `[BotManager] ✅ Sync Success (${source}) & Heartbeat Updated.`,
        );
      }
    } catch (e) {
      console.error(`[BotManager] ⚠️ Sync Failed (${source}):`, e);
    }
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
          last_activity_at: new Date().toISOString(), // Heartbeat ban đầu
        })
        .eq("id", botId);
    } catch (e) {
      console.error("[BotManager] DB Update Info Error:", e);
    }
  }

  private setupMessageListener(botId: string, api: API) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("message", async (message: any) => {
      // Khi nhận tin nhắn cũng là một dấu hiệu Bot còn sống -> Update Heartbeat (Debounced nếu cần)
      // Ở đây ta tạm update nhẹ trong DB (hoặc có thể bỏ qua để tối ưu performace, chỉ update khi Sync)
      await this.messagePipeline.process(botId, message);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("error", (err: any) => {
      console.error(`[BotManager] ❌ LISTENER ERROR (${botId}):`, err);
      // Nếu lỗi auth, tự động update DB thành ERROR
      // Logic: Update DB status -> ERROR
    });

    api.listener.start();
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

  public async stopBot(botId: string) {
    const runtime = this.bots.get(botId);
    if (runtime) {
      if (runtime.pollingInterval) clearInterval(runtime.pollingInterval);
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
