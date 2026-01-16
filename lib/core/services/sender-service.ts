/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * lib/core/services/sender-service.ts
 * [LAYER 3 - INFRASTRUCTURE]
 * Wrapper gửi tin nhắn qua Zalo API với logic Routing & Self-Sync.
 * [UPDATED] Fix TypeScript errors for NormalizedContent types.
 */

import { API, ThreadType } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { NormalizedContent, MediaType } from "@/lib/types/zalo.types";

// [NEW] Interface chuẩn hóa kết quả gửi tin
export interface SentMessageResult {
  msgId: string;
  ts: string | number;
  cliMsgId?: string;
}

export class SenderService {
  private static instance: SenderService;
  private api: API | null = null;
  private botId: string | null = null;

  private constructor() {}

  public static getInstance(): SenderService {
    if (!SenderService.instance) {
      SenderService.instance = new SenderService();
    }
    return SenderService.instance;
  }

  public setApi(api: API, botId: string) {
    this.api = api;
    this.botId = botId;
  }

  private getApi(): API {
    if (!this.api) throw new Error("API instance chưa sẵn sàng.");
    return this.api;
  }

  public async sendMessage(
    conversationId: string,
    content: NormalizedContent,
    staffId: string | null = null,
  ) {
    if (!this.botId) throw new Error("Bot ID not set in SenderService");

    // --- 1. ROUTING CHECK ---
    const { data: member, error } = await supabase
      .from("conversation_members")
      .select("thread_id")
      .eq("conversation_id", conversationId)
      .eq("identity_id", this.botId)
      .single();

    if (error || !member || !member.thread_id) {
      throw new Error(
        `Bot chưa tham gia hội thoại này. ConvID: ${conversationId}`,
      );
    }

    const threadId = member.thread_id;
    const { data: conv } = await supabase
      .from("conversations")
      .select("type")
      .eq("id", conversationId)
      .single();

    const isGroup = conv?.type === "group";
    const zaloType = isGroup ? ThreadType.Group : ThreadType.User;

    console.log(
      `[SenderService] Sending ${content.type} to ${threadId} (Group: ${isGroup})`,
    );

    // --- 2. SEND VIA API (PAYLOAD MAPPING) ---
    let result: any;
    const d = content.data; // Shortcut
    const msgType = content.type as string;

    try {
      switch (msgType) {
        case "text":
          result = await this.getApi().sendMessage(
            d.text || "",
            threadId,
            zaloType,
          );
          break;

        case "sticker":
          if (!d.stickerId) throw new Error("Missing stickerId");
          result = await this.getApi().sendSticker(
            {
              id: Number(d.stickerId),
              cateId: Number(d.cateId || 0),
              type: 1,
            },
            threadId,
            zaloType,
          );
          break;

        case "image":
          // Payload gửi ảnh: msgType='chat.photo' + quote
          if (!d.photoId && !d.url) throw new Error("Image requires ID or URL");
          const imgBody = {
            msg: d.caption || "",
            quote: {
              href: d.url,
              photoId: d.photoId,
              thumb: d.thumbnail || d.url,
              width: Number(d.width || 0),
              height: Number(d.height || 0),
              normalUrl: d.url,
            },
          };
          result = await this.getApi().sendMessage(
            imgBody as any,
            threadId,
            zaloType,
          );
          break;

        case "video":
          if (!d.fileId) throw new Error("Video requires fileId");
          // Payload gửi video: msgType='chat.video.msg'
          const vidBody = {
            msgType: "chat.video.msg",
            content: {
              fileId: d.fileId,
              href: d.url,
              thumb: d.thumbnail || "",
              duration: Number(d.duration || 0), // ms
              width: Number(d.width || 0),
              height: Number(d.height || 0),
              fileSize: Number(d.fileSize || 0),
              checksum: d.checksum || "",
            },
          };
          result = await this.getApi().sendMessage(
            vidBody as any,
            threadId,
            zaloType,
          );
          break;

        case "voice":
        case "audio":
          // Voice Message Logic:
          // API yêu cầu { href: string, duration: number (ms) }
          // Lưu ý: duration phải là số mili-giây.
          if (!d.url) throw new Error("Voice requires URL");
          const voiceBody = {
            msgType: "chat.voice",
            content: {
              href: d.url,
              duration: Number(d.duration || 0),
            },
          };
          result = await this.getApi().sendMessage(
            voiceBody as any,
            threadId,
            zaloType,
          );
          break;

        case "file":
          // Payload gửi file: msgType='chat.file'
          if (!d.url) throw new Error("File requires URL");
          const fileBody = {
            msgType: "chat.file",
            content: {
              href: d.url,
              title: d.fileName || "File",
              size: Number(d.fileSize || 0),
              fileId: d.fileId,
              checksum: d.checksum,
            },
          };
          result = await this.getApi().sendMessage(
            fileBody as any,
            threadId,
            zaloType,
          );
          break;

        default:
          // Fallback for types not explicitly handled in switch but present in MediaType
          throw new Error(`Unsupported message type: ${msgType}`);
      }
    } catch (e) {
      console.error("[SenderService] API Fail:", e);
      throw e;
    }

    // --- 3. SELF-SYNC ---
    const msgId = result.msgId || String(Date.now());
    await this.selfSyncMessage(conversationId, msgId, content, staffId);

    return result;
  }

