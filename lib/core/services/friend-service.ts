/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/friend-service.ts
 * [CORE SERVICE - V6 MODULE]
 * Chuyên trách quản lý:
 * 1. Zalo Identities (User/Stranger)
 * 2. Zalo Connections (Friend/Stranger relationships)
 */

import supabase from "@/lib/supabaseServer";

export class FriendService {
  /**
   * Tạo hoặc cập nhật thông tin định danh (User/Stranger)
   * @param data Dữ liệu thô từ API Zalo
   * @param type Loại định danh ('user' | 'stranger' | 'system_bot')
   * @param isFriend Cờ đánh dấu bạn bè (Global Metadata)
   */
  static async upsertIdentity(
    zaloId: string,
    data: any,
    type: "user" | "stranger" | "system_bot" = "user",
    isFriend: boolean = false,
  ) {
    if (!zaloId) return null;

    const displayName =
      data.displayName || data.name || data.zaloName || `User ${zaloId}`;
    const avatar = data.avatar || data.avt || "";

    const { data: identity, error } = await supabase
      .from("zalo_identities")
      .upsert(
        {
          zalo_global_id: zaloId,
          name: displayName,
          avatar: avatar,
          type: type, // Trong V6 ưu tiên dùng 'user' cho mọi người dùng
          is_friend: isFriend,
          raw_data: data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "zalo_global_id" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(
        `[FriendService] Upsert Identity Error (${zaloId}):`,
        error.message,
      );
      return null;
    }

    return identity?.id; // Trả về UUID internal
  }

  /**
   * Thiết lập mối quan hệ giữa Bot và User (Connection)
   * @param botId ID của Bot (Observer)
   * @param userId ID của User (Target)
   * @param userZaloId External Zalo ID của User
   * @param type Loại quan hệ ('friend' | 'stranger')
   * @param metadata Dữ liệu bổ sung (ví dụ: source_group)
   */
  static async upsertConnection(
    botId: string,
    userId: string,
    userZaloId: string,
    type: "friend" | "stranger",
    metadata: any = {},
  ) {
    if (!botId || !userId) return;

    // Logic Vẹn toàn: Không ghi đè 'friend' bằng 'stranger'
    if (type === "stranger") {
      const { data: existing } = await supabase
        .from("zalo_connections")
        .select("id, relationship_data")
        .eq("observer_id", botId)
        .eq("target_id", userId)
        .single();

      // Nếu đã có quan hệ (bất kể là gì), không tạo mới stranger để tránh mất dấu friend
      if (existing) return;
    }

    // Upsert quan hệ
    const { error } = await supabase.from("zalo_connections").upsert(
      {
        observer_id: botId,
        target_id: userId,
        external_uid: userZaloId,
        relationship_data: {
          type,
          ...metadata,
          synced_at: new Date().toISOString(),
        },
        last_interaction_at: new Date().toISOString(),
      },
      { onConflict: "observer_id, target_id" },
    );

    if (error) {
      console.error(`[FriendService] Upsert Connection Error:`, error.message);
    }
  }
}
