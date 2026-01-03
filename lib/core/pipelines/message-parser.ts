/**
 * lib/core/pipelines/message-parser.ts
 * [PIPELINE STEP 1]
 * Chuyển đổi RawZaloMessage -> StandardMessage (Normalized).
 * Tuân thủ Blueprint V6.3: Hỗ trợ đầy đủ Media & Quote.
 */

import {
  StandardMessage,
  NormalizedContent,
  RawZaloMessage,
} from "@/lib/types/zalo.types";

export class MessageParser {
  public parse(rawMsg: RawZaloMessage): StandardMessage | null {
    try {
      if (!rawMsg || !rawMsg.data) {
        return null;
      }

      const data = rawMsg.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgData = data as any; // Cast any để truy cập các trường động

      const msgType = String(msgData.msgType || "unknown");
      const msgId = String(msgData.msgId || msgData.cliMsgId || Date.now());

      // Timestamp xử lý an toàn
      const ts = Number(msgData.ts || Date.now());

      // Lấy thông tin Sender thô (chưa định danh hệ thống)
      const uidFrom = String(msgData.uidFrom || "0");
      const dName = String(msgData.dName || "Unknown");
      const senderAvatar = String(msgData.avt || msgData.avatar || "");

      // Xử lý Quote (Trả lời tin nhắn)
      let quote: StandardMessage["quote"] = undefined;
      if (msgData.quote) {
        quote = {
          text: String(msgData.quote.msg || ""),
          senderId: String(msgData.quote.ownerId || ""),
          // [FIX] Map msgId từ quote sang relatedMsgId
          relatedMsgId: String(msgData.quote.msgId || ""),
          attach:
            typeof msgData.quote.attach === "string"
              ? msgData.quote.attach
              : undefined,
        };
      }

      // Chuẩn hóa nội dung (Core Logic)
      const normalizedContent = this.parseContent(msgType, msgData.content);

      // Construct Standard Message
      const standardMsg: StandardMessage = {
        msgId: msgId,
        threadId: rawMsg.threadId,
        isGroup: rawMsg.type === 1,
        type: rawMsg.type,
        isSelf: rawMsg.isSelf,
        timestamp: ts,
        sender: {
          uid: uidFrom,
          name: dName,
          avatar: senderAvatar,
        },
        content: normalizedContent,
        quote: quote,
      };

      return standardMsg;
    } catch (error) {
      console.error("[MessageParser] Critical Parse Error:", error);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseContent(type: string, content: any): NormalizedContent {
    // 1. TEXT (Webchat)
    if (type === "webchat") {
      const textBody =
        typeof content === "string"
          ? content
          : String(content?.text || content?.msg || JSON.stringify(content));

      return {
        type: "text",
        data: { text: textBody },
      };
    }

    // Helper ép kiểu an toàn
    const c = (content || {}) as Record<string, unknown>;

    // 2. IMAGE (Photo) -> Map sang type 'image'
    if (type === "chat.photo" || type === "photo") {
      return {
        type: "image",
        data: {
          url: String(c.href || c.url || c.normalUrl || ""),
          thumbnail: String(c.thumb || c.thumbnail || ""),
          width: Number(c.width) || 0,
          height: Number(c.height) || 0,
          photoId: String(c.photoId || c.id || ""),
          description: String(c.description || c.desc || ""),
        },
      };
    }

    // 3. STICKER
    if (type === "chat.sticker" || type === "sticker") {
      return {
        type: "sticker",
        data: {
          stickerId: Number(c.id) || 0,
          cateId: Number(c.cateId || c.catId) || 0,
          type: Number(c.type) || 1,
          stickerUrl: String(c.url || ""),
        },
      };
    }

    // 4. LINK
    if (type === "chat.recommended" || type === "link") {
      return {
        type: "link",
        data: {
          url: String(c.href || c.link || ""),
          title: String(c.title || ""),
          description: String(c.desc || c.description || ""),
          thumbnail: String(c.thumb || ""),
        },
      };
    }

    // 5. VOICE
    if (type === "chat.voice" || type === "voice") {
      return {
        type: "voice",
        data: {
          url: String(c.href || c.url || ""),
          duration: Number(c.duration) || 0,
        },
      };
    }

    // 6. VIDEO
    if (type === "chat.video.msg" || type === "video") {
      return {
        type: "video",
        data: {
          url: String(c.href || c.url || ""),
          thumbnail: String(c.thumb || ""),
          duration: Number(c.duration) || 0,
          fileId: String(c.fileId || ""),
        },
      };
    }

    // 7. FILE
    if (type === "chat.file" || type === "file") {
      return {
        type: "file",
        data: {
          url: String(c.href || c.url || ""),
          fileId: String(c.fileId || c.id || ""),
          title: String(c.title || c.name || "File"),
          size: Number(c.size) || 0,
          checksum: String(c.checksum || ""),
        },
      };
    }

    // Fallback
    return {
      type: "unknown",
      data: {
        text: `[Unsupported Type: ${type}]`,
        raw: content,
      },
    };
  }
}
