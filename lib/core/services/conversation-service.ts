/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V2.1]
 * Logic: Unified Conversation & Customer Management.
 * [UPDATED] Sử dụng UPSERT để đảm bảo tính duy nhất của Conversation ID (Tránh duplicate message).
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  /**
   * Đảm bảo Conversation tồn tại và Bot có liên kết với nó.
   * Sử dụng UPSERT (ON CONFLICT) để tránh race condition.
   */
  static async ensureConversation(
    botId: string,
    threadId: string, // Global ID (Group ID hoặc User ID)
    isGroup: boolean,
    displayName: string,
    avatar: string = "",
    rawData: unknown = {},
  ): Promise<string | null> {
    try {
      // [DEBUG]
      console.log(
        `[ConvService] 🛠 Ensuring GlobalID="${threadId}" for Bot ${botId}`,
      );

      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .upsert(
          {
            global_id: threadId,
            type: isGroup ? "group" : "user",
            name: displayName,
            avatar: avatar,
            raw_data: rawData, // Update metadata mới nhất
            last_activity_at: new Date().toISOString(),
          },
          { onConflict: "global_id" }, // Quan trọng: Dựa vào cột UNIQUE này
        )
        .select("id, global_id") // Select cả global_id để so sánh
        .single();

      if (convError || !convData) {
        console.error(`[ConvService] ❌ Upsert Error:`, convError);
        // Fallback Select
        const { data: fallback } = await supabase
          .from("conversations")
          .select("id")
          .eq("global_id", threadId)
          .single();
        if (fallback) {
          console.log(`[ConvService] ⚠️ Fallback found ID: ${fallback.id}`);
          return fallback.id;
        }
        return null;
      }

      console.log(
        `[ConvService] ✅ Resolved UUID: ${convData.id} (Matches GlobalID: "${convData.global_id}")`,
      );

      // Mapping Logic (Giữ nguyên, chỉ thêm log nếu cần)
      await supabase.from("zalo_conversation_mappings").upsert(
        {
          bot_id: botId,
          conversation_id: convData.id,
          external_thread_id: threadId,
          status: { status: "active" },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "bot_id, conversation_id" },
      );

      return convData.id;
    } catch (error) {
      console.error("[ConvService] Exception:", error);
      return null;
    }
  }

  /**
   * Đảm bảo Customer tồn tại (Single View).
   */
  static async ensureCustomer(
    botId: string,
    zaloUserId: string, // Global ID
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
            global_id: zaloUserId,
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
          `[ConvService] Upsert Customer Error (${zaloUserId}):`,
          custError?.message,
        );
        // Fallback select
        const { data: fallback } = await supabase
          .from("customers")
          .select("id")
          .eq("global_id", zaloUserId)
          .single();
        if (fallback) return fallback.id;
        return null;
      }

      const customerId = custData.id;

      // 2. UPSERT Mapping
      await supabase.from("zalo_customer_mappings").upsert(
        {
          bot_id: botId,
          customer_id: customerId,
          external_user_id: zaloUserId,
          status: { is_friend: false }, // Cần logic check friend thật sau này
          last_interaction_at: new Date().toISOString(),
        },
        { onConflict: "bot_id, customer_id" },
      );

      return customerId;
    } catch (error) {
      console.error("[ConvService] ensureCustomer Exception:", error);
      return null;
    }
  }
}
