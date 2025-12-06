/**
 * lib/core/pipelines/echo-worker.ts
 * [PIPELINE STEP 5]
 * Module Nhại Lại Riêng Biệt (Echo Bot).
 * Updated: Tương thích với type StandardMessage mới (normalized).
 */

import { StandardMessage } from "@/lib/types/zalo.types";
import { SenderService } from "@/lib/core/services/sender-service";
import { MediaService } from "@/lib/core/services/media-service";

export class EchoWorker {
  private senderService = SenderService.getInstance();
  private mediaService = MediaService.getInstance();

  public async process(message: StandardMessage) {
    // Không nhại lại tin nhắn của chính mình (đã xử lý ở tầng trên, check lại cho chắc)
    if (message.isSelf) return;

    const { content, threadId, isGroup } = message;
    console.log(`[EchoWorker] Processing echo for type: ${content.type}`);

    try {
      switch (content.type) {
        case "text":
          // Tránh vòng lặp vô hạn nếu bot khác cũng đang echo
          if (!content.text.startsWith("Bot nhại:")) {
            await this.senderService.sendText(
              `Bot nhại: ${content.text}`,
              threadId,
              isGroup,
            );
          }
          break;

        case "sticker":
          await this.senderService.sendSticker(content.data, threadId, isGroup);
          break;

        case "photo":
          if (content.data.url) {
            console.log("[EchoWorker] Downloading photo buffer for echo...");
            try {
              // 1. Tải Buffer từ URL ảnh gốc
              const buffer = await this.mediaService.downloadToBuffer(
                content.data.url,
              );
              console.log(`[EchoWorker] Buffer size: ${buffer.length} bytes`);

              await this.senderService.sendImage(
                buffer,
                threadId,
                isGroup,
                "Bot nhại ảnh (Buffer Mode)",
              );
            } catch (e: unknown) {
              const err = e instanceof Error ? e.message : String(e);
              console.error("[EchoWorker] Failed to process photo echo:", err);
            }
          }
          break;

        case "voice":
          if (content.data.url) {
            await this.senderService.sendVoice(
              content.data.url,
              threadId,
              isGroup,
            );
          }
          break;

        case "video":
          if (content.data.url) {
            await this.senderService.sendVideo(content.data, threadId, isGroup);
          }
          break;
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error.message : String(error);
      console.error("[EchoWorker] Global Error:", err);
    }
  }
}
