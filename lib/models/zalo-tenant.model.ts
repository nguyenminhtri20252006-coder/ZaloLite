/**
 * lib/models/zalo-tenant.model.ts
 * Xử lý logic Đa tài khoản (Multi-Tenancy) cho Zalo OA.
 */
import supabase from "@/lib/supabaseClient";
import {
  ZaloApp,
  ZaloUserMapping,
  NewZaloUserMapping,
  Profile,
} from "@/lib/types/database.types";

// --- ZALO APPS (TENANTS) ---

/**
 * Lấy danh sách tất cả Bot/OA đang hoạt động
 */
export async function getActiveZaloApps(): Promise<ZaloApp[]> {
  const { data, error } = await supabase
    .from("zalo_apps")
    .select("*")
    .eq("is_active", true);

  if (error) {
    console.error("[TenantModel] getActiveZaloApps Error:", error);
    return [];
  }
  return data;
}

/**
 * Lấy thông tin Bot theo OA ID (khi nhận webhook)
 */
export async function getZaloAppByOAId(oaId: string): Promise<ZaloApp | null> {
  const { data, error } = await supabase
    .from("zalo_apps")
    .select("*")
    .eq("oa_id", oaId)
    .single();

  if (error) return null;
  return data;
}

// --- USER MAPPINGS (RESOLUTION) ---

/**
 * CORE LOGIC: Resolve Profile từ thông tin Webhook Zalo.
 * 1. Tìm xem user này (zaloUserId) đã từng chat với Bot này (zaloAppId) chưa.
 * 2. Nếu có -> Trả về Profile gốc.
 * 3. Nếu chưa -> Trả về null (Cần tạo mới Profile và Mapping).
 */
export async function resolveProfileByZaloUser(
  zaloAppId: string,
  zaloUserId: string,
): Promise<Profile | null> {
  // Query bảng Mapping, join sang bảng Profiles
  const { data, error } = await supabase
    .from("zalo_user_mappings")
    .select(
      `
      profile:profiles (*)
    `,
    )
    .eq("zalo_app_id", zaloAppId)
    .eq("zalo_user_id", zaloUserId)
    .single();

  if (error || !data) return null;

  // Ép kiểu về Profile vì Supabase trả về object lồng nhau
  return data.profile as unknown as Profile;
}

/**
 * Tạo Mapping mới (Liên kết một Zalo UID mới vào một Profile có sẵn hoặc mới)
 */
export async function createZaloMapping(mapping: NewZaloUserMapping) {
  const { data, error } = await supabase
    .from("zalo_user_mappings")
    .insert(mapping)
    .select()
    .single();

  if (error) {
    console.error("[TenantModel] createZaloMapping Error:", error);
    throw error;
  }
  return data;
}

/**
 * Cập nhật thời gian tương tác cuối (Last Interaction)
 * Dùng để tracking user nào đang active trên Bot nào
 */
export async function touchZaloInteraction(
  zaloAppId: string,
  zaloUserId: string,
) {
  await supabase
    .from("zalo_user_mappings")
    .update({ last_interaction_at: new Date().toISOString() })
    .eq("zalo_app_id", zaloAppId)
    .eq("zalo_user_id", zaloUserId);
}
