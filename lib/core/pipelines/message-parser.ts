/**
 * lib/core/pipelines/message-parser.ts
 * [PIPELINE STEP 2]
 * Chuyển đổi RawZaloMessage -> StandardMessage.
 * [FIX] Bổ sung trích xuất Avatar người gửi.
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = rawMsg.data as any;
      const { msgType, content, uidFrom, dName, ts, quote, msgId, cliMsgId } =
        data;

      // [FIX] Trích xuất Avatar từ message raw (thường là trường 'avt' hoặc 'avatar')
      const senderAvatar = data.avt || data.avatar || "";

      // 1. Chuẩn hóa Content
      const normalizedContent = this.parseContent(msgType, content);

      // 2. Xây dựng object chuẩn
      const standardMsg: StandardMessage = {
        msgId: msgId || cliMsgId || Date.now().toString(),
        threadId: rawMsg.threadId,
        isGroup: rawMsg.type === 1,
        type: rawMsg.type,
        isSelf: rawMsg.isSelf,
        timestamp: parseInt(ts) || Date.now(),
        sender: {
          uid: uidFrom,
          name: dName || "Unknown",
          avatar: senderAvatar, // [NEW] Thêm avatar
        },
        content: normalizedContent,
        quote: quote
          ? {
              text: quote.msg,
              senderId: quote.ownerId,
              attach: quote.attach,
            }
          : undefined,
      };

      return standardMsg;
    } catch (error) {
      console.error("[MessageParser] Parse error:", error);
      return null;
    }
  }

  private parseContent(type: string, content: unknown): NormalizedContent {
    // Helper: Ép kiểu cục bộ an toàn
    const c = content as Record<string, unknown>;

    // A. TEXT & WEBCHAT (Rich Text)
    if (type === "webchat" || type === "chat.text") {
      // ... (Giữ nguyên logic cũ của Text)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webChatData = content as any;
      const text =
        webChatData.title ||
        webChatData.msg ||
        webChatData.description ||
        webChatData.message ||
        webChatData.content ||
        "";

      return {
        type: "text",
        text: text,
        mentions: undefined,
      };
    }

    // B. STICKER
    if (type === "chat.sticker" && c) {
      return {
        type: "sticker",
        data: {
          id: Number(c.id) || 0,
          cateId: Number(c.catId || c.cateId) || 0,
          type: Number(c.type) || 1,
          url: typeof c.url === "string" ? c.url : undefined,
        },
      };
    }

    // C. PHOTO
    if (type === "chat.photo" && c) {
      return {
        type: "photo",
        data: {
          url: String(c.href || c.url || ""),
          thumbnail: String(c.thumb || ""),
          width: Number(c.width) || 0,
          height: Number(c.height) || 0,
          title: String(c.title || ""),
          description: String(c.desc || ""),
        },
      };
    }

    // D. VIDEO
    if (type === "chat.video.msg" && c) {
      return {
        type: "video",
        data: {
          url: String(c.href || ""),
          thumbnail: String(c.thumb || ""),
          duration: 0,
          width: 0,
          height: 0,
        },
      };
    }

    // E. VOICE
    if (type === "chat.voice" && c) {
      return {
        type: "voice",
        data: {
          url: String(c.href || ""),
          duration: 0,
        },
      };
    }

    // F. LINK
    if (type === "chat.recommended" && c) {
      return {
        type: "link",
        data: {
          url: String(c.href || ""),
          title: String(c.title || ""),
          description: String(c.desc || c.description || ""),
          thumbnail: String(c.thumb || ""),
        },
      };
    }

    return { type: "unknown", raw: content };
  }
}
