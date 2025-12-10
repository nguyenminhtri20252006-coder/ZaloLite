/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE - V2.1]
 * Update: Force Enable selfListen & Add Deep Debug Logs.
 */

import { Zalo, API } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus } from "@/lib/types/database.types";

interface ZaloCredentials {
  imei: string;
  cookie: unknown;
  userAgent: string;
}

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
    setTimeout(() => this.restoreBotsFromDB(), 1000);
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
    console.log("[BotManager] Đang khôi phục các Bot từ DB...");
    try {
      const { data: bots, error } = await supabase
        .from("zalo_bots")
        .select("*")
        .eq("is_active", true);

      if (error) {
        console.error("[BotManager] Lỗi tải bots từ DB:", error.message);
        return;
      }

      if (bots && bots.length > 0) {
        console.log(`[BotManager] Tìm thấy ${bots.length} bot cần khôi phục.`);
        for (const b of bots) {
          const credentials = b.access_token as ZaloCredentials | null;
          if (credentials && credentials.cookie && credentials.imei) {
            console.log(`[BotManager] Khôi phục bot: ${b.name} (${b.id})`);
            this.loginWithCredentials(b.id, credentials).catch((e) => {
              console.error(
                `[BotManager] Khôi phục thất bại bot ${b.id}:`,
                e instanceof Error ? e.message : String(e),
              );
            });
          }
        }
      }
    } catch (e) {
      console.error("[BotManager] Exception in restoreBotsFromDB:", e);
    }
  }

  public getOrInitBot(botId: string): BotRuntime {
    if (this.bots.has(botId)) return this.bots.get(botId)!;

    console.log(`[BotManager] Khởi tạo instance Zalo mới cho ${botId}`);
    console.log(`[BotManager] Force enabling selfListen: true`);

    // [CRITICAL FIX] Đảm bảo selfListen luôn bật
    const instance = new Zalo({
      selfListen: true, // QUAN TRỌNG: Để nhận tin nhắn chính mình gửi
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

      console.log(`[BotManager] QR Login thành công cho ${botId}.`);
      await this.handleLoginSuccess(botId, api);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BotManager] QR Error (${botId}):`, errMsg);
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", errMsg);
    }
  }

  public async loginWithCredentials(botId: string, credentials: unknown) {
    const runtime = this.getOrInitBot(botId);
    if (runtime.status === "LOGGED_IN") return { success: true };

    console.log(`[BotManager] Login credential cho ${botId}...`);
    await this.updateBotStatusInDB(botId, "STARTING");
    runtime.status = "STARTING";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = await runtime.instance.login(credentials as any);
      await this.handleLoginSuccess(botId, api);
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[BotManager] Login credential thất bại (${botId}):`,
        errMsg,
      );
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", errMsg);
      throw error;
    }
  }

  // --- CORE HANDLER ---

  private async handleLoginSuccess(botId: string, api: API) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    // Reset listener cũ nếu có
    if (runtime.api) {
      try {
        runtime.api.listener.stop();
      } catch {}
    }

    runtime.api = api;
    runtime.status = "LOGGED_IN";

    // --- Update DB Logic (Rút gọn) ---
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
          },
        })
        .eq("id", botId);
    } catch (e) {
      console.error("[BotManager] DB Update Error:", e);
    }

    // [IMPORTANT] Setup Listener
    this.setupMessageListener(botId, api);
  }

  private setupMessageListener(botId: string, api: API) {
    console.log(`[BotManager] 🎧 STARTING LISTENER for ${botId}...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("message", async (message: any) => {
      // [DEBUG] Log quan trọng để kiểm tra tin nhắn đến
      console.log(
        `[BotManager] 📨 EVENT RECEIVED | isSelf: ${message.isSelf} | Type: ${message.data?.msgType}`,
      );

      // Chuyển message sang Pipeline xử lý
      await this.messagePipeline.process(botId, message);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("error", (err: any) => {
      console.error(`[BotManager] ❌ LISTENER ERROR (${botId}):`, err);
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
    if (!runtime || !runtime.api) {
      throw new Error(`Bot ${botId} chưa sẵn sàng.`);
    }
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
