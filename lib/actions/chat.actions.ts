/**
 * lib/actions/chat.actions.ts
 * [SERVER ACTIONS - V3.7 FIX]
 * - Added 'beforeTimeStamp' for pagination.
 * - [CRITICAL FIX] Filter messages: Show Customer OR Current Bot only. Hide other Bots.
 */

"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ThreadInfo, ThreadType } from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer";
import { SenderService } from "@/lib/core/services/sender-service";
import { checkBotPermission } from "@/lib/actions/staff.actions";

function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`Lỗi Bot (${botId}): ${err}`);
  }
}

export async function getThreadsFromDBAction(
  botId: string,
): Promise<ThreadInfo[]> {
  if (!botId) return [];

  try {
    const { data: mappings, error: mapError } = await supabase
      .from("zalo_conversation_mappings")
      .select("conversation_id")
      .eq("bot_id", botId);

    if (mapError) throw new Error(mapError.message);
    if (!mappings || mappings.length === 0) return [];

    const conversationIds = mappings.map((m) => m.conversation_id);

    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds)
      .order("last_activity_at", { ascending: false });

    if (convError) throw new Error(convError.message);

    return conversations.map((conv) => ({
      id: conv.global_id,
      uuid: conv.id,
      name: conv.name || `Hội thoại ${conv.global_id}`,
      avatar: conv.avatar || "",
      type: conv.type === "group" ? 1 : 0,
      lastActivity: conv.last_activity_at,
    }));
  } catch (error: unknown) {
    console.error("[ChatAction] getThreadsFromDB Error:", error);
    return [];
  }
}

/**
 * Lấy lịch sử tin nhắn (Hỗ trợ Pagination & Isolation)
 */
export async function getMessagesAction(
  botId: string,
  threadId: string,
  beforeTimeStamp?: string,
) {
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("global_id", threadId)
    .single();

  if (!conv) return [];

  // 2. Query Messages
  let query = supabase
    .from("messages")
    .select(
      `
      *,
      staff_accounts:staff_id (full_name, avatar),
      zalo_bots:bot_send_id (name, avatar),
      customers:customer_send_id (display_name, avatar)
    `,
    )
    .eq("conversation_id", conv.id)
    .order("sent_at", { ascending: false })
    .limit(20);

  // [LOGIC ISOLATION]
  // Chỉ lấy tin nhắn: (Là của Customer) HOẶC (Là của Bot này gửi)
  // Logic này giúp ẩn tin nhắn của Bot B khi đang xem ở giao diện Bot A
  // Cú pháp 'or' của Supabase: sender_type.eq.customer,bot_send_id.eq.{botId}
  // Tuy nhiên, do cấu trúc OR phức tạp với các điều kiện khác, ta dùng bộ lọc cơ bản rồi filter ở code JS
  // hoặc dùng cú pháp .or(`sender_type.eq.customer,bot_send_id.eq.${botId}`)

  // Áp dụng filter context:
  query = query.or(
    `sender_type.eq.customer,bot_send_id.eq.${botId},sender_type.eq.staff`,
  );
  // Lưu ý: sender_type=staff thường đi kèm bot_send_id. Nếu staff gửi qua bot khác thì cũng nên ẩn.
  // Nhưng để an toàn ta cứ lấy về rồi filter ở dưới nếu query OR phức tạp.

  if (beforeTimeStamp) {
    query = query.lt("sent_at", beforeTimeStamp);
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  // [CLIENT-SIDE FILTERING - DOUBLE CHECK]
  // Đảm bảo tuyệt đối không lộ tin nhắn của bot khác
  const filteredMessages = messages.filter((msg) => {
    if (msg.sender_type === "bot" || msg.sender_type === "staff") {
      // Chỉ hiện nếu bot_send_id trùng với bot hiện tại
      // Hoặc nếu bot_send_id null (tin hệ thống chung)
      return msg.bot_send_id === botId || !msg.bot_send_id;
    }
    return true; // Customer & Other luôn hiện
  });

  const sortedMessages = filteredMessages.reverse();

  return (
    sortedMessages.map((msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentObj = msg.content as Record<string, unknown>;
      const msgTypeRaw = msg.msg_type || "text";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawData = (msg.raw_content as any)?.data || {};

      const extendedInfo = {
        senderType: msg.sender_type,
        botSendId: msg.bot_send_id,
        staffInfo: msg.staff_accounts
          ? {
              name: msg.staff_accounts.full_name,
              avatar: msg.staff_accounts.avatar,
            }
          : null,
        botInfo: msg.zalo_bots
          ? { name: msg.zalo_bots.name, avatar: msg.zalo_bots.avatar }
          : null,
        customerInfo: msg.customers
          ? { name: msg.customers.display_name, avatar: msg.customers.avatar }
          : null,
      };

      return {
        type: 0,
        threadId: threadId,
        isSelf: false,
        data: {
          msgId: msg.zalo_msg_id,
          cliMsgId: msg.zalo_msg_id,
          content: contentObj,
          ts: new Date(msg.sent_at).getTime().toString(),
          uidFrom:
            msg.sender_type === "customer"
              ? msg.customer_send_id || msg.sender_id
              : msg.bot_send_id || msg.sender_id,

          dName: rawData.dName || "",
          msgType: msgTypeRaw === "text" ? "webchat" : `chat.${msgTypeRaw}`,
          ...extendedInfo,
        },
      };
    }) || []
  );
}

export async function sendMessageAction(
  staffId: string,
  botId: string,
  content: string,
  threadId: string,
  type: ThreadType,
) {
  try {
    const hasPermission = await checkBotPermission(staffId, botId, "chat");
    if (!hasPermission) {
      throw new Error("Bạn không có quyền gửi tin nhắn trên Bot này.");
    }

    console.log(`[ChatAction] Request Send: ${content} -> ${threadId} (Hash)`);

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

    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    const sender = SenderService.getInstance();
    sender.setApi(api);

    const zaloRes = await sender.sendText(
      content,
      numericThreadId,
      type === ThreadType.Group,
    );
    const actualMsgId = zaloRes?.message?.msgId || `local_${Date.now()}`;

    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conv.id,
      zalo_msg_id: actualMsgId,
      sender_type: "staff",
      staff_id: staffId,
      bot_send_id: botId,
      customer_send_id: null,
      content: { type: "text", text: content },
      raw_content: { data: zaloRes || {} },
      msg_type: "text",
      sent_at: new Date().toISOString(),
    });

    if (insertError) console.error("DB Insert Error:", insertError);

    await supabase
      .from("conversations")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", conv.id);

    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[ChatAction] Send Error:", err);
    return { success: false, error: err };
  }
}

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
