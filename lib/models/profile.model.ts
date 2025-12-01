/**
 * lib/models/profile.model.ts
 * Tầng Model cho bảng 'profiles' (Entity User Gốc).
 */
import supabase from "@/lib/supabaseClient";
import { Profile, NewProfile } from "@/lib/types/database.types";

/**
 * Lấy profile theo ID gốc (UUID)
 */
export async function getProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Lấy profile theo Legacy Zalo UID (Trường hợp chỉ dùng 1 bot mặc định)
 */
export async function getProfileByLegacyZaloUid(
  zaloUid: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("zalo_uid", zaloUid)
    .single();

  if (error) return null;
  return data;
}

/**
 * Tạo mới một Profile (Identity gốc)
 */
export async function createProfile(profileData: NewProfile): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .insert(profileData)
    .select()
    .single();

  if (error) {
    console.error("[ProfileModel] createProfile Error:", error);
    throw error;
  }
  return data;
}

/**
 * Cập nhật thông tin Profile
 */
export async function updateProfile(id: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[ProfileModel] updateProfile Error:", error);
    throw error;
  }
  return data;
}
