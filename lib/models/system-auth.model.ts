/**
 * lib/models/system-auth.model.ts
 * Xử lý logic truy cập dữ liệu cho Module Identity & System.
 */
import supabase from "@/lib/supabaseClient";
import {
  SystemAccount,
  SystemSession,
  NewSystemAccount,
} from "@/lib/types/database.types";

// --- SYSTEM ACCOUNTS ---

/**
 * Tìm tài khoản hệ thống bằng username
 */
export async function getAccountByUsername(
  username: string,
): Promise<SystemAccount | null> {
  const { data, error } = await supabase
    .from("system_accounts")
    .select("*")
    .eq("username", username)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116: No rows found
    console.error("[AuthModel] getAccountByUsername Error:", error);
    throw error;
  }
  return data;
}

/**
 * Tạo tài khoản hệ thống mới (Thường dùng cho seed hoặc admin tạo user)
 */
export async function createSystemAccount(
  account: NewSystemAccount,
): Promise<SystemAccount> {
  const { data, error } = await supabase
    .from("system_accounts")
    .insert(account)
    .select()
    .single();

  if (error) {
    console.error("[AuthModel] createSystemAccount Error:", error);
    throw error;
  }
  return data;
}

/**
 * Cập nhật thời gian đăng nhập cuối
 */
export async function updateLastLogin(accountId: string) {
  await supabase
    .from("system_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", accountId);
}

// --- SYSTEM SESSIONS ---

/**
 * Tạo phiên đăng nhập mới (Lưu token vào DB)
 */
export async function createSession(
  accountId: string,
  token: string,
  expiresAt: Date,
  meta?: { ip?: string; ua?: string },
): Promise<SystemSession> {
  const { data, error } = await supabase
    .from("system_sessions")
    .insert({
      token,
      account_id: accountId,
      expires_at: expiresAt.toISOString(),
      ip_address: meta?.ip,
      user_agent: meta?.ua,
    })
    .select()
    .single();

  if (error) {
    console.error("[AuthModel] createSession Error:", error);
    throw error;
  }
  return data;
}

/**
 * Kiểm tra token và lấy thông tin session + account
 */
export async function getSessionWithAccount(token: string) {
  // Join bảng system_sessions với system_accounts
  const { data, error } = await supabase
    .from("system_sessions")
    .select(
      `
      *,
      account:system_accounts (*)
    `,
    )
    .eq("token", token)
    .gt("expires_at", new Date().toISOString()) // Chỉ lấy session chưa hết hạn
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[AuthModel] getSessionWithAccount Error:", error);
    return null;
  }
  return data; // Trả về session kèm thông tin account
}

/**
 * Xóa session (Đăng xuất)
 */
export async function deleteSession(token: string) {
  const { error } = await supabase
    .from("system_sessions")
    .delete()
    .eq("token", token);

  if (error) console.error("[AuthModel] deleteSession Error:", error);
}
