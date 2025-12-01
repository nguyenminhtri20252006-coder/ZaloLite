/**
 * lib/core/services/sender-service.ts
 * [LAYER 3 - OUTBOUND HUB]
 * Hub gửi tin nhắn tập trung. Fix lỗi 'sendImage' type.
 */

import { API, ThreadType } from "zca-js";
import {
  StandardSticker,
  StandardVideo,
  ExtendedAPI,
} from "@/lib/types/zalo.types";

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
      throw new Error("API instance chưa sẵn sàng (Chưa đăng nhập).");
    return this.api;
  }

  // Helper chuyển đổi boolean -> enum
  private getType(isGroup: boolean) {
    return isGroup ? ThreadType.Group : ThreadType.User;
  }

  // --- API GATES ---

  public async sendText(content: string, threadId: string, isGroup: boolean) {
    return this.getApi().sendMessage(content, threadId, this.getType(isGroup));
  }

  public async sendSticker(
    sticker: StandardSticker,
    threadId: string,
    isGroup: boolean,
  ) {
    return this.getApi().sendSticker(sticker, threadId, this.getType(isGroup));
  }

  /**
   * FIX LỖI: Ép kiểu api sang ExtendedAPI để TS không báo lỗi thiếu method sendImage
   */
  public async sendImage(
    buffer: Buffer,
    threadId: string,
    isGroup: boolean,
    caption: string = "",
  ) {
    const api = this.getApi();
    const type = this.getType(isGroup);

    console.log(`[SenderService] Sending Image Buffer to ${threadId}...`);

    // Cấu trúc tin nhắn gửi ảnh dạng Buffer (như trong runTestImageAttachment)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message: any = {
      msg: caption || "Gửi ảnh (Buffer)",
      attachments: [
        {
          data: buffer,
          filename: `photo_${Date.now()}.jpg`, // Tên file ngẫu nhiên
          metadata: { totalSize: buffer.length },
        },
      ],
    };

    // Sử dụng sendMessage chuẩn để gửi cấu trúc này
    return api.sendMessage(message, threadId, type);
  }

  public async sendVoice(url: string, threadId: string, isGroup: boolean) {
    return this.getApi().sendVoice(
      { voiceUrl: url, ttl: 0 },
      threadId,
      this.getType(isGroup),
    );
  }

  public async sendVideo(
    video: StandardVideo,
    threadId: string,
    isGroup: boolean,
  ) {
    return this.getApi().sendVideo(
      {
        videoUrl: video.url,
        thumbnailUrl: video.thumbnail,
        duration: video.duration,
        width: video.width,
        height: video.height,
        msg: "Bot nhại video",
      },
      threadId,
      this.getType(isGroup),
    );
  }
}
