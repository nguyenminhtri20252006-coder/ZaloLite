/**
 * lib/core/bot-runtime-manager.ts
 * [CORE ENGINE - V2]
 * Quản lý vòng đời Bot (Login/Logout/Restore).
 * Updated: Tương thích schema v2.0 (raw_data, access_token), sử dụng 'unknown' thay vì 'any'.
 */

import { Zalo, API } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { MessagePipeline } from "./pipelines/message-pipeline";
import { ZaloBotStatus } from "@/lib/types/database.types";

// Định nghĩa kiểu nội bộ cho Credentials để sử dụng trong Runtime (Type Casting)
interface ZaloCredentials {
  imei: string;
  cookie: unknown;
  userAgent: string;
}

// Kiểu lưu trữ runtime trong RAM
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
    // Lưu ý: Vẫn giữ casting any cho globalThis vì đây là pattern singleton của Next.js dev

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
          // Cast access_token từ JSONB (unknown) sang kiểu Credentials
          const credentials = b.access_token as ZaloCredentials | null;

          if (credentials && credentials.cookie && credentials.imei) {
            console.log(`[BotManager] Khôi phục bot: ${b.name} (${b.id})`);
            // Chạy async không await để không block loop
            this.loginWithCredentials(b.id, credentials).catch((e) => {
              console.error(
                `[BotManager] Khôi phục thất bại bot ${b.id}:`,
                e instanceof Error ? e.message : String(e),
              );
            });
          } else {
            console.warn(
              `[BotManager] Bot ${b.name} thiếu credentials hợp lệ.`,
            );
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = await runtime.instance.loginQR({}, async (qrData: any) => {
        // Callback nhận QR
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
      // Zalo instance login chấp nhận any/unknown nhưng cần đúng cấu trúc runtime
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

    // [UPDATED] Logic lấy và lưu raw_data vào DB v2
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let profileUpdate: any = {};
    let rawData: unknown = {};

    try {
      // 1. Gọi API fetch profile
      const infoResponse = await api.fetchAccountInfo();

      // 2. Xử lý response (có thể là string JSON hoặc object)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsedInfo: any = infoResponse;

      if (typeof infoResponse === "string") {
        try {
          parsedInfo = JSON.parse(infoResponse);
        } catch (parseErr) {
          console.error("[BotManager] Lỗi Parse JSON profile:", parseErr);
        }
      }

      rawData = parsedInfo; // Lưu lại dữ liệu gốc để đưa vào cột raw_data

      // 3. Trích xuất thông tin chuẩn hóa (Normalized)
      const profile = parsedInfo?.data || parsedInfo?.profile || parsedInfo;

      // Fallback ID nếu không lấy được
      const globalId =
        profile?.userId || profile?.id || profile?.uid || api.getOwnId();

      profileUpdate = {
        global_id: globalId,
        name:
          profile?.displayName || profile?.zaloName || `Zalo Bot ${globalId}`,
        avatar: profile?.avatar || profile?.picture || "",
        phone: profile?.phoneNumber || profile?.phone || null,
      };

      console.log(
        `[BotManager] Extracted Profile for ${botId}:`,
        profileUpdate,
      );
    } catch (e: unknown) {
      console.warn(
        "[BotManager] Failed to fetch full profile (using fallback):",
        e instanceof Error ? e.message : String(e),
      );
      const fallbackId = api.getOwnId();
      profileUpdate = {
        global_id: fallbackId,
        name: `Zalo Bot ${fallbackId}`,
      };
    }

    // 4. Update DB (Sử dụng cấu trúc bảng v2: access_token, raw_data)
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
          raw_data: rawData, // Lưu dữ liệu gốc vào JSONB
          access_token: credentials, // Lưu credentials
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

    // 5. Khởi động lắng nghe tin nhắn
    this.setupMessageListener(botId, api);
  }

  private setupMessageListener(botId: string, api: API) {
    console.log(`[BotManager] Starting message listener for ${botId}...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.listener.on("message", async (message: any) => {
      // Chuyển message sang Pipeline xử lý
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
      .update({ status: statusObj }) // Supabase tự cast object sang jsonb
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
