/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/friend-service.ts
 * [CORE SERVICE - V9.0 STRICT MAPPING]
 * - Identity: Định danh bằng GlobalID (String).
 * - Connection: Định danh bằng ExternalUID (Number String).
 * - Name: Ưu tiên ZaloName.
 */

import supabase from "@/lib/supabaseServer";

export class FriendService {
  /**
   * Tạo hoặc cập nhật thông tin định danh (Identity)
   * LOGIC MỚI:
   * - Key: globalId (Chuỗi mã hóa của Zalo)
   * - Name: zaloName (Tên gốc) > displayName (Tên hiển thị)
   */
  static async upsertIdentity(
    globalId: string, // [FIX] Đây phải là GlobalID (VD: MK8O...)
    data: any,
    type: "user" | "system_bot" = "user",
  ) {
    if (!globalId) {
      console.warn("[FriendService] Upsert Identity Skipped: Missing GlobalID");
      return null;
    }

    // [FIX] Priority: zaloName -> displayName -> name
    const rootName =
      data.zaloName || data.displayName || data.name || `User ${globalId}`;

    const avatar = data.avatar || data.avt || "";

    const { data: identity, error } = await supabase
      .from("zalo_identities")
      .upsert(
        {
          zalo_global_id: globalId, // <--- Cột này lưu GlobalID chuẩn
          root_name: rootName,
          avatar: avatar,
          type: type,
          raw_data: data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "zalo_global_id" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(
        `[FriendService] Upsert Identity Error (${globalId}):`,
        error.message,
      );
      return null;
    }

    return identity?.id;
  }

  /**
   * Thiết lập mối quan hệ (Connection)
   * LOGIC MỚI:
   * - external_uid: Lưu UID số (VD: 9186...) để dùng cho API call.
   */
  static async upsertConnection(
    botId: string,
    targetIdentityId: string,
    externalUid: string, // [FIX] Đây là UID Số (VD: 9186...)
    newStatus: {
      is_friend?: boolean;
      type?: "friend" | "stranger";
      source?: string;
      [key: string]: any;
    },
  ) {
    if (!botId || !targetIdentityId || !externalUid) return;

    // 1. Fetch existing data to merge JSON
    const { data: existing } = await supabase
      .from("zalo_connections")
      .select("id, relationship_data")
      .eq("observer_id", botId)
      .eq("target_id", targetIdentityId)
      .single();

    let finalData: any = existing?.relationship_data || {};

    // Logic bảo vệ: Không hạ cấp Friend -> Stranger
    const wasFriend = finalData.is_friend === true;
    const isBecomingStranger =
      newStatus.type === "stranger" || newStatus.is_friend === false;

    if (wasFriend && isBecomingStranger) {
      // Giữ nguyên is_friend, chỉ update source phụ nếu cần
    } else {
      finalData = {
        ...finalData,
        ...newStatus,
        synced_at: new Date().toISOString(),
      };
    }

    // 2. Upsert
    const { error } = await supabase.from("zalo_connections").upsert(
      {
        observer_id: botId,
        target_id: targetIdentityId,
        external_uid: externalUid, // <--- Lưu UID số vào đây
        relationship_data: finalData,
        last_interaction_at: new Date().toISOString(),
      },
      { onConflict: "observer_id, target_id" },
    );

    if (error) {
      console.error(`[FriendService] Upsert Connection Error:`, error.message);
    }
  }
}
