/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE]
 * Quản lý logic tìm/tạo Customer và Conversation trong DB.
 * [FIX] Lưu Avatar vào JSONB (metadata/payload).
 * [FIX] Logic cập nhật tên nhóm an toàn.
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  /**
   * Tìm hoặc Tạo Conversation từ Zalo Thread ID
   */
  static async ensureConversation(
    botId: string,
    threadId: string,
    isGroup: boolean,
    displayName: string,
    avatar: string = "",
  ): Promise<string | null> {
    // 1. Kiểm tra Mapping
    const { data: mapping } = await supabase
      .from("zalo_conversation_mappings")
      .select("conversation_id, conversations(metadata)")
      .eq("bot_id", botId)
      .eq("external_id", threadId)
      .single();

    // Nếu đã tồn tại
    if (mapping) {
      // [OPTIONAL] Nếu là User (Chat 1-1), ta có thể update Avatar mới nhất nếu có thay đổi
      // Nhưng với Group, ta KHÔNG update tên ở đây vì 'displayName' truyền vào là tên tạm.
      return mapping.conversation_id;
    }

    console.log(`[ConvService] New conversation: ${threadId} (${displayName})`);

    // 2. Nếu chưa có -> Tạo Conversation mới
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        type: isGroup ? "group" : "user",
        metadata: {
          name: displayName,
          avatar: avatar,
        },
      })
      .select("id")
      .single();

    if (convError || !newConv) {
      console.error("[ConvService] Create Conversation Error:", convError);
      return null;
    }

    // 3. Tạo Mapping
    await supabase.from("zalo_conversation_mappings").insert({
      bot_id: botId,
      conversation_id: newConv.id,
      external_id: threadId,
    });

    return newConv.id;
  }

  /**
   * Tìm hoặc Tạo Customer (cho trường hợp nhắn tin 1-1 hoặc thành viên nhóm)
   */
  static async ensureCustomer(
    botId: string,
    zaloUserId: string,
    displayName: string,
    avatar: string = "",
  ): Promise<string | null> {
    // 1. Check Mapping
    const { data: mapping } = await supabase
      .from("zalo_customer_mappings")
      .select("customer_id")
      .eq("bot_id", botId)
      .eq("external_id", zaloUserId)
      .single();

    if (mapping) {
      // TODO: Có thể update avatar vào payload nếu cần thiết (cập nhật thông tin khách hàng)
      return mapping.customer_id;
    }

    // 2. Create Customer
    // Lưu ý: Bảng customers không có cột avatar, ta lưu vào payload
    const { data: newCust, error } = await supabase
      .from("customers")
      .insert({
        display_name: displayName,
        payload: {
          avatar: avatar,
          zalo_uid: zaloUserId,
        },
      })
      .select("id")
      .single();

    if (error || !newCust) {
      console.error("[ConvService] Create Customer Error:", error);
      return null;
    }

    // 3. Create Mapping
    await supabase.from("zalo_customer_mappings").insert({
      bot_id: botId,
      customer_id: newCust.id,
      external_id: zaloUserId,
    });

    return newCust.id;
  }
}
