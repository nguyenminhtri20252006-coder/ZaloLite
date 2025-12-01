/**
 * lib/core/services/media-service.ts
 * [LAYER 3 - INFRASTRUCTURE]
 * Module chuyên biệt xử lý Media: Tải Buffer và Metadata.
 */

import sharp from "sharp";

export class MediaService {
  private static instance: MediaService;

  private constructor() {}

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  /**
   * Tải tài nguyên từ URL về Buffer.
   */
  public async downloadToBuffer(url: string): Promise<Buffer> {
    try {
      // Sử dụng global fetch (Node.js 18+)
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "[https://chat.zalo.me/](https://chat.zalo.me/)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP Error ${response.status}: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`[MediaService] Download failed for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Phân tích Buffer ảnh để lấy Metadata.
   */
  public async getImageMetadata(buffer: Buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        size: metadata.size || buffer.length,
        format: metadata.format,
      };
    } catch (error) {
      console.error("[MediaService] Sharp error:", error);
      // Fallback an toàn nếu lỗi
      return { width: 0, height: 0, size: buffer.length, format: "unknown" };
    }
  }
}
