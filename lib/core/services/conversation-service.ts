/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V3.0]
 * Logic: Unified Conversation & Customer Management.
 * [MAJOR UPDATE] Tách biệt Global ID (Hash) và External ID (Numeric).
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  // --- FINDERS (Tìm kiếm Mapping) ---

  /**
   * Tìm Conversation UUID dựa trên External ID (Numeric) của Bot cụ thể.
   * Dùng để check xem Bot này đã biết hội thoại này chưa.
   */
  static async findConversationByExternalId(
    botId: string,
    externalThreadId: string,
  ): Promise<string | null> {
    const { data } = await supabase
      .from("zalo_conversation_mappings")
      .select("conversation_id")
      .eq("bot_id", botId)
      .eq("external_thread_id", externalThreadId)
      .single();

    return data ? data.conversation_id : null;
  }

  /**
   * Tìm Customer UUID dựa trên External ID (Numeric).
   */
  static async findCustomerByExternalId(
    botId: string,
    externalUserId: string,
  ): Promise<string | null> {
    const { data } = await supabase
      .from("zalo_customer_mappings")
      .select("customer_id")
      .eq("bot_id", botId)
      .eq("external_user_id", externalUserId)
      .single();

    return data ? data.customer_id : null;
  }

  // --- ENSURERS (Tạo mới hoặc Cập nhật) ---

  /**
   * Đảm bảo Conversation tồn tại (Unified).
   * Yêu cầu cả GlobalHash (để định danh duy nhất) và ExternalId (để map cho bot).
   */
  static async ensureConversation(
    botId: string,
    globalHashId: string, // ID Hash (VD: 0GN8...) - Định danh duy nhất toàn hệ thống
    externalThreadId: string, // ID Số (VD: 249...) - Dùng để Bot gửi tin
    isGroup: boolean,
    displayName: string,
    avatar: string = "",
    rawData: unknown = {},
  ): Promise<string | null> {
    try {
      // 1. UPSERT vào bảng Core (conversations) dùng Global Hash ID
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .upsert(
          {
            global_id: globalHashId, // KEY: Hash ID
            type: isGroup ? "group" : "user",
            name: displayName,
            avatar: avatar,
            raw_data: rawData,
            last_activity_at: new Date().toISOString(),
          },
          { onConflict: "global_id" },
        )
        .select("id")
        .single();

      if (convError || !convData) {
        console.error(
          `[ConvService] Upsert Conversation Failed (Hash: ${globalHashId}):`,
          convError,
        );
        // Fallback: Thử tìm lại lần nữa phòng race condition
        const { data: fallback } = await supabase
          .from("conversations")
          .select("id")
          .eq("global_id", globalHashId)
          .single();
        if (!fallback) return null;
        return fallback.id; // Trả về ID nếu fallback thành công (nhưng mapping có thể chưa có)
      }

      const conversationUUID = convData.id;

      // 2. UPSERT vào bảng Mapping (Liên kết Bot với Conversation thông qua ID Số)
      await supabase.from("zalo_conversation_mappings").upsert(
        {
          bot_id: botId,
          conversation_id: conversationUUID,
          external_thread_id: externalThreadId, // KEY: Numeric ID
          status: { status: "active" },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "bot_id, conversation_id" },
      );

      return conversationUUID;
    } catch (error) {
      console.error("[ConvService] ensureConversation Exception:", error);
      return null;
    }
  }

  /**
   * Đảm bảo Customer tồn tại (Unified).
   */
  static async ensureCustomer(
    botId: string,
    globalHashId: string, // ID Hash (VD: 3SFV...)
    externalUserId: string, // ID Số (VD: 478...)
    displayName: string,
    avatar: string = "",
    rawData: unknown = {},
  ): Promise<string | null> {
    try {
      // 1. UPSERT Customer Global
      const { data: custData, error: custError } = await supabase
        .from("customers")
        .upsert(
          {
            global_id: globalHashId, // KEY: Hash ID
            display_name: displayName,
            avatar: avatar,
            raw_data: rawData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "global_id" },
        )
        .select("id")
        .single();

      if (custError || !custData) {
        console.error(
          `[ConvService] Upsert Customer Error (Hash: ${globalHashId}):`,
          custError?.message,
        );
        // Fallback
        const { data: fallback } = await supabase
          .from("customers")
          .select("id")
          .eq("global_id", globalHashId)
          .single();
        if (fallback) return fallback.id;
        return null;
      }

      const customerUUID = custData.id;

      // 2. UPSERT Mapping
      await supabase.from("zalo_customer_mappings").upsert(
        {
          bot_id: botId,
          customer_id: customerUUID,
          external_user_id: externalUserId, // KEY: Numeric ID
          status: { is_friend: false }, // Logic friend check sau
          last_interaction_at: new Date().toISOString(),
        },
        { onConflict: "bot_id, customer_id" },
      );

      return customerUUID;
    } catch (error) {
      console.error("[ConvService] ensureCustomer Exception:", error);
      return null;
    }
  }
}
