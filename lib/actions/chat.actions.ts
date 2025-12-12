/**
 * lib/actions/chat.actions.ts
 * [SERVER ACTIONS - V3.1 FIX]
 * Logic: Gửi tin nhắn với cơ chế Reverse Lookup (Hash -> Numeric).
 */

"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ThreadInfo, ThreadType } from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer";
import { SenderService } from "@/lib/core/services/sender-service";
import { checkBotPermission } from "@/lib/actions/staff.actions";

/**
 * Helper: Lấy API của Bot và xử lý lỗi chung
 */
function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`Lỗi Bot (${botId}): ${err}`);
  }
}

/**
 * [NEW] Lấy danh sách hội thoại từ Database (Unified Architecture).
 */
export async function getThreadsFromDBAction(
  botId: string,
): Promise<ThreadInfo[]> {
  if (!botId) return [];

  try {
    // 1. Lấy danh sách Conversation UUID mà bot này tham gia
    const { data: mappings, error: mapError } = await supabase
      .from("zalo_conversation_mappings")
      .select("conversation_id")
      .eq("bot_id", botId);

    if (mapError) throw new Error(mapError.message);
    if (!mappings || mappings.length === 0) return [];

    const conversationIds = mappings.map((m) => m.conversation_id);

    // 2. Query bảng conversations chi tiết
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds)
      .order("last_activity_at", { ascending: false });

    if (convError) throw new Error(convError.message);

    // [UPDATE] Map thêm id (UUID) vào field 'uuid'
    const threads: ThreadInfo[] = conversations.map((conv) => ({
      id: conv.global_id,
      uuid: conv.id,
      name: conv.name || `Hội thoại ${conv.global_id}`,
      avatar: conv.avatar || "",
      type: conv.type === "group" ? 1 : 0,
      lastActivity: conv.last_activity_at,
    }));

    return threads;
  } catch (error: unknown) {
    console.error("[ChatAction] getThreadsFromDB Error:", error);
    return [];
  }
}

/**
 * Lấy lịch sử tin nhắn
 */
export async function getMessagesAction(botId: string, threadId: string) {
  // threadId ở đây là Global Hash ID (từ UI)

  // 1. Tìm Conversation ID (UUID) từ bảng conversations
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("global_id", threadId)
    .single();

  if (!conv) return [];

  // 2. Query Messages
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("sent_at", { ascending: true })
    .limit(50);

  return (
    messages?.map((msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentObj = msg.content as Record<string, unknown>;
      const msgTypeRaw = msg.msg_type || "text";
      const isSelf = msg.sender_type === "staff_on_bot";

      // Lấy dName từ raw content nếu có (để hiển thị tên người gửi trong nhóm)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawData = (msg.raw_content as any)?.data || {};

      return {
        type: 0,
        threadId: threadId, // Trả về Hash ID cho UI khớp
        isSelf: isSelf,
        data: {
          msgId: msg.zalo_msg_id,
          cliMsgId: msg.zalo_msg_id,
          content: contentObj,
          ts: new Date(msg.sent_at).getTime().toString(),
          uidFrom: msg.sender_id, // UUID của sender
          dName: rawData.dName || "",
          msgType: msgTypeRaw === "text" ? "webchat" : `chat.${msgTypeRaw}`,
        },
      };
    }) || []
  );
}

/**
 * [V3.1 FIX] Gửi tin nhắn với Reverse Lookup
 */
export async function sendMessageAction(
  staffId: string,
  botId: string,
  content: string,
  threadId: string,
  type: ThreadType,
) {
  try {
    // [SECURITY CHECK] Kiểm tra quyền CHAT
    const hasPermission = await checkBotPermission(staffId, botId, "chat");
    if (!hasPermission) {
      throw new Error("Bạn không có quyền gửi tin nhắn trên Bot này.");
    }

    console.log(`[ChatAction] Request Send: ${content} -> ${threadId} (Hash)`);

    // Reverse Lookup
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("global_id", threadId)
      .single();

    if (!conv) throw new Error(`Không tìm thấy hội thoại (Hash: ${threadId}).`);

    const { data: mapping } = await supabase
      .from("zalo_conversation_mappings")
      .select("external_thread_id")
      .eq("conversation_id", conv.id)
      .eq("bot_id", botId)
      .single();

    if (!mapping || !mapping.external_thread_id)
      throw new Error(`Bot chưa map với hội thoại.`);

    const numericThreadId = mapping.external_thread_id;
    console.log(`[ChatAction] Resolved Numeric ID: ${numericThreadId}`);

    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    const sender = SenderService.getInstance();
    sender.setApi(api);

    await sender.sendText(content, numericThreadId, type === ThreadType.Group);

    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[ChatAction] Send Error:", err);
    return { success: false, error: err };
  }
}

// ... (Giữ nguyên sendStickerAction, cần update logic tương tự nếu dùng)
export async function sendStickerAction(
  botId: string,
  stickerId: number,
  cateId: number,
  threadId: string,
  type: ThreadType,
) {
  return { success: false, error: "Not implemented yet" };
}

export async function setEchoBotStateAction(isEnabled: boolean) {
  console.log("Echo:", isEnabled);
}
export async function getThreadsAction(botId: string) {
  return [];
}
