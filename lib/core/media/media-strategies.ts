/* eslint-disable @typescript-eslint/no-explicit-any */
import { API, ThreadType } from "zca-js";
import fs from "fs";
import path from "path";

// Interface chung cho các chiến lược upload
export interface IMediaStrategy {
  // Trả về { url, fileId, ... } hoặc { filePath }
  execute(
    api: API,
    buffer: Buffer,
    filename: string,
    threadId: string,
  ): Promise<any>;
  getType(): string;
}

/**
 * Helper: Ghi Buffer ra file tạm và thực thi callback
 */
async function withTempFile<T>(
  buffer: Buffer,
  filename: string = "temp_file",
  callback: (filePath: string) => Promise<T>,
  keepFile: boolean = false, // [NEW] Option giữ file lại (cho Image/File strategy)
): Promise<T> {
  const tempDir = path.resolve(process.cwd(), "temp_uploads");
  if (!fs.existsSync(tempDir)) {
    try {
      fs.mkdirSync(tempDir, { recursive: true });
    } catch (e) {
      console.error("[TempFile] Failed to create temp dir:", e);
      throw e;
    }
  }

  const safeName = filename.replace(/[^a-z0-9.]/gi, "_");
  const tempFilePath = path.join(tempDir, `${Date.now()}_${safeName}`);
  const normalizedPath = tempFilePath.split(path.sep).join("/");

  try {
    console.log(
      `[TempFile] Writing ${buffer.length} bytes to ${normalizedPath}`,
    );
    await fs.promises.writeFile(normalizedPath, buffer);
    await new Promise((r) => setTimeout(r, 100)); // Lock safety

    const result = await callback(normalizedPath);
    return result;
  } catch (error) {
    console.error(`[TempFile] Error:`, error);
    // Nếu lỗi, luôn xóa file dù keepFile=true
    if (fs.existsSync(normalizedPath)) await fs.promises.unlink(normalizedPath);
    throw error;
  } finally {
    // Chỉ xóa nếu keepFile = false.
    // Nếu keepFile = true, trách nhiệm xóa thuộc về người gọi sau này (SenderService).
    if (!keepFile && fs.existsSync(normalizedPath)) {
      try {
        await fs.promises.unlink(normalizedPath);
        console.log(`[TempFile] Cleaned up: ${normalizedPath}`);
      } catch (e) {
        console.error(`[TempFile] Cleanup error:`, e);
      }
    }
  }
}

/**
 * Strategy: Image (Chỉ lưu file tạm để sendMessage tự upload)
 */
export class ImageStrategy implements IMediaStrategy {
  getType() {
    return "image";
  }

  async execute(api: API, buffer: Buffer, filename: string, threadId: string) {
    // Keep file = true vì sendMessage cần path này sau đó
    return withTempFile(
      buffer,
      filename || "image.jpg",
      async (filePath) => {
        console.log(`[ImageStrategy] Stored temp file at: ${filePath}`);
        return { filePath }; // Trả về đường dẫn local
      },
      true,
    );
  }
}

/**
 * Strategy: File (Chỉ lưu file tạm)
 */
export class FileStrategy implements IMediaStrategy {
  getType() {
    return "file";
  }

  async execute(api: API, buffer: Buffer, filename: string, threadId: string) {
    return withTempFile(
      buffer,
      filename || "doc.bin",
      async (filePath) => {
        console.log(`[FileStrategy] Stored temp file at: ${filePath}`);
        return { filePath };
      },
      true,
    );
  }
}

/**
 * Strategy: Video (Upload lấy URL)
 */
export class VideoStrategy implements IMediaStrategy {
  getType() {
    return "video";
  }

  async execute(api: API, buffer: Buffer, filename: string, threadId: string) {
    // Keep file = false vì upload xong là xong
    return withTempFile(
      buffer,
      filename || "video.mp4",
      async (filePath) => {
        console.log(`[VideoStrategy] Uploading...`);
        // API v2: uploadAttachment([path], threadId, type)
        const res = await (api as any).uploadAttachment(
          [filePath],
          threadId,
          ThreadType.User,
        );
        console.log(`[VideoStrategy] Result:`, res);
        // Kết quả trả về là mảng, lấy phần tử đầu tiên
        return Array.isArray(res) ? res[0] : res;
      },
      false,
    );
  }
}

/**
 * Strategy: Audio/Voice (Upload lấy URL)
 */
export class AudioStrategy implements IMediaStrategy {
  getType() {
    return "audio";
  }

  async execute(api: API, buffer: Buffer, filename: string, threadId: string) {
    return withTempFile(
      buffer,
      filename || "audio.mp3",
      async (filePath) => {
        console.log(`[AudioStrategy] Uploading...`);
        const res = await (api as any).uploadAttachment(
          [filePath],
          threadId,
          ThreadType.User,
        );
        console.log(`[AudioStrategy] Result:`, res);
        return Array.isArray(res) ? res[0] : res;
      },
      false,
    );
  }
}
