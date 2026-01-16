/* eslint-disable @typescript-eslint/no-explicit-any */
import { API } from "zca-js";
import supabase from "@/lib/supabaseServer";
import { MediaService } from "@/lib/core/media/media-service";
import { SenderService } from "@/lib/core/services/sender-service"; // Import class
// import { sseManager } from "@/lib/core/sse-manager"; // Tạm comment nếu chưa dùng
import { NormalizedContent, MediaType } from "@/lib/types/zalo.types";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

interface SendMediaParams {
  api: API;
  botId: string;
  threadId: string;
  conversationId: string;
  file: Buffer;
  type: MediaType;
  metadata: any;
  staffId: string;
}

export class MediaHandlerService {
  private static instance: MediaHandlerService;

  public static getInstance(): MediaHandlerService {
    if (!MediaHandlerService.instance) {
      MediaHandlerService.instance = new MediaHandlerService();
    }
    return MediaHandlerService.instance;
  }

  public async processSendMedia({
    api,
    botId,
    threadId,
    conversationId,
    file,
    type,
    metadata,
    staffId,
  }: SendMediaParams) {
    const tempUuid = uuidv4();
    const startTime = Date.now();
    let filePathToDelete: string | null = null;

    console.log(
      `[MediaHandler] Start: ${type} -> Thread ${threadId} (Conv: ${conversationId})`,
    );

    try {
      // --- STEP 1: PLACEHOLDER ---
      const placeholderContent: NormalizedContent = {
        type: type as any,
        data: {
          ...metadata,
          url: "",
          status: "uploading",
        },
      };

      await supabase.from("messages").insert({
        id: tempUuid,
        conversation_id: conversationId,
        sender_identity_id: botId,
        staff_id: staffId,
        sender_type: "bot",
        content: placeholderContent,
        status: "sending",
        is_self: true,
        listening_bot_ids: [botId],
        sent_at: new Date().toISOString(),
      });

      // --- STEP 2: PROCESS MEDIA ---
      const mediaService = MediaService.getInstance();

      const mediaResult = await mediaService.processMedia(api, type, file, {
        ...metadata,
        threadId,
      });

      if ((mediaResult as any).filePath) {
        filePathToDelete = (mediaResult as any).filePath;
      }

      // --- STEP 3: SEND MESSAGE ---
      const sender = SenderService.getInstance();
      sender.setApi(api, botId);

      const contentToSend: NormalizedContent = {
        type: type as any,
        data: {
          ...mediaResult,
          caption: metadata.caption || "",
        },
      };

      // [FIXED] sendMediaDirect giờ trả về SentMessageResult (có msgId)
      const sentResult = await sender.sendMediaDirect(threadId, contentToSend);
      console.log(`[MediaHandler] Send Success. MsgID: ${sentResult.msgId}`);

      // --- STEP 4: UPDATE DB ---
      const finalContent = {
        ...contentToSend,
        data: {
          ...contentToSend.data,
          url: mediaResult.url, // Ensure URL exists
        },
      };

      await supabase
        .from("messages")
        .update({
          zalo_msg_id: sentResult.msgId, // [FIXED]
          content: finalContent,
          status: "sent",
          sent_at: new Date(Number(sentResult.ts || Date.now())).toISOString(), // [FIXED]
        })
        .eq("id", tempUuid);

      await supabase
        .from("conversations")
        .update({
          last_activity_at: new Date().toISOString(),
          last_message: finalContent,
        })
        .eq("id", conversationId);

      return { success: true, data: sentResult };
    } catch (error: any) {
      console.error("[MediaHandler] Failed:", error);
      await supabase
        .from("messages")
        .update({
          status: "failed",
          flags: { error: error.message },
        })
        .eq("id", tempUuid);
      throw error;
    } finally {
      if (filePathToDelete && fs.existsSync(filePathToDelete)) {
        try {
          await fs.promises.unlink(filePathToDelete);
        } catch (e) {
          console.error("Cleanup error:", e);
        }
      }
    }
  }
}
