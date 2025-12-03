/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE]
 * Fix: Thêm cơ chế JSON.parse() tự động và log chi tiết quá trình trích xuất Profile.
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
    // Tự động khôi phục bot sau 1 giây
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
        bots.forEach((b) => {
          if (b.access_token) {
            console.log(`[BotManager] Khôi phục bot: ${b.name} (${b.id})`);
            this.loginWithCredentials(b.id, b.access_token).catch((e) => {
              console.error(
                `[BotManager] Khôi phục thất bại bot ${b.id}:`,
                e.message,
              );
            });
          }
        });
      }
    } catch (e) {
      console.error("[BotManager] Exception in restoreBotsFromDB:", e);
    }
  }

  public getOrInitBot(botId: string): BotRuntime {
    if (this.bots.has(botId)) return this.bots.get(botId)!;

    console.log(`[BotManager] Khởi tạo instance Zalo mới cho ${botId}`);
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

    if (runtime.status === "LOGGED_IN") {
      console.log(`[BotManager] Bot ${botId} đã đăng nhập, bỏ qua QR.`);
      return;
    }

    await this.updateBotStatusInDB(botId, "QR_WAITING");
    runtime.status = "QR_WAITING";

    try {
      console.log(`[BotManager] Đang yêu cầu QR code cho ${botId}...`);
      const api = await runtime.instance.loginQR({}, async (qrData: any) => {
        let base64 = typeof qrData === "string" ? qrData : qrData.data?.image;
        if (base64 && !base64.startsWith("data:image"))
          base64 = `data:image/png;base64,${base64}`;
        await this.updateBotStatusInDB(botId, "QR_WAITING", undefined, base64);
      });

      console.log(`[BotManager] QR Login thành công cho ${botId}.`);
      await this.handleLoginSuccess(botId, api);
    } catch (error: any) {
      console.error(`[BotManager] QR Error (${botId}):`, error);
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", error.message);
    }
  }

  public async loginWithCredentials(botId: string, credentials: any) {
    const runtime = this.getOrInitBot(botId);
    if (runtime.status === "LOGGED_IN") return { success: true };

    console.log(`[BotManager] Login credential cho ${botId}...`);
    await this.updateBotStatusInDB(botId, "STARTING");
    runtime.status = "STARTING";

    try {
      const api = await runtime.instance.login(credentials);
      await this.handleLoginSuccess(botId, api);
      return { success: true };
    } catch (error: any) {
      console.error(
        `[BotManager] Login credential thất bại (${botId}):`,
        error,
      );
      runtime.status = "ERROR";
      await this.updateBotStatusInDB(botId, "ERROR", error.message);
      throw error;
    }
  }

  // --- CORE HANDLER ---

  private async handleLoginSuccess(botId: string, api: API) {
    const runtime = this.bots.get(botId);
    if (!runtime) return;

    if (runtime.api) {
      try {
        runtime.api.listener.stop();
      } catch {}
    }

    runtime.api = api;
    runtime.status = "LOGGED_IN";

    console.log(
      `[BotManager] Bot ${botId} -> LOGGED IN. Bắt đầu lấy Profile...`,
    );

    // [FIX] Logic lấy và parse thông tin tài khoản
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let profileUpdate: any = {};

    try {
      // 1. Gọi API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let infoResponse: any = await api.fetchAccountInfo();

      // 2. [QUAN TRỌNG] Kiểm tra xem có phải chuỗi không -> Parse JSON
      if (typeof infoResponse === "string") {
        console.log("[BotManager] Response là string, đang parse JSON...");
        try {
          infoResponse = JSON.parse(infoResponse);
        } catch (parseErr) {
          console.error("[BotManager] Lỗi Parse JSON profile:", parseErr);
        }
      }

      console.log(
        `[BotManager] Response Object Keys:`,
        Object.keys(infoResponse || {}),
      );

      // 3. Trích xuất Profile Object (Ưu tiên 'profile' theo log thực tế)
      const profile = infoResponse.profile || infoResponse.data || infoResponse;

      if (!profile) {
        console.warn(
          "[BotManager] Không tìm thấy object profile trong response!",
        );
      } else {
        console.log(
          `[BotManager] Extracted Profile: name="${profile.displayName}", id="${profile.userId}"`,
        );
      }

      // 4. Fallback ID
      const globalId =
        profile?.userId || profile?.id || profile?.uid || api.getOwnId();

      console.log(`[BotManager] Final Global ID: ${globalId}`);

      // 5. Construct Payload
      profileUpdate = {
        global_id: globalId,
        name:
          profile?.displayName ||
          profile?.zaloName ||
          profile?.name ||
          `Zalo User ${globalId}`,
        avatar:
          profile?.avatar ||
          profile?.img ||
          profile?.picture ||
          profile?.bgAvatar ||
          "",
        phone: profile?.phoneNumber || profile?.phone || null,
      };
    } catch (e: any) {
      console.warn(
        "[BotManager] Failed to fetch full profile (using fallback):",
        e.message,
      );
      const fallbackId = api.getOwnId();
      profileUpdate = {
        global_id: fallbackId,
        name: `Zalo Bot ${fallbackId}`,
      };
    }

    console.log(`[BotManager] Payload update DB:`, profileUpdate);

    // 6. Update DB
    const context = api.getContext();
    const credentials = {
      cookie: context.cookie,
      imei: context.imei,
      userAgent: context.userAgent,
    };

    try {
      const { error } = await supabase
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

      if (error) {
        console.error("[BotManager] DB Update Error:", error);
      } else {
        console.log("[BotManager] DB Update Success.");
      }
    } catch (dbErr) {
      console.error("[BotManager] DB Update Exception:", dbErr);
    }

    this.setupMessageListener(botId, api);
  }

  private setupMessageListener(botId: string, api: API) {
    console.log(`[BotManager] Starting message listener for ${botId}...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("message", async (message: any) => {
      await this.messagePipeline.process(botId, message);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("error", (err: any) => {
      console.error(`[BotManager] Listener Error (${botId}):`, err);
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
    if (!runtime) {
      throw new Error(
        `Bot ${botId} chưa được khởi tạo. Vui lòng refresh hoặc login lại.`,
      );
    }
    if (!runtime.api) {
      throw new Error(
        `Bot ${botId} chưa sẵn sàng (Status: ${runtime.status}). Đang kết nối...`,
      );
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