  private async selfSyncMessage(
    conversationId: string,
    msgId: string,
    content: NormalizedContent,
    staffId: string | null,
  ) {
    if (!this.botId) return;

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      zalo_msg_id: msgId,
      sender_id: this.botId,
      sender_type: "bot",
      staff_id: staffId,
      content: content,
      listening_bot_ids: [this.botId],
      status: "sent",
      is_self: true,
      sent_at: new Date().toISOString(),
    });

    await supabase
      .from("conversations")
      .update({
        last_activity_at: new Date().toISOString(),
        last_message: content,
      })
      .eq("id", conversationId);
  }
  /**
   * Hàm mới chuyên dụng cho MediaHandler
   * Trả về Raw Zalo Message Object để lấy msgId/cliMsgId ngay lập tức.
   */
  public async sendMediaDirect(
    threadId: string,
    content: NormalizedContent,
    useDirectAttachment: boolean = false,
  ): Promise<SentMessageResult> {
    // [FIX] Return type explicit
    const api = this.getApi();
    const d = content.data;
    const threadType = threadId.startsWith("g")
      ? ThreadType.Group
      : ThreadType.User;

    console.log(`[SenderService] Sending ${content.type} to ${threadId}...`);

    let rawRes: any;

    switch (content.type) {
      case "video":
        if (!d.url) throw new Error("Missing videoUrl");
        rawRes = await api.sendVideo(
          {
            videoUrl: d.url,
            thumbnailUrl: d.thumbnail || d.url,
            duration: d.duration || 0,
            width: d.width || 0,
            height: d.height || 0,
            msg: d.caption || "",
          },
          threadId,
          threadType,
        );
        break;

      case "voice":
      case "audio":
        if (!d.url) throw new Error("Missing voiceUrl");
        rawRes = await api.sendVoice(
          {
            voiceUrl: d.url,
            ttl: 60000,
          },
          threadId,
          threadType,
        );
        break;

      case "image":
        const imagePath = (d as any).filePath;
        if (!imagePath) throw new Error("Missing image filePath");

        rawRes = await api.sendMessage(
          {
            msg: d.caption || "",
            attachments: [imagePath],
          },
          threadId,
          threadType,
        );
        break;

      case "file":
        const filePath = (d as any).filePath;
        if (!filePath) throw new Error("Missing document filePath");

        rawRes = await api.sendMessage(
          {
            msg: d.caption || "",
            attachments: [filePath],
          },
          threadId,
          threadType,
        );
        break;

      default:
        throw new Error("Unsupported type for media send");
    }

    // [FIX] Normalize Response
    // ZCA-JS response structure varies by type. We need to extract msgId consistently.
    // sendMessage returns: { message: { msgId, ... }, attachment: [...] } OR just Message object depending on version

    let msgId = "";
    let ts = Date.now();
    let cliMsgId = "";

    if (rawRes) {
      if (rawRes.msgId) {
        // Flat object (Video/Voice thường trả về cái này)
        msgId = rawRes.msgId;
        ts = rawRes.ts || ts;
        cliMsgId = rawRes.cliMsgId;
      } else if (rawRes.message && rawRes.message.msgId) {
        // Nested object (sendMessage trả về cái này)
        msgId = rawRes.message.msgId;
        ts = rawRes.message.ts || ts;
        cliMsgId = rawRes.message.cliMsgId;
      }
    }

    if (!msgId) {
      // Fallback: Nếu không lấy được ID, log warning và fake ID tạm (tránh crash)
      console.warn(
        "[SenderService] Cannot extract msgId from response:",
        rawRes,
      );
      msgId = `unknown_${Date.now()}`;
    }

    return { msgId, ts, cliMsgId };
  }
}
