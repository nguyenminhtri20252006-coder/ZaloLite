/* eslint-disable @typescript-eslint/no-explicit-any */
import { API } from "zca-js";
import {
  IMediaStrategy,
  ImageStrategy,
  VideoStrategy,
  AudioStrategy,
  FileStrategy,
} from "./media-strategies";
import { MediaType, NormalizedMediaData } from "@/lib/types/zalo.types";

export class MediaService {
  private static instance: MediaService;
  private strategies: Map<string, IMediaStrategy> = new Map();

  private constructor() {
    this.registerStrategy(new ImageStrategy());
    this.registerStrategy(new VideoStrategy());
    this.registerStrategy(new AudioStrategy()); // Dùng cho 'audio' (voice)
    this.registerStrategy(new FileStrategy());
  }

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  private registerStrategy(strategy: IMediaStrategy) {
    this.strategies.set(strategy.getType(), strategy);
  }

  /**
   * Main Process: Dựa vào type để quyết định Upload hay Store Temp
   */
  public async processMedia(
    api: API,
    type: MediaType,
    buffer: Buffer,
    clientMeta: any,
  ): Promise<NormalizedMediaData> {
    const strategy = this.strategies.get(type);
    if (!strategy) throw new Error(`[MediaService] Unsupported type: ${type}`);

    const threadId = clientMeta.threadId;
    if (!threadId) throw new Error("[MediaService] Missing threadId context");

    console.log(`[MediaService] Executing strategy for [${type}]...`);

    try {
      // 1. Execute Strategy (Upload hoặc Store)
      const resultRaw = await strategy.execute(
        api,
        buffer,
        clientMeta.fileName,
        threadId,
      );

      // 2. Normalize Output
      return this.normalizeOutput(type, resultRaw, clientMeta);
    } catch (error) {
      console.error(`[MediaService] Execution Failed:`, error);
      throw error;
    }
  }

  private normalizeOutput(
    type: MediaType,
    raw: any,
    meta: any,
  ): NormalizedMediaData {
    // Base
    const result: NormalizedMediaData = {
      type,
      url: raw.fileUrl || raw.url || raw.href || "", // Có thể rỗng nếu là Image/File (chưa upload)
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      width: meta.width,
      height: meta.height,
      duration: meta.duration ? meta.duration * 1000 : 0, // Convert s -> ms
    };

    // Specifics
    if (type === "image" || type === "file") {
      // Với loại này, raw chứa { filePath }
      // Ta hack vào field 'url' hoặc thêm field riêng để truyền path xuống sender
      // Tạm dùng 'url' để chứa filePath (vì SenderService sẽ check)
      // Hoặc tốt hơn: NormalizedMediaData nên có field 'filePath'
      (result as any).filePath = raw.filePath;
    } else {
      // Video/Voice: raw chứa info từ Zalo Upload
      result.fileId = raw.fileId;
      result.checksum = raw.checksum;
      result.thumbnail = raw.thumb || raw.thumbnailUrl;
    }

    return result;
  }
}
