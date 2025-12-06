/**
 * lib/actions/chat.actions.ts
 * [SERVER ACTIONS - V2]
 * Logic giao tiếp UI <-> DB/API cho Chat.
 * Updated: Tương thích với Consolidated Database v2.0.
 */

"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ThreadInfo, ThreadType } from "@/lib/types/zalo.types";
import supabase from "@/lib/supabaseServer";
import { SenderService } from "@/lib/core/services/sender-service";
import { ConversationService } from "@/lib/core/services/conversation-service";

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
 * Logic: Lấy các conversation mà botId này có trong bảng mapping.
 * Sắp xếp theo: last_activity_at (mới nhất lên đầu).
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

    // 2. Query bảng conversations chi tiết, sắp xếp theo thời gian hoạt động
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds)
      .order("last_activity_at", { ascending: false });

    if (convError) throw new Error(convError.message);

    // 3. Map về định dạng ThreadInfo cho UI
    const threads: ThreadInfo[] = conversations.map((conv) => ({
      // UI sử dụng global_id (Zalo ID) làm khóa chính để tương tác API
      id: conv.global_id,
      name: conv.name || `Hội thoại ${conv.global_id}`,
      avatar: conv.avatar || "",
      type: conv.type === "group" ? 1 : 0,
      // Thêm thông tin bổ sung nếu cần hiển thị preview
      lastActivity: conv.last_activity_at,
    }));

    return threads;
  } catch (error: unknown) {
    console.error("[ChatAction] getThreadsFromDB Error:", error);
    return [];
  }
}

/**
 * Lấy danh sách hội thoại của Bot.
 * TODO: Trong tương lai nên query từ DB (bảng conversations + mappings) để nhanh hơn.
 * Hiện tại vẫn gọi API Zalo trực tiếp để có dữ liệu real-time nhất cho demo.
 */
export async function getThreadsAction(botId: string): Promise<ThreadInfo[]> {
  if (!botId) return [];

  try {
    const api = getBotAPI(botId);

    // Gọi song song lấy bạn bè và nhóm từ Zalo API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [friends, rawGroupsData]: [any, any] = await Promise.all([
      api.getAllFriends(),
      api.getAllGroups(),
    ]);

    // Map Bạn bè
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const friendThreads: ThreadInfo[] = friends.map((u: any) => ({
      id: u.userId,
      name: u.displayName || u.zaloName || "Unknown",
      avatar: u.avatar,
      type: 0, // User
    }));

    // Map Nhóm
    const groupIds = Object.keys(rawGroupsData.gridVerMap || {});
    const groupThreads: ThreadInfo[] = groupIds.map((gid) => ({
      id: gid,
      name: `Group ${gid.slice(0, 6)}...`, // Tên tạm, chi tiết sẽ load sau
      avatar: "",
      type: 1, // Group
    }));

    // Merge và trả về
    return [...friendThreads, ...groupThreads];
  } catch (error: unknown) {
    console.error("[ChatAction] getThreads Error:", error);
    return [];
  }
}

/**
 * [V2] Lấy lịch sử tin nhắn từ DB Hợp nhất.
 * Logic: Tìm Conversation ID chung thông qua Mapping của Bot.
 */
export async function getMessagesAction(botId: string, threadId: string) {
  // 1. Tìm Conversation ID từ bảng Mapping (zalo_conversation_mappings)
  const { data: mapping } = await supabase
    .from("zalo_conversation_mappings")
    .select("conversation_id")
    .eq("bot_id", botId)
    .eq("external_thread_id", threadId)
    .single();

  if (!mapping) return [];

  // 2. Query Messages thuộc Conversation ID này
  // (Không cần filter bot_id nữa vì messages đã deduplicated,
  // tuy nhiên nếu muốn strict mode chỉ hiện tin nhắn bot này "thấy" thì có thể filter bot_ids @> {botId})
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", mapping.conversation_id)
    .order("sent_at", { ascending: true })
    .limit(50); // Load 50 tin gần nhất

  // 3. Map về format ZaloMessage cho UI
  return (
    messages?.map((msg) => {
      // Cast content an toàn
      const contentObj = msg.content as Record<string, unknown>;
      const msgTypeRaw = msg.msg_type || "text";
      const isSelf = msg.sender_type === "staff_on_bot";

      return {
        type: 0,
        threadId: threadId,
        isSelf: isSelf,
        data: {
          msgId: msg.zalo_msg_id,
          cliMsgId: msg.zalo_msg_id,
          content: contentObj,
          ts: new Date(msg.sent_at).getTime().toString(),
          uidFrom: msg.sender_id,
          dName: "", // Tên người gửi sẽ được UI resolve từ cache
          msgType: msgTypeRaw === "text" ? "webchat" : `chat.${msgTypeRaw}`,
        },
      };
    }) || []
  );
}

/**
 * [V2] Gửi tin nhắn và Lưu DB Hợp nhất
 */
export async function sendMessageAction(
  staffId: string,
  botId: string,
  content: string,
  threadId: string,
  type: ThreadType,
) {
  try {
    const api = getBotAPI(botId);

    // Inject API vào SenderService (nếu chưa có)
    const sender = SenderService.getInstance();
    sender.setApi(api);

    const isGroup = type === ThreadType.Group;

    // 1. Gửi tin nhắn qua Zalo API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await sender.sendText(content, threadId, isGroup);

    // Fallback nếu api không trả msgId ngay lập tức
    const zaloMsgId = result.msgId || result.id || `sent_${Date.now()}`;

    // 2. Đảm bảo Conversation & Mapping tồn tại
    const conversationUUID = await ConversationService.ensureConversation(
      botId,
      threadId,
      isGroup,
      "Unknown Conversation",
    );

    if (conversationUUID) {
      // 3. Lưu tin nhắn vào DB
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationUUID,
        sender_type: "staff_on_bot",
        sender_id: botId,
        staff_id: staffId,
        bot_ids: [botId],
        zalo_msg_id: String(zaloMsgId),
        content: { type: "text", text: content },
        raw_content: result,
        msg_type: "text",
        sent_at: new Date().toISOString(),
      });

      // 4. Update last_activity_at để Conversation nhảy lên đầu list
      await supabase
        .from("conversations")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", conversationUUID);

      if (error)
        console.error(
          "[ChatAction] Failed to save sent message:",
          error.message,
        );
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[ChatAction] Send Error:", err);
    return { success: false, error: err };
  }
}

/**
 * Gửi Sticker
 */
export async function sendStickerAction(
  botId: string,
  stickerId: number,
  cateId: number,
  threadId: string,
  type: ThreadType,
) {
  try {
    const api = getBotAPI(botId);
    await api.sendSticker(
      {
        id: stickerId,
        cateId: cateId,
        type: 1,
      },
      threadId,
      type === ThreadType.Group ? 1 : 0,
    );
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Set Echo State (Placeholder)
 */
export async function setEchoBotStateAction(isEnabled: boolean) {
  console.log("Set Echo State:", isEnabled);
}
