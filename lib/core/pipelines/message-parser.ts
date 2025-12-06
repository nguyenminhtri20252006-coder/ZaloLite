/**
 * lib/core/pipelines/message-parser.ts
 * [PIPELINE STEP 2]
 * Chuyển đổi RawZaloMessage (unknown) -> StandardMessage.
 * Updated: Typesafe (no any), sử dụng Type Guards để validate dữ liệu từ Zalo.
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

      // Trích xuất an toàn các trường
      // Lưu ý: Cần cast về Record<string, unknown> để truy cập thuộc tính
      const msgData = data as unknown as Record<string, unknown>;

      const msgType = String(msgData.msgType || "");
      const content = msgData.content;
      const uidFrom = String(msgData.uidFrom || "");
      const dName = String(msgData.dName || "");
      const ts = String(msgData.ts || "0");
      const msgId = String(msgData.msgId || "");
      const cliMsgId = String(msgData.cliMsgId || "");

      // Trích xuất Avatar (thường là 'avt' hoặc 'avatar')
      const senderAvatar = String(msgData.avt || msgData.avatar || "");

      // Xử lý Quote (Trích dẫn)
      let quote: StandardMessage["quote"] = undefined;
      const rawQuote = msgData.quote as Record<string, unknown> | undefined;

      if (rawQuote) {
        quote = {
          text: String(rawQuote.msg || ""),
          senderId: String(rawQuote.ownerId || ""),
          attach:
            typeof rawQuote.attach === "string" ? rawQuote.attach : undefined,
        };
      }

      // 1. Chuẩn hóa Content
      const normalizedContent = this.parseContent(msgType, content);

      // 2. Xây dựng object chuẩn
      const standardMsg: StandardMessage = {
        msgId: msgId || cliMsgId || String(Date.now()),
        threadId: rawMsg.threadId,
        isGroup: rawMsg.type === 1,
        type: rawMsg.type,
        isSelf: rawMsg.isSelf,
        timestamp: parseInt(ts) || Date.now(),
        sender: {
          uid: uidFrom,
          name: dName || "Unknown",
          avatar: senderAvatar,
        },
        content: normalizedContent,
        quote: quote,
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

    if (!c) return { type: "unknown", raw: content };

    // A. TEXT & WEBCHAT (Rich Text)
    if (type === "webchat" || type === "chat.text") {
      const text = String(
        c.title || c.msg || c.description || c.message || c.content || "",
      );

      return {
        type: "text",
        text: text,
        mentions: undefined,
      };
    }

    // B. STICKER
    if (type === "chat.sticker") {
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
    if (type === "chat.photo") {
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
    if (type === "chat.video.msg") {
      return {
        type: "video",
        data: {
          url: String(c.href || ""),
          thumbnail: String(c.thumb || ""),
          duration: Number(c.duration) || 0,
          width: 0,
          height: 0,
        },
      };
    }

    // E. VOICE
    if (type === "chat.voice") {
      return {
        type: "voice",
        data: {
          url: String(c.href || ""),
          duration: Number(c.duration) || 0,
        },
      };
    }

    // F. LINK
    if (type === "chat.recommended") {
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
