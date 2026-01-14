/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * lib/core/listeners/handlers/interaction-handler.ts
 * [VERSION 16.1 - FIX DATA EXTRACTION]
 * - Fix: Correctly extract target IDs from `event.data.content` (nested structure).
 * - Logic: Use `cliMsgId` as the primary key for mapping (Stable across devices).
 * - Optimization: Scoped search via Conversation ID.
 */

import supabase from "@/lib/supabaseServer";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1500, 3000];

export class InteractionHandler {
  /**
   * Xử lý sự kiện Undo (Thu hồi tin nhắn)
   * @param event Dữ liệu thô từ socket
   * @param botId ID của Bot nhận được sự kiện
   */
  public async handleUndo(event: any, botId: string) {
    try {
      // --- 1. ROBUST DATA EXTRACTION ---
      // Log cho thấy cấu trúc: { data: { content: { globalMsgId, cliMsgId }, ... }, threadId: "..." }

      const rawData = event.data || event;
      const content = rawData.content || {};

      // [CRITICAL] Extract Target IDs from nested content
      // Chuyển sang String vì JSONB query và DB đều lưu dạng string
      const targetGlobalId = content.globalMsgId
        ? String(content.globalMsgId)
        : "";
      const targetCliMsgId = content.cliMsgId ? String(content.cliMsgId) : "";

      // Extract Thread Hint (ưu tiên lấy từ root event nếu có)
      const threadId =
        event.threadId ||
        rawData.groupId ||
        rawData.sourceId ||
        rawData.uidFrom ||
        rawData.idTo;

      // [DEBUG LOG] In chi tiết ID trích xuất được để kiểm tra
      console.log(
        `[InteractionHandler] 📥 Undo Payload | Global: "${targetGlobalId}" | Cli: "${targetCliMsgId}" | Thread: "${threadId}"`,
      );

      if (!targetGlobalId && !targetCliMsgId) {
        console.warn(
          `[InteractionHandler] ⚠️ ABORT: Cannot find target IDs in event content.`,
          JSON.stringify(content),
        );
        return;
      }

      // --- 2. RESOLVE CONVERSATION SCOPE ---
      // Mục đích: Lấy conversation_id để query DB nhanh hơn (tận dụng index)
      let conversationId: string | null = null;
      if (threadId) {
        conversationId = await this.resolveConversationId(botId, threadId);
        if (conversationId) {
          // console.log(`[InteractionHandler] 🎯 Scope Resolved: ${conversationId}`);
        } else {
          console.warn(
            `[InteractionHandler] ⚠️ Scope Warning: Conversation not found for thread ${threadId}`,
          );
        }
      }

      // --- 3. RETRY LOOP (RACE CONDITION GUARD) ---
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const success = await this.attemptRecall(
          targetGlobalId,
          targetCliMsgId,
          conversationId,
        );

        if (success) {
          console.log(
            `[InteractionHandler] ✅ Recalled successfully at attempt ${
              attempt + 1
            }`,
          );
          return;
        }

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt];
          console.log(
            `[InteractionHandler] ⏳ Msg not found, retrying in ${delay}ms... (Attempt ${
              attempt + 1
            }/${MAX_RETRIES})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      console.error(
        `[InteractionHandler] ❌ FAILED to recall msg after ${
          MAX_RETRIES + 1
        } attempts.`,
      );
    } catch (e: any) {
      console.error(`[InteractionHandler] Error in handleUndo:`, e);
    }
  }

  /**
   * Tìm Conversation ID dựa trên Thread ID
   */
  private async resolveConversationId(
    botId: string,
    threadId: string,
  ): Promise<string | null> {
    const { data } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", botId)
      .eq("thread_id", String(threadId))
      .single();
    return data?.conversation_id || null;
  }

  /**
   * Logic tìm và update DB
   * Ưu tiên tìm bằng GlobalID, backup bằng ClientID (Deep Search)
   */
  private async attemptRecall(
    targetGlobalId: string,
    targetCliId: string,
    conversationId: string | null,
  ): Promise<boolean> {
    let messageIdToUpdate: string | null = null;
    let currentFlags: any = {};

    // A. Query chuẩn bị
    let query = supabase.from("messages").select("id, flags");
    if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    }

    // B. Chiến lược tìm kiếm
    // [Strategy 1] Tìm bằng Global ID (Nhanh nhất nếu có)
    if (targetGlobalId && targetGlobalId !== "0") {
      const { data } = await query
        .eq("zalo_msg_id", targetGlobalId)
        .maybeSingle();
      if (data) {
        messageIdToUpdate = data.id;
        currentFlags = data.flags;
        // console.log(`[InteractionHandler] -> Found by GlobalID`);
      }
    }

    // [Strategy 2] Tìm bằng Client ID (Quan trọng cho Zalo Mobile/Webchat)
    // Nếu Strategy 1 fail VÀ có Client ID
    if (!messageIdToUpdate && targetCliId && targetCliId !== "0") {
      // Reset query builder (vì query object cũ đã mutate)
      let deepQuery = supabase.from("messages").select("id, flags");
      if (conversationId)
        deepQuery = deepQuery.eq("conversation_id", conversationId);

      // Cú pháp tìm trong JSONB: content ->> 'cliMsgId'
      const { data } = await deepQuery
        .eq("content->>cliMsgId", targetCliId)
        .limit(1)
        .maybeSingle();

      if (data) {
        messageIdToUpdate = data.id;
        currentFlags = data.flags;
        console.log(
          `[InteractionHandler] -> Found by Deep Lookup (content->>cliMsgId)`,
        );
      }
    }

    // C. Thực hiện Update
    if (messageIdToUpdate) {
      if (currentFlags?.is_undo) {
        // console.log(`[InteractionHandler] -> Msg already undone.`);
        return true;
      }

      const newFlags = {
        ...currentFlags,
        is_undo: true,
        undo_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("messages")
        .update({
          flags: newFlags,
          // Optional: Update content text for immediate security
          // content: { ...existingContent, text: "Tin nhắn đã thu hồi" }
        })
        .eq("id", messageIdToUpdate);

      if (error) {
        console.error(`[InteractionHandler] DB Update Error: ${error.message}`);
        return false;
      }

      return true;
    }

    return false;
  }

  public async handleReaction(event: any, botId: string) {
    // console.log(`[InteractionHandler] ❤️ Reaction on Bot ${botId}`, JSON.stringify(event));
  }
}
