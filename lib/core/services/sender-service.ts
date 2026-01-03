/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/sender-service.ts
 * [LAYER 3 - INFRASTRUCTURE]
 * Wrapper gửi tin nhắn qua Zalo API với logic Upload & Self-Sync.
 * Tuân thủ Blueprint V6.3.
 */

import { API, ThreadType } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { NormalizedContent } from "@/lib/types/zalo.types";

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

  /**
   * 1. HÀM GỐC: Gửi tin nhắn và lưu vào DB (Self-Sync)
   */
  public async sendMessage(
    conversationId: string,
    content: NormalizedContent,
    staffId: string | null = null,
  ) {
    if (!this.botId) throw new Error("Bot ID not set in SenderService");

    // BƯỚC 1: ROUTING CHECK
    const { data: member, error } = await supabase
      .from("conversation_members")
      .select("thread_id")
      .eq("conversation_id", conversationId)
      .eq("identity_id", this.botId)
      .single();

    if (error || !member || !member.thread_id) {
      throw new Error(
        `Bot chưa tham gia hội thoại này hoặc không có quyền gửi tin. ConvID: ${conversationId}`,
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

    console.log(`[Sender] Sending to ${threadId} (Group: ${isGroup})`);

    // BƯỚC 2 & 3: UPLOAD & SEND (API Call)
    let result: any;

    try {
      switch (content.type) {
        case "text":
          // [FIX] Access via content.data.text
          result = await this.getApi().sendMessage(
            content.data.text || "",
            threadId,
            zaloType,
          );
          break;

        case "sticker":
          if (!content.data.stickerId) throw new Error("Missing stickerId");
          // [FIX] Access via content.data.stickerId
          // [FIX] Removed 'url' property as it is not part of SendStickerPayload
          result = await this.getApi().sendSticker(
            {
              id: content.data.stickerId,
              cateId: content.data.cateId || 0,
              type: content.data.type || 1,
            },
            threadId,
            zaloType,
          );
          break;

        case "voice":
          // Voice logic with type casting
          if (!content.data.url || !content.data.duration) {
            throw new Error(
              "Voice message requires url and duration (calculated from client)",
            );
          }

          // Ép kiểu any cho payload để tránh lỗi 'url does not exist' nếu type definition thiếu
          const voicePayload = {
            url: content.data.url,
            duration: content.data.duration,
            size: (content.data as any).size, // Optional
          } as any;

          result = await this.getApi().sendVoice(
            voicePayload,
            threadId,
            zaloType,
          );
          break;

        case "video":
          // Video logic with type casting
          if (!content.data.fileId) {
            throw new Error(
              "Video message requires fileId (from upload result)",
            );
          }

          const videoData = content.data as any;

          const videoPayload = {
            fileId: videoData.fileId,
            checksum: videoData.checksum || "",
            duration: videoData.duration || 0,
            width: videoData.width || 0,
            height: videoData.height || 0,
          } as any;

          result = await this.getApi().sendVideo(
            videoPayload,
            threadId,
            zaloType,
          );
          break;

        case "image":
          // [IMPLEMENTED] Logic gửi ảnh dựa trên metadata đã upload
          if (!content.data.photoId && !content.data.url) {
            throw new Error(
              "Image message requires photoId or url (from upload result)",
            );
          }

          // Construct Payload theo tài liệu ZCA-JS:
          // Gửi ảnh thực chất là sendMessage với body chứa quote (là attachment data)
          const imageMsgBody = {
            msg: content.data.description || "", // Caption
            quote: {
              // Map fields từ NormalizedContent sang cấu trúc Zalo Attachment
              href: content.data.url,
              photoId: content.data.photoId,
              thumb: content.data.thumbnail,
              width: content.data.width,
              height: content.data.height,
              // Một số version cần thêm normalUrl
              normalUrl: content.data.url,
            },
          };

          // Gọi api.sendMessage. ZCA-JS sẽ tự detect đây là tin nhắn ảnh dựa trên cấu trúc quote.
          result = await this.getApi().sendMessage(
            imageMsgBody as any,
            threadId,
            zaloType,
          );
          break;

        default:
          // [FIX] Safe access
          throw new Error(
            `Unsupported message type for sending: ${(content as any).type}`,
          );
      }
    } catch (e) {
      console.error("[Sender] API Error:", e);
      throw e;
    }

    // BƯỚC 4: SELF-SYNC
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
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  /**
   * Hỗ trợ upload file để lấy Attachment ID
   * [NEW] Hàm này trả về Metadata đầy đủ (checksum, duration, etc.)
   */
  public async uploadMedia(
    type: "image" | "video" | "audio" | "file",
    fileData: Buffer | string,
  ) {
    try {
      // Lưu ý mapping type: zca-js dùng 'audio', không phải 'voice'
      const res: any = await this.getApi().uploadAttachment(
        type,
        fileData as any,
      );
      return res;
      /** * Result structure typically:
       * - Audio: { url: "...", fileId: "..." }
       * - Video: { fileId: "...", checksum: "...", duration: ... }
       * - Image: { photoId: "...", url: "..." }
       */
    } catch (error) {
      console.error("[Sender] Upload Error:", error);
      throw error;
    }
  }
}
