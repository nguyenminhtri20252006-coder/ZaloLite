/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import supabase from "@/lib/supabaseServer";
import { SenderService } from "@/lib/core/services/sender-service";
import {
  NormalizedContent,
  ThreadInfo,
  ThreadType,
} from "@/lib/types/zalo.types";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { checkBotPermission } from "@/lib/actions/staff.actions";

// --- HELPERS ---

/**
 * Helper: Resolve Identity ID chuẩn từ Input ID (Hỗ trợ bot_info_id hoặc identity_id)
 */

export async function resolveBotIdentityId(inputId: string): Promise<string> {
  // Thử tìm xem inputId có phải là ref_bot_id không
  const { data: identity } = await supabase
    .from("zalo_identities")
    .select("id")
    .eq("ref_bot_id", inputId)
    .eq("type", "system_bot")
    .maybeSingle();

  if (identity) {
    return identity.id;
  }
  // Nếu không tìm thấy mapping, giả định inputId chính là identity_id
  return inputId;
}

export async function uploadMediaAction(botId: string, formData: FormData) {
  try {
    const file = formData.get("file") as File;
    const type = formData.get("type") as "image" | "video" | "audio" | "file";
    if (!file || !type) throw new Error("Missing file or type");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Resolve ID để đảm bảo gọi đúng instance bot
    const targetIdentityId = await resolveBotIdentityId(botId);

    const api = await BotRuntimeManager.getInstance().getBotAPI(
      targetIdentityId,
    );
    if (!api) throw new Error("Bot offline");

    const sender = SenderService.getInstance();
    sender.setApi(api, targetIdentityId);

    const uploadRes = await sender.uploadMedia(type, buffer);
    return { success: true, data: uploadRes };
  } catch (error: any) {
    console.error("Upload Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * [CORE] Lấy danh sách hội thoại từ DB
 * LOGIC MỚI: Resolve ID trước -> Query 1 lần duy nhất -> Log gọn gàng
 */
export async function getThreadsFromDBAction(
  botId: string,
): Promise<ThreadInfo[]> {
  if (!botId) return [];

  try {
    // 1. Resolve ID chuẩn xác ngay từ đầu
    const targetIdentityId = await resolveBotIdentityId(botId);

    // Chỉ log 1 dòng debug gọn gàng
    // console.log(`[DEBUG-THREAD] Fetching threads for Identity: ${targetIdentityId} (Input: ${botId})`);

    // 2. Query Members trực tiếp với ID chuẩn
    const { data: members, error: memberError } = await supabase
      .from("conversation_members")
      .select("conversation_id, thread_id, settings")
      .eq("identity_id", targetIdentityId);

    if (memberError) throw new Error(memberError.message);

    // Nếu không có member -> Return rỗng ngay, không cần warn (vì có thể bot mới chưa có chat)
    if (!members || members.length === 0) {
      return [];
    }

    const convIds = members.map((m) => m.conversation_id);
    const memberMap = new Map(members.map((m) => [m.conversation_id, m]));

    // 3. Query Conversations
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convIds)
      .order("last_activity_at", { ascending: false });

    if (convError) throw new Error(convError.message);

    // 4. Mapping & Formatting
    const results: ThreadInfo[] = conversations.map((conv) => {
      const memberInfo = memberMap.get(conv.id);
      const routingId = memberInfo?.thread_id;
      const displayId = routingId || conv.global_group_id || conv.id;
      const settings = (memberInfo?.settings as any) || {};

      const threadType = (conv.type === "group" ? 1 : 0) as ThreadType;
      const lastMsg = (conv.last_message ? conv.last_message : undefined) as
        | NormalizedContent
        | undefined;

      return {
        uuid: conv.id,
        id: displayId,
        name: conv.name || `Hội thoại ${displayId}`,
        avatar: conv.avatar || "",
        type: threadType,
        lastActivity: conv.last_activity_at,
        lastMessage: lastMsg,
        unreadCount: 0,
        isPinned: !!settings.pinned,
        isHidden: !!settings.hidden,
      };
    });

    return results;
  } catch (error: unknown) {
    console.error("[ChatAction] getThreadsFromDB Error:", error);
    return [];
  }
}

/**
 * [CORE] Get Single Thread (Dùng cho Realtime Insert)
 */
export async function getSingleThreadAction(
  botId: string,
  convUuid: string,
): Promise<ThreadInfo | null> {
  try {
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", convUuid)
      .single();
    if (!conv) return null;

    const targetIdentityId = await resolveBotIdentityId(botId);

    const { data: member } = await supabase
      .from("conversation_members")
      .select("thread_id, settings")
      .eq("conversation_id", convUuid)
      .eq("identity_id", targetIdentityId)
      .single();

    const routingId = member?.thread_id;
    const displayId = routingId || conv.global_group_id || conv.id;
    const settings = (member?.settings as any) || {};

    const threadType = (conv.type === "group" ? 1 : 0) as ThreadType;
    const lastMsg = (conv.last_message ? conv.last_message : undefined) as
      | NormalizedContent
      | undefined;

    return {
      uuid: conv.id,
      id: displayId,
      name: conv.name || "Unknown",
      avatar: conv.avatar || "",
      type: threadType,
      lastActivity: conv.last_activity_at,
      lastMessage: lastMsg,
      unreadCount: 0,
      isPinned: !!settings.pinned,
      isHidden: !!settings.hidden,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Lấy lịch sử tin nhắn
 */
export async function getMessagesAction(
  botId: string,
  threadUuid: string,
  beforeTimeStamp?: string,
  limit = 20,
) {
  let conversationId = threadUuid;

  // Resolve ID Bot trước khi xử lý logic tìm conversation
  const targetIdentityId = await resolveBotIdentityId(botId);

  // Validate UUID format
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      threadUuid,
    );

  if (!isUuid) {
    const { data: member } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", targetIdentityId)
      .eq("thread_id", threadUuid)
      .single();

    if (member) conversationId = member.conversation_id;
    else {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("global_group_id", threadUuid)
        .single();
      if (conv) conversationId = conv.id;
      else return [];
    }
  }

  let query = supabase
    .from("messages")
    .select(
      `
      *,
      staff_accounts:staff_id (full_name, avatar),
      sender_identity:sender_identity_id (
          id, 
          name:root_name, 
          display_name:root_name, 
          avatar, 
          type
      )
    `,
    )
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (beforeTimeStamp) {
    query = query.lt("sent_at", beforeTimeStamp);
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return messages.reverse();
}

/**
 * Gửi tin nhắn
 */
export async function sendMessageAction(
  staffId: string,
  botId: string,
  content: NormalizedContent,
  threadUuid: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type: ThreadType,
) {
  try {
    const hasPermission = await checkBotPermission(staffId, botId, "chat");
    if (!hasPermission) throw new Error("No Permission");

    const targetIdentityId = await resolveBotIdentityId(botId);

    let conversationId = threadUuid;

    // Check permission member trong hội thoại
    const { data: member } = await supabase
      .from("conversation_members")
      .select("conversation_id, thread_id")
      .eq("identity_id", targetIdentityId)
      .eq("conversation_id", threadUuid)
      .single();

    if (member && member.thread_id) {
      conversationId = member.conversation_id;
    } else {
      throw new Error(
        "Bot không tìm thấy đường dẫn (thread_id). Vui lòng Sync lại.",
      );
    }

    const api = await BotRuntimeManager.getInstance().getBotAPI(
      targetIdentityId,
    );
    if (!api) {
      // Fallback try original ID if resolved failed or manager uses info ID
      const apiFallback = await BotRuntimeManager.getInstance().getBotAPI(
        botId,
      );
      if (!apiFallback) throw new Error("Bot offline");
      const sender = SenderService.getInstance();
      sender.setApi(apiFallback, botId);
      const result = await sender.sendMessage(conversationId, content, staffId);
      return { success: true, data: result };
    }

    const sender = SenderService.getInstance();
    sender.setApi(api, targetIdentityId);

    // 3. Send
    const result = await sender.sendMessage(conversationId, content, staffId);

    return { success: true, data: result };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[ChatAction] Send Error:", err);
    return { success: false, error: err };
  }
}
