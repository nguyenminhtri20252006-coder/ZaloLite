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

// [NEW] ACTION: UPLOAD MEDIA
/**
 * Upload file từ Client lên Zalo (qua Server Bot).
 * Trả về Metadata để Client gọi tiếp hàm Send.
 */
export async function uploadMediaAction(botId: string, formData: FormData) {
  try {
    const file = formData.get("file") as File;
    // Client gửi type: 'image' | 'video' | 'audio' | 'file'
    const type = formData.get("type") as "image" | "video" | "audio" | "file";

    if (!file || !type) throw new Error("Missing file or type");

    // 1. Convert File -> Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Init Sender
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    if (!api) throw new Error("Bot offline");

    const sender = SenderService.getInstance();
    sender.setApi(api, botId);

    // 3. Upload lên Zalo
    // [LOGIC] Với type='audio', ZCA-JS yêu cầu đúng string 'audio'
    // Hàm sender.uploadMedia sẽ xử lý gọi API uploadAttachment
    const uploadRes = await sender.uploadMedia(type, buffer);

    // Trả về kết quả thô từ Zalo (Client sẽ dùng nó để construct payload gửi)
    return { success: true, data: uploadRes };
  } catch (error: any) {
    console.error("Upload Error:", error);
    return { success: false, error: error.message };
  }
}
/**
 * Lấy danh sách hội thoại từ DB (Thay thế getThreadsFromDBAction cũ)
 * Logic V6: Query bảng conversation_members -> Join conversations
 */
export async function getThreadsFromDBAction(
  botId: string,
): Promise<ThreadInfo[]> {
  if (!botId) return [];

  try {
    // 1. Lấy tất cả hội thoại mà Bot đang tham gia từ conversation_members
    // Cần lấy thread_id (Routing Key) để UI hiển thị đúng ID tương tác
    const { data: members, error: memberError } = await supabase
      .from("conversation_members")
      .select("conversation_id, thread_id")
      .eq("identity_id", botId);

    if (memberError) throw new Error(memberError.message);
    if (!members || members.length === 0) return [];

    const convIds = members.map((m) => m.conversation_id);
    const threadMap = new Map(
      members.map((m) => [m.conversation_id, m.thread_id]),
    );

    // 2. Lấy thông tin chi tiết hội thoại
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convIds)
      .order("last_activity_at", { ascending: false });

    if (convError) throw new Error(convError.message);

    // 3. Map về ThreadInfo cho UI
    return conversations.map((conv) => {
      // Logic ID hiển thị:
      // - Nếu Group: Dùng global_group_id (System ID)
      // - Nếu Private: Dùng thread_id riêng của Bot (để Bot biết reply cho ai)
      // Fallback: Dùng thread_id trong mapping
      const displayId =
        conv.type === "group"
          ? conv.global_group_id || threadMap.get(conv.id)
          : threadMap.get(conv.id);

      return {
        id: displayId || conv.id,
        uuid: conv.id,
        name: conv.name || `Hội thoại ${displayId}`,
        avatar: conv.avatar || "",
        type: conv.type === "group" ? 1 : 0,
        lastActivity: conv.last_activity_at,
        // [NEW] Map snippet từ cột last_message (JSONB)
        lastMessage: conv.last_message as NormalizedContent,
        unreadCount: 0, // TODO: Implement unread count logic later
      };
    });
  } catch (error: unknown) {
    console.error("[ChatAction] getThreadsFromDB Error:", error);
    return [];
  }
}

/**
 * Lấy lịch sử tin nhắn (Hỗ trợ Pagination & Isolation)
 * [CRITICAL] Logic Filter: Chỉ hiện tin của Customer HOẶC tin do chính Bot này/Staff gửi qua Bot này.
 */
export async function getMessagesAction(
  botId: string,
  threadId: string,
  beforeTimeStamp?: string,
  limit = 20,
) {
  // 1. Resolve Conversation UUID
  // Tìm trong conversations (nếu threadId là global_id) HOẶC conversation_members (nếu là local thread_id)
  let conversationId: string | null = null;

  // Thử tìm theo Global Group ID trước
  const { data: convByGlobal } = await supabase
    .from("conversations")
    .select("id")
    .eq("global_group_id", threadId)
    .single();

  if (convByGlobal) {
    conversationId = convByGlobal.id;
  } else {
    // Nếu không, tìm trong members của Bot này (Private chat thường dùng case này)
    const { data: member } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", botId)
      .eq("thread_id", threadId)
      .single();
    if (member) conversationId = member.conversation_id;
  }

  if (!conversationId) return [];

  // 2. Query Messages (Kèm Filter Isolation)
  let query = supabase
    .from("messages")
    .select(
      `
      *,
      staff_accounts:staff_id (full_name, avatar),
      sender_identity:zalo_identities!sender_id (id, name, display_name, avatar, type)
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

  // [CLIENT-SIDE FILTERING]
  const filteredMessages = messages.filter((msg) => {
    // Luôn hiện tin khách hàng
    if (msg.sender_type === "customer") return true;
    if (msg.sender_type === "bot") {
      return msg.sender_id === botId;
    }
    if (msg.sender_type === "staff") {
      return msg.bot_send_id === botId;
    }
    return true;
  });

  // [IMPORTANT] Trả về Raw Data đảo ngược (cũ nhất -> mới nhất) để UI dễ render danh sách
  // Frontend sẽ tự xử lý việc hiển thị UI
  return filteredMessages.reverse();
}

/**
 * Gửi tin nhắn từ Dashboard (Staff)
 * [V6] Sử dụng SenderService và NormalizedContent
 */
export async function sendMessageAction(
  staffId: string,
  botId: string,
  content: NormalizedContent, // Updated to use NormalizedContent
  threadId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type: ThreadType, // Legacy parameter, kept for compatibility but logic relies on DB
) {
  try {
    // 1. Check Permission
    const hasPermission = await checkBotPermission(staffId, botId, "chat");
    if (!hasPermission) {
      throw new Error("Bạn không có quyền gửi tin nhắn trên Bot này.");
    }

    // 2. Resolve Conversation UUID from threadId & botId
    // Tìm hội thoại mà Bot đang tham gia với routing key là threadId
    const { data: member } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("identity_id", botId)
      .eq("thread_id", threadId)
      .single();

    // Fallback: Nếu threadId là global_id của nhóm
    let conversationId = member?.conversation_id;
    if (!conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("global_group_id", threadId)
        .single();
      if (conv) conversationId = conv.id;
    }

    if (!conversationId) {
      throw new Error(
        `Không tìm thấy hội thoại (ThreadID: ${threadId}). Vui lòng F5 hoặc sync lại.`,
      );
    }

    // 3. Init Sender Service
    const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    if (!api) throw new Error("Bot is offline.");

    const sender = SenderService.getInstance();
    sender.setApi(api, botId);

    // 4. Send & Self-Sync
    // SenderService sẽ tự động: Upload Media (nếu cần logic mở rộng) -> Send API -> Insert DB
    // Lưu ý: StaffId được truyền vào để audit log
    const result = await sender.sendMessage(conversationId, content, staffId);

    return { success: true, data: result };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[ChatAction] Send Error:", err);
    return { success: false, error: err };
  }
}
