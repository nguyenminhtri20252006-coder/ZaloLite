/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE]
 * Quản lý logic tìm/tạo Customer và Conversation trong DB.
 * Dùng chung cho cả MessagePipeline (Inbound) và ChatAction (Outbound).
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
    fallbackName: string = "New Conversation",
  ): Promise<string | null> {
    // 1. Kiểm tra Mapping xem đã có Conversation này chưa
    const { data: mapping } = await supabase
      .from("zalo_conversation_mappings")
      .select("conversation_id")
      .eq("bot_id", botId)
      .eq("external_id", threadId)
      .single();

    if (mapping) return mapping.conversation_id;

    console.log(
      `[ConvService] Creating new conversation for thread ${threadId}`,
    );

    // 2. Nếu chưa có -> Tạo Conversation mới
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        type: isGroup ? "group" : "user",
        // Có thể lưu metadata ban đầu nếu cần
        metadata: { name: fallbackName },
      })
      .select("id")
      .single();

    if (convError || !newConv) {
      console.error("[ConvService] Create Conversation Error:", convError);
      return null;
    }

    // 3. Tạo Mapping để lần sau tìm thấy
    await supabase.from("zalo_conversation_mappings").insert({
      bot_id: botId,
      conversation_id: newConv.id,
      external_id: threadId,
    });

    return newConv.id;
  }

  /**
   * Tìm hoặc Tạo Customer (cho trường hợp nhắn tin 1-1)
   */
  static async ensureCustomer(
    botId: string,
    zaloUserId: string,
    displayName: string,
  ): Promise<string | null> {
    // 1. Check Mapping
    const { data: mapping } = await supabase
      .from("zalo_customer_mappings")
      .select("customer_id")
      .eq("bot_id", botId)
      .eq("external_id", zaloUserId)
      .single();

    if (mapping) return mapping.customer_id;

    // 2. Create Customer
    const { data: newCust, error } = await supabase
      .from("customers")
      .insert({
        display_name: displayName,
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
