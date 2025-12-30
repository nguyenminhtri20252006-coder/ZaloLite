/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V3.3 STABLE]
 * Logic:
 * - Fix ensureConversation to FORCE UPDATE avatar if provided.
 */
import supabase from "@/lib/supabaseServer";

export class ConversationService {
  static async findConversationByExternalId(
    botId: string,
    externalThreadId: string,
  ): Promise<{ conversation_id: string; global_id: string } | null> {
    const { data } = await supabase
      .from("zalo_conversation_mappings")
      .select(
        `
        conversation_id,
        conversations!inner (global_id)
      `,
      )
      .eq("bot_id", botId)
      .eq("external_thread_id", externalThreadId)
      .single();

    if (data && data.conversations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conv = data.conversations as any;
      return {
        conversation_id: data.conversation_id,
        global_id: conv.global_id,
      };
    }
    return null;
  }

  static async updateConversationIdentity(
    conversationId: string,
    newGlobalHashId: string,
    name?: string,
    avatar?: string,
    rawInfo?: unknown,
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: any = {
        global_id: newGlobalHashId,
        last_activity_at: new Date().toISOString(),
      };

      if (name) updatePayload.name = name;
      // [LOGIC FIX] Luôn update avatar nếu có dữ liệu hợp lệ
      if (avatar && avatar.length > 5) updatePayload.avatar = avatar;
      if (rawInfo) updatePayload.raw_data = rawInfo;

      const { error } = await supabase
        .from("conversations")
        .update(updatePayload)
        .eq("id", conversationId);

      if (error) {
        console.warn(
          `[ConvService] Update Identity Failed (Duplicate Hash?):`,
          error.message,
        );
        // Nếu update thất bại do trùng Hash (đã có hội thoại khác dùng Hash này),
        // Ta cố gắng update Avatar cho hội thoại Hash đó.
        if (avatar) {
          await supabase
            .from("conversations")
            .update({ avatar, name })
            .eq("global_id", newGlobalHashId);
        }
      }
    } catch (e) {
      console.error("[ConvService] updateIdentity Error:", e);
    }
  }

  static async ensureConversation(
    botId: string,
    globalHashId: string,
    externalThreadId: string,
    isGroup: boolean,
    displayName: string,
    avatar: string = "",
    rawData: unknown = {},
  ): Promise<string | null> {
    try {
      // 1. UPSERT vào bảng Core
      const upsertPayload = {
        global_id: globalHashId,
        type: isGroup ? "group" : "user",
        name: displayName,
        avatar: avatar,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw_data: rawData as any,
        last_activity_at: new Date().toISOString(),
      };

      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .upsert(upsertPayload, { onConflict: "global_id" })
        .select("id")
        .single();

      if (convError || !convData) {
        // Fallback search
        const { data: fallback } = await supabase
          .from("conversations")
          .select("id")
          .eq("global_id", globalHashId)
          .single();

        if (!fallback) {
          console.error(
            `[ConvService] Failed to upsert conversation ${globalHashId}:`,
            convError?.message,
          );
          return null;
        }

        // Nếu fallback tìm thấy, ta thử update avatar cho dòng đó (Force Update)
        if (avatar) {
          await supabase
            .from("conversations")
            .update({ avatar, name: displayName })
            .eq("id", fallback.id);
        }
        return fallback.id;
      }

      const conversationUUID = convData.id;

      // 2. UPSERT vào bảng Mapping
      await supabase.from("zalo_conversation_mappings").upsert(
        {
          bot_id: botId,
          conversation_id: conversationUUID,
          external_thread_id: externalThreadId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: { status: "active" } as any,
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

  // ... (findCustomerByExternalId và ensureCustomer giữ nguyên như cũ)
  static async findCustomerByExternalId(botId: string, externalUserId: string) {
    const { data } = await supabase
      .from("zalo_customer_mappings")
      .select("customer_id")
      .eq("bot_id", botId)
      .eq("external_user_id", externalUserId)
      .single();
    return data ? data.customer_id : null;
  }
  static async ensureCustomer(
    botId: string,
    globalHashId: string,
    externalUserId: string,
    displayName: string,
    avatar: string = "",
    rawData: unknown = {},
  ) {
    try {
      const { data: custData, error: custError } = await supabase
        .from("customers")
        .upsert(
          {
            global_id: globalHashId,
            display_name: displayName,
            avatar: avatar, // eslint-disable-next-line @typescript-eslint/no-explicit-any
            raw_data: rawData as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "global_id" },
        )
        .select("id")
        .single();
      if (custError || !custData) {
        const { data: fallback } = await supabase
          .from("customers")
          .select("id")
          .eq("global_id", globalHashId)
          .single();
        if (fallback) {
          if (avatar)
            await supabase
              .from("customers")
              .update({ avatar, display_name: displayName })
              .eq("id", fallback.id);
          return fallback.id;
        }
        return null;
      }
      const customerUUID = custData.id;
      await supabase.from("zalo_customer_mappings").upsert(
        {
          bot_id: botId,
          customer_id: customerUUID,
          external_user_id: externalUserId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: { is_friend: false } as any,
          last_interaction_at: new Date().toISOString(),
        },
        { onConflict: "bot_id, customer_id" },
      );
      return customerUUID;
    } catch (error) {
      return null;
    }
  }
}
