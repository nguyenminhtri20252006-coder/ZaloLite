/**
 * lib/core/services/sender-service.ts
 * [LAYER 3 - INFRASTRUCTURE]
 * Wrapper gửi tin nhắn qua Zalo API.
 * Updated: Type safe logging & Error handling.
 */

import { API, ThreadType } from "zca-js";
import { StandardSticker, StandardVideo } from "@/lib/types/zalo.types";

export class SenderService {
  private static instance: SenderService;
  private api: API | null = null;

  private constructor() {}

  public static getInstance(): SenderService {
    if (!SenderService.instance) {
      SenderService.instance = new SenderService();
    }
    return SenderService.instance;
  }

  public setApi(api: API) {
    this.api = api;
  }

  private getApi(): API {
    if (!this.api)
      throw new Error("API instance chưa sẵn sàng (Chưa đăng nhập/Inject).");
    return this.api;
  }

  // Helper chuyển đổi boolean -> enum
  private getType(isGroup: boolean) {
    return isGroup ? ThreadType.Group : ThreadType.User;
  }

  // --- API GATES ---

  public async sendText(content: string, threadId: string, isGroup: boolean) {
    const api = this.getApi();
    const type = this.getType(isGroup);

    console.log(`[Sender] Sending text to ${threadId} (Group: ${isGroup})`);

    try {
      const result = await api.sendMessage(content, threadId, type);
      console.log(`[Sender] Result:`, result);
      return result;
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`[Sender] Failed to send text:`, err);
      throw e;
    }
  }

  public async sendSticker(
    sticker: StandardSticker,
    threadId: string,
    isGroup: boolean,
  ) {
    try {
      return await this.getApi().sendSticker(
        sticker,
        threadId,
        this.getType(isGroup),
      );
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[Sender] Send Sticker Error:", err);
      throw e;
    }
  }

  public async sendImage(
    buffer: Buffer,
    threadId: string,
    isGroup: boolean,
    caption: string = "",
  ) {
    const api = this.getApi();
    const type = this.getType(isGroup);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message: any = {
      msg: caption || "",
      attachments: [
        {
          data: buffer,
          filename: `photo_${Date.now()}.jpg`,
          metadata: { totalSize: buffer.length },
        },
      ],
    };

    try {
      return await api.sendMessage(message, threadId, type);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[Sender] Send Image Error:", err);
      throw e;
    }
  }

  public async sendVoice(url: string, threadId: string, isGroup: boolean) {
    try {
      return await this.getApi().sendVoice(
        { voiceUrl: url, ttl: 0 },
        threadId,
        this.getType(isGroup),
      );
    } catch (e: unknown) {
      console.error("[Sender] Send Voice Error:", e);
      throw e;
    }
  }

  public async sendVideo(
    video: StandardVideo,
    threadId: string,
    isGroup: boolean,
  ) {
    try {
      return await this.getApi().sendVideo(
        {
          videoUrl: video.url,
          thumbnailUrl: video.thumbnail,
          duration: video.duration || 0,
          width: video.width || 0,
          height: video.height || 0,
          msg: "Video",
        },
        threadId,
        this.getType(isGroup),
      );
    } catch (e: unknown) {
      console.error("[Sender] Send Video Error:", e);
      throw e;
    }
  }
}
