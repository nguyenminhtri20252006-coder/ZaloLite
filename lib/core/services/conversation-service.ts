/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V6 FIXED LOGIC]
 * - Group: Định danh bằng global_group_id.
 * - Private: Định danh bằng mảng participant_ids (BotID + UserID).
 * - Routing: thread_id trong conversation_members.
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  /**
   * Tạo hoặc cập nhật Nhóm (Group Conversation)
   * Logic: Dựa vào External ID (zalo_group_id) làm khóa chính
   */
  static async upsertGroupConversation(
    groupId: string,
    name: string,
    avatar: string,
    rawInfo: any,
  ) {
    // Với Group, ta luôn có ID duy nhất từ Zalo -> Dùng làm global_group_id
    const { data: conv, error } = await supabase
      .from("conversations")
      .upsert(
        {
          type: "group",
          global_group_id: groupId, // ID Nhóm Zalo
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
        `[ConvService] Upsert Group Error (${groupId}):`,
        error.message,
      );
      return null;
    }
    return conv?.id;
  }

  /**
   * Tạo hoặc cập nhật Hội thoại Riêng tư (Private)
   * Logic: Kiểm tra xem đã có hội thoại 'private' nào chứa cả 2 ID này chưa.
   * @param botId Identity ID của Bot (Internal UUID)
   * @param friendIdentityId Identity ID của User (Internal UUID)
   */
  static async upsertPrivateConversation(
    botId: string,
    friendIdentityId: string,
    friendName: string,
    friendAvatar: string,
  ) {
    // 1. Kiểm tra tồn tại
    // Tìm hội thoại loại 'private' mà participant_ids chứa cả Bot và Friend
    const participants = [botId, friendIdentityId];

    const { data: existingConv, error: findError } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "private")
      .contains("participant_ids", participants) // PostgreSQL @> operator
      .limit(1)
      .single();

    if (existingConv) {
      // Nếu đã tồn tại -> Update Metadata (Tên, Avatar mới nhất của User)
      // Lưu ý: Tên hội thoại private thường là tên User đối phương (theo góc nhìn Bot)
      await supabase
        .from("conversations")
        .update({
          name: friendName,
          avatar: friendAvatar,
          last_activity_at: new Date().toISOString(), // Bump activity
        })
        .eq("id", existingConv.id);

      return existingConv.id;
    }

    // 2. Nếu chưa tồn tại -> Tạo mới
    // Lưu ý: participant_ids là mảng UUID
    const { data: newConv, error: createError } = await supabase
      .from("conversations")
      .insert({
        type: "private",
        global_group_id: null, // Private chat không có Global Group ID
        name: friendName,
        avatar: friendAvatar,
        participant_ids: participants, // Lưu mảng ID để query lần sau
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createError) {
      console.error(
        `[ConvService] Create Private Conv Error:`,
        createError.message,
      );
      return null;
    }
    return newConv?.id;
  }

  /**
   * Thêm thành viên vào hội thoại (Map Member & Routing)
   * Hàm này cũng dùng để cập nhật lại participant_ids trong bảng conversations nếu cần
   */
  static async addMember(
    conversationId: string,
    identityId: string,
    role: string = "member",
    threadId: string | null = null,
  ) {
    // Chỉ cần insert vào bảng chi tiết
    const { error } = await supabase.from("conversation_members").upsert(
      {
        conversation_id: conversationId,
        identity_id: identityId,
        role: role,
        joined_at: new Date().toISOString(),
        thread_id: threadId,
      },
      { onConflict: "conversation_id, identity_id" },
    );

    if (error) {
      console.error(`[ConvService] Add Member Error:`, error.message);
    }
  }
}
