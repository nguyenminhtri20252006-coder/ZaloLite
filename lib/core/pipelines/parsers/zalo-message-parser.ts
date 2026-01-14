/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * lib/core/pipelines/parsers/zalo-message-parser.ts
 * [MAIN PARSER - V17.0 SIMPLIFIED THREAD LOGIC]
 * - Optimization: Determine Group/Private based on `rawMsg.type`.
 * - Fix: Use `rawMsg.threadId` directly as the Source of Truth for Routing Key.
 * - Logic:
 * + type = 1 -> Group
 * + type = 0 -> Private
 * + targetId = rawMsg.threadId (Always correct External ID)
 */

import { TextParser } from "./text-parser";
import { MediaParser } from "./media-parser";
import { InteractionParser } from "./interaction-parser";

export type NormalizedMessage = {
  type:
    | "text"
    | "image"
    | "sticker"
    | "voice"
    | "video"
    | "file"
    | "link"
    | "html"
    | "undo"
    | "reaction"
    | "unknown";
  content: any;
  meta: {
    senderUid: string;
    targetId: string;
    ts: number;
    msgId: string;
    cliMsgId: string;
    isGroup: boolean;
    quote?: any;
  };
  actionData?: {
    reaction?: any;
  };
};

export class ZaloMessageParser {
  public static parse(rawMsg: any): NormalizedMessage | null {
    try {
      if (!rawMsg || !rawMsg.data) return null;

      const d = rawMsg.data;
      const msgType = d.msgType || "unknown";

      // --- 1. DETERMINE GROUP STATUS (Based on 'type') ---
      // type: 0 = Private, 1 = Group (Source: User Logs)
      // Fallback to d.sourceId check if type is undefined
      let isGroup = false;
      if (typeof rawMsg.type !== "undefined") {
        isGroup = Number(rawMsg.type) === 1;
      } else {
        isGroup = !rawMsg.isSelf && !!d.sourceId;
      }

      // --- 2. DETERMINE TARGET ID (ROUTING KEY) ---
      // User Confirmed: rawMsg.threadId is ALWAYS the correct External ID
      // (Customer ID for Private, Group ID for Group)
      let targetId = String(rawMsg.threadId || "");

      // Fallback Safety (Only if threadId is missing - rarely happens)
      if (!targetId || targetId === "0") {
        if (isGroup) {
          targetId = String(d.sourceId || d.idTo || "0");
        } else {
          // Private: If Self -> idTo, If Incoming -> uidFrom
          targetId = rawMsg.isSelf ? String(d.idTo) : String(d.uidFrom);
        }
      }

      // Metadata chung
      const meta = {
        senderUid: String(d.uidFrom || "0"),
        targetId: targetId, // <--- DIRECT & ACCURATE
        ts: Number(d.ts || Date.now()),
        msgId: String(d.msgId || Date.now()),
        cliMsgId: String(d.cliMsgId || ""),
        isGroup: isGroup,
        quote: d.quote ? ZaloMessageParser.parseQuote(d.quote) : undefined,
      };

      // 3. Routing sang Sub-Parsers
      switch (msgType) {
        case "webchat":
        case "chat.text":
          return { type: "html", content: TextParser.parse(d), meta };

        case "chat.photo":
        case "chat.doodle":
          return { type: "image", content: MediaParser.parseImage(d), meta };

        case "chat.sticker":
        case "sticker":
          return {
            type: "sticker",
            content: InteractionParser.parseSticker(d),
            meta,
          };

        case "chat.voice":
          return { type: "voice", content: MediaParser.parseVoice(d), meta };

        case "chat.video.msg":
          return { type: "video", content: MediaParser.parseVideo(d), meta };

        case "share.file":
        case "chat.file":
          return { type: "file", content: MediaParser.parseFile(d), meta };

        case "chat.recommended":
        case "link":
          return { type: "link", content: MediaParser.parseLink(d), meta };

        case "chat.undo":
          // InteractionHandler will handle logic, Pipeline just skips
          return { type: "undo", content: {}, meta };

        case "chat.reaction":
          return {
            type: "reaction",
            content: {},
            meta,
            actionData: { reaction: InteractionParser.parseReaction(d) },
          };

        default:
          return {
            type: "unknown",
            content: { text: `[Unsupported: ${msgType}]`, raw: d.content },
            meta,
          };
      }
    } catch (e) {
      console.error("[ZaloMessageParser] Error:", e);
      return null;
    }
  }

  private static parseQuote(quoteData: any) {
    return {
      text: quoteData.msg,
      senderId: quoteData.ownerId,
      relatedMsgId: quoteData.msgId,
      thumb: quoteData.thumb,
    };
  }
}
