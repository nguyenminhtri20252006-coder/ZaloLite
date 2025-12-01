/**
 * lib/core/pipelines/message-parser.ts
 * [PIPELINE STEP 2]
 * Chuyển đổi RawZaloMessage -> StandardMessage.
 */

import {
  StandardMessage,
  NormalizedContent,
  RawZaloMessage,
} from "@/lib/types/zalo.types";

export class MessageParser {
  public parse(rawMsg: RawZaloMessage): StandardMessage | null {
    try {
      if (!rawMsg || !rawMsg.data) return null;

      const { msgType, content, uidFrom, dName, ts, quote } = rawMsg.data;

      // 1. Chuẩn hóa Content
      const normalizedContent = this.parseContent(msgType, content);

      // 2. Xây dựng object chuẩn
      return {
        msgId: rawMsg.data.msgId,
        threadId: rawMsg.threadId,
        isGroup: rawMsg.type === 1,
        type: rawMsg.type,
        isSelf: rawMsg.isSelf,
        timestamp: parseInt(ts) || Date.now(),
        sender: {
          uid: uidFrom,
          name: dName || "Unknown",
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
    } catch (error) {
      console.error("[MessageParser] Parse error:", error);
      return null;
    }
  }

  private parseContent(type: string, content: unknown): NormalizedContent {
    // Helper: Ép kiểu cục bộ an toàn
    const c = content as Record<string, unknown>;

    // A. TEXT & WEBCHAT (Rich Text)
    if (type === "webchat") {
      type WebChatContent = {
        title?: string;
        description?: string;
        msg?: string;
        message?: string;
        content?: string;
        params?: string | { styles?: unknown[] };
        styles?: unknown[];
        mentions?: unknown[];
      };

      // Ép kiểu an toàn
      const webChatData = content as WebChatContent;
      let text = "";
      let styles: unknown[] = [];

      if (typeof content === "string") {
        text = content;
      } else if (typeof webChatData === "object" && webChatData !== null) {
        // 1. Lấy Text: Ưu tiên 'title' (cho Rich Text) -> 'msg' -> 'description' -> các trường khác
        text =
          webChatData.title ||
          webChatData.msg ||
          webChatData.description ||
          webChatData.message ||
          webChatData.content ||
          "";

        if (Array.isArray(webChatData.styles)) {
          styles = webChatData.styles;
        } else if (typeof webChatData.params === "string") {
          try {
            const parsedParams = JSON.parse(webChatData.params);
            if (parsedParams && Array.isArray(parsedParams.styles)) {
              styles = parsedParams.styles;
            }
          } catch (e) {
            // Ignore parse error
          }
        } else if (
          typeof webChatData.params === "object" &&
          webChatData.params !== null
        ) {
          if (
            Array.isArray((webChatData.params as { styles?: unknown[] }).styles)
          ) {
            styles =
              (webChatData.params as { styles?: unknown[] }).styles || [];
          }
        }
      }

      // [DEBUG] Log kết quả parse styles
      if (styles.length > 0) {
        // console.log(`[Parser] Extracted ${styles.length} styles.`);
      }

      const mentions = Array.isArray(webChatData?.mentions)
        ? webChatData.mentions
        : undefined;

      return {
        type: "text",
        text: text,
        mentions,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        styles: styles as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as NormalizedContent & { styles?: any[] };
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
          url: String(c.href || ""),
          thumbnail: String(c.thumb || ""),
          width: Number(c.width) || 0,
          height: Number(c.height) || 0,
        },
      };
    }

    // D. VIDEO
    if (type === "chat.video.msg" && c) {
      let duration = 0,
        width = 0,
        height = 0;
      if (typeof c.params === "string") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta: any = JSON.parse(c.params);
          duration = Number(meta.duration) || 0;
          width = Number(meta.video_width) || 0;
          height = Number(meta.video_height) || 0;
        } catch {}
      }
      return {
        type: "video",
        data: {
          url: String(c.href || ""),
          thumbnail: String(c.thumb || ""),
          duration,
          width,
          height,
        },
      };
    }

    // E. VOICE
    if (type === "chat.voice" && c) {
      let duration = 0;
      if (typeof c.params === "string") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parsed: any = JSON.parse(c.params);
          duration = Number(parsed.duration) || 0;
        } catch {
          duration = parseInt(c.params) || 0;
        }
      }
      return {
        type: "voice",
        data: {
          url: String(c.href || ""),
          duration,
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
