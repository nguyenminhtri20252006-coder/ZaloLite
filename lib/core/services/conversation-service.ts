/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V2]
 * Logic: Unified Conversation & Customer Management.
 * Update: Sử dụng 'unknown' cho dữ liệu raw JSONB.
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  /**
   * Đảm bảo Conversation tồn tại và Bot có liên kết với nó.
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
      // 1. Kiểm tra Mapping (Bot đã biết thread này chưa?)
      const { data: mapping } = await supabase
        .from("zalo_conversation_mappings")
        .select("conversation_id")
        .eq("bot_id", botId)
        .eq("external_thread_id", threadId)
        .single();

      if (mapping) {
        return mapping.conversation_id;
      }

      console.log(
        `[ConvService] New conversation for Bot ${botId}: ${threadId}`,
      );

      // 2. Nếu chưa có Mapping, kiểm tra bảng Global
      let conversationId: string | null = null;

      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("global_id", threadId)
        .single();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        // 3. Tạo mới Conversation Global
        const { data: newConv, error: createError } = await supabase
          .from("conversations")
          .insert({
            global_id: threadId,
            type: isGroup ? "group" : "user",
            name: displayName,
            avatar: avatar,
            raw_data: rawData, // Type unknown được chấp nhận bởi Supabase client (as JSON)
          })
          .select("id")
          .single();

        if (createError || !newConv) {
          console.error("[ConvService] Create Global Conv Error:", createError);
          return null;
        }
        conversationId = newConv.id;
      }

      // 4. Tạo Mapping cho Bot hiện tại
      const { error: mapError } = await supabase
        .from("zalo_conversation_mappings")
        .insert({
          bot_id: botId,
          conversation_id: conversationId,
          external_thread_id: threadId,
          status: { status: "active" },
        });

      if (mapError) {
        console.error("[ConvService] Create Mapping Error:", mapError);
        return conversationId;
      }

      return conversationId;
    } catch (error) {
      console.error("[ConvService] ensureConversation Exception:", error);
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
      // 1. Check Mapping
      const { data: mapping } = await supabase
        .from("zalo_customer_mappings")
        .select("customer_id")
        .eq("bot_id", botId)
        .eq("external_user_id", zaloUserId)
        .single();

      if (mapping) return mapping.customer_id;

      // 2. Check Global Table
      let customerId: string | null = null;

      const { data: existingCust } = await supabase
        .from("customers")
        .select("id")
        .eq("global_id", zaloUserId)
        .single();

      if (existingCust) {
        customerId = existingCust.id;
      } else {
        // 3. Create Global Customer
        const { data: newCust, error: createError } = await supabase
          .from("customers")
          .insert({
            global_id: zaloUserId,
            display_name: displayName,
            avatar: avatar,
            raw_data: rawData,
          })
          .select("id")
          .single();

        if (createError || !newCust) {
          console.error(
            "[ConvService] Create Global Customer Error:",
            createError,
          );
          return null;
        }
        customerId = newCust.id;
      }

      // 4. Create Mapping
      await supabase.from("zalo_customer_mappings").insert({
        bot_id: botId,
        customer_id: customerId,
        external_user_id: zaloUserId,
        status: { is_friend: false },
      });

      return customerId;
    } catch (error) {
      console.error("[ConvService] ensureCustomer Exception:", error);
      return null;
    }
  }
}
