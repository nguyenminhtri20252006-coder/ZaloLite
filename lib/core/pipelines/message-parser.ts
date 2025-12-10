/**
 * lib/core/pipelines/message-parser.ts
 * [PIPELINE STEP 2]
 * Chuyển đổi RawZaloMessage -> StandardMessage.
 * [FIXED] Sửa lỗi TypeScript (Type mismatch & Implicit Any).
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
      const msgData = data as unknown as Record<string, unknown>;

      const msgType = String(msgData.msgType || "unknown");

      const msgId = String(msgData.msgId || "");
      const cliMsgId = String(msgData.cliMsgId || "");
      const finalMsgId = msgId || cliMsgId || String(Date.now());

      const uidFrom = String(msgData.uidFrom || "");
      const dName = String(msgData.dName || "");
      const ts = String(msgData.ts || Date.now().toString());
      const senderAvatar = String(msgData.avt || msgData.avatar || "");

      // Quote
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

      const contentRaw = msgData.content;
      const normalizedContent = this.parseContent(msgType, contentRaw);

      const standardMsg: StandardMessage = {
        msgId: finalMsgId,
        threadId: rawMsg.threadId,
        isGroup: rawMsg.type === 1,
        type: rawMsg.type,
        isSelf: rawMsg.isSelf,
        timestamp: Number(ts),
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
      console.error("[MessageParser] Critical Parse Error:", error);
      return {
        msgId: String(Date.now()),
        threadId: rawMsg.threadId,
        isGroup: false,
        type: 0,
        isSelf: rawMsg.isSelf,
        timestamp: Date.now(),
        sender: { uid: "error", name: "System Error" },
        content: { type: "text", text: "Error parsing message." },
      };
    }
  }

  private parseContent(type: string, content: unknown): NormalizedContent {
    // CASE A: WEBCHAT
    if (type === "webchat") {
      let textBody = "";
      if (typeof content === "string") {
        textBody = content;
      } else if (typeof content === "object" && content !== null) {
        // [FIX] Explicitly cast to Record to avoid implicit any
        const c = content as Record<string, unknown>;
        textBody = String(c.text || c.msg || c.content || JSON.stringify(c));
      } else {
        textBody = String(content);
      }

      return {
        type: "text",
        text: textBody,
        mentions: undefined,
      };
    }

    // Helper ép kiểu an toàn
    const c = (content || {}) as Record<string, unknown>;

    // CASE B: PHOTO
    if (type === "chat.photo" || type === "photo") {
      return {
        type: "photo",
        data: {
          url: String(c.href || c.url || c.normalUrl || ""),
          thumbnail: String(c.thumb || c.thumbnail || ""),
          width: Number(c.width) || 0,
          height: Number(c.height) || 0,
          title: String(c.title || ""),
          description: String(c.description || c.desc || ""),
        },
      };
    }

    // CASE C: LINK
    if (type === "chat.recommended" || type === "link") {
      return {
        type: "link", // Type này đã khớp với StandardLink trong zalo.types.ts
        data: {
          url: String(c.href || c.link || ""),
          title: String(c.title || ""),
          description: String(c.desc || c.description || ""),
          thumbnail: String(c.thumb || ""),
        },
      };
    }

    // CASE D: STICKER
    if (type === "chat.sticker" || type === "sticker") {
      return {
        type: "sticker",
        data: {
          id: Number(c.id) || 0,
          cateId: Number(c.cateId || c.catId) || 0,
          type: Number(c.type) || 1,
          url: typeof c.url === "string" ? c.url : undefined,
        },
      };
    }

    // CASE E: VOICE
    if (type === "chat.voice" || type === "voice") {
      return {
        type: "voice",
        data: {
          url: String(c.href || c.url || ""),
          duration: Number(c.duration) || 0,
        },
      };
    }

    // CASE F: VIDEO
    if (type === "chat.video.msg" || type === "video") {
      return {
        type: "video",
        data: {
          url: String(c.href || c.url || ""),
          thumbnail: String(c.thumb || ""),
          duration: Number(c.duration) || 0,
          width: 0,
          height: 0,
        },
      };
    }

    // Default / Fallback
    const fallbackText = String(c.title || c.description || c.href || "");
    if (fallbackText) {
      return { type: "text", text: `[${type}] ${fallbackText}` };
    }

    return { type: "unknown", raw: content };
  }
}
