/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * lib/core/services/conversation-service.ts
 * [CORE SERVICE - V10.0 ATOMIC MAPPING]
 * - Fix: Upsert Private Chat now automatically maps `thread_id` for Bot.
 * - Logic: Ensure conversation_members always has the correct External UID for routing.
 */

import supabase from "@/lib/supabaseServer";

export class ConversationService {
  /**
   * Tạo hoặc cập nhật Nhóm
   * - global_group_id: GlobalID (String) -> Unique Key
   * - thread_id: NumericID (String) -> Routing Key
   */
  static async upsertGroupConversation(
    globalGroupId: string,
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
          global_group_id: globalGroupId,
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
      console.error(`[ConvService] Upsert Group Error:`, error.message);
      return null;
    }
    return conv?.id;
  }

  /**
   * Upsert Private Conversation (Atomic Logic)
   * [UPDATE] Now accepts `friendExternalId` to ensure Routing Key is saved immediately.
   */
  static async upsertPrivateConversation(
    botId: string,
    friendIdentityId: string,
    friendName: string,
    friendAvatar: string,
    rawData: any = {},
    friendExternalId: string | null = null, // [CRITICAL PARAM] UID số (thread_id)
  ) {
    const participants = [botId, friendIdentityId];
    let conversationId: string | null = null;

    // 1. Check Existing
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "private")
      .contains("participant_ids", participants)
      .limit(1)
      .maybeSingle();

    if (existingConv) {
      // Update info
      await supabase
        .from("conversations")
        .update({
          name: friendName,
          avatar: friendAvatar,
          raw_data: rawData,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", existingConv.id);
      conversationId = existingConv.id;
    } else {
      // Create New
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({
          type: "private",
          global_group_id: null,
          name: friendName,
          avatar: friendAvatar,
          participant_ids: participants,
          raw_data: rawData,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!error && newConv) conversationId = newConv.id;
    }

    // 2. [AUTO-MAPPING] Ensure Members exist with correct ThreadID
    if (conversationId && friendExternalId) {
      // Add Bot (Observer) -> Needs thread_id (friendExternalId) to route messages
      await this.addMember(conversationId, botId, "admin", friendExternalId);

      // Add Friend (Target) -> thread_id is null (or specific if needed)
      await this.addMember(conversationId, friendIdentityId, "member", null);
    } else if (conversationId) {
      // Fallback for legacy calls without external ID
      // We only ensure membership exists
      await this.addMember(conversationId, botId, "admin", null);
      await this.addMember(conversationId, friendIdentityId, "member", null);
    }

    return conversationId;
  }

  /**
   * Thêm thành viên vào hội thoại
   * @param threadId: External UID (Routing Key) - Quan trọng cho Bot nhận tin
   */
  static async addMember(
    conversationId: string,
    identityId: string,
    role: string = "member",
    threadId: string | null = null,
  ) {
    // Only update if thread_id is provided or row missing
    // upsert logic handles strict updates
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
