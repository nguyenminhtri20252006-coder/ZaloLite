/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V9.0 STRICT MAPPING]
 * - GroupID: Lưu GlobalID vào DB, nhưng thread_id là NumericID.
 * - Private: Mapping theo participant_ids.
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  /**
   * Tạo hoặc cập nhật Nhóm
   * LOGIC MỚI:
   * - global_group_id: Lưu GlobalID (Chuỗi mã hóa, VD: J5P1...)
   */
  static async upsertGroupConversation(
    globalGroupId: string, // [FIX] Global ID (String)
    name: string,
    avatar: string,
    rawInfo: any,
  ) {
    if (!globalGroupId) return null;

    const { data: conv, error } = await supabase
      .from("conversations")
      .upsert(
        {
          type: "group",
          global_group_id: globalGroupId, // <--- ID Duy nhất toàn cục
          name: name,
          avatar: avatar,
          raw_data: rawInfo,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "global_group_id" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(
        `[ConvService] Upsert Group Error (${globalGroupId}):`,
        error.message,
      );
      return null;
    }
    return conv?.id;
  }

  /**
   * Upsert Private Conversation
   * Logic không đổi: Dựa vào cặp participant_ids (Internal UUIDs)
   */
  static async upsertPrivateConversation(
    botId: string,
    friendIdentityId: string,
    friendName: string,
    friendAvatar: string,
  ) {
    const participants = [botId, friendIdentityId];

    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "private")
      .contains("participant_ids", participants)
      .limit(1)
      .single();

    if (existingConv) {
      await supabase
        .from("conversations")
        .update({
          name: friendName,
          avatar: friendAvatar,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", existingConv.id);
      return existingConv.id;
    }

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        type: "private",
        global_group_id: null,
        name: friendName,
        avatar: friendAvatar,
        participant_ids: participants,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) return null;
    return newConv?.id;
  }

  /**
   * Thêm thành viên vào hội thoại
   * @param threadId: [FIX] Đây là ID dùng để Router (UID số hoặc GroupID số)
   */
  static async addMember(
    conversationId: string,
    identityId: string,
    role: string = "member",
    threadId: string | null = null, // <--- Numeric ID lưu ở đây
  ) {
    const { error } = await supabase.from("conversation_members").upsert(
      {
        conversation_id: conversationId,
        identity_id: identityId,
        role: role,
        joined_at: new Date().toISOString(),
        thread_id: threadId, // <--- Routing Key
      },
      { onConflict: "conversation_id, identity_id" },
    );

    if (error) {
      console.error(`[ConvService] Add Member Error:`, error.message);
    }
  }
}
