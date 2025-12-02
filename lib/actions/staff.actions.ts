"use server";

/**
 * lib/actions/staff.actions.ts
 * Business Logic cho Quản trị viên & Nhân viên (Auth, Permission, Audit).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "@/lib/utils/security";
import { StaffAccount, BotPermissionType } from "@/lib/types/database.types";

const COOKIE_NAME = "staff_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 ngày

// Định nghĩa cấu trúc Session Payload
type SessionPayload = {
  id: string;
  username: string;
  role: string;
  full_name: string;
  expiresAt: number;
};

// Định nghĩa State cho Form Login (Server Action)
export type LoginState = {
  error?: string;
  success?: boolean;
};

/**
 * ACTION: Đăng nhập Hệ thống
 */
export async function staffLoginAction(
  prevState: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Vui lòng nhập tên đăng nhập và mật khẩu." };
  }

  try {
    // 1. Tìm tài khoản trong DB
    const { data: staff } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("username", username)
      .single();

    if (!staff || !staff.is_active) {
      return { error: "Tài khoản không tồn tại hoặc đã bị khóa." };
    }

    // 2. Kiểm tra mật khẩu
    const isValid = verifyPassword(password, staff.password_hash);
    if (!isValid) {
      // Log failed attempt (Optional)
      return { error: "Mật khẩu không chính xác." };
    }

    // 3. Tạo Session Token (Stateless)
    const expiresAt = Date.now() + SESSION_DURATION;
    const payload: SessionPayload = {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      full_name: staff.full_name,
      expiresAt,
    };

    const token = createSessionToken(payload);

    // 4. Lưu Cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
      sameSite: "lax",
    });

    // 5. Ghi Audit Log
    await createAuditLog(staff.id, "AUTH", "LOGIN", {
      ip: "unknown", // Next.js Server Action khó lấy IP trực tiếp chuẩn xác
      method: "PASSWORD",
    });
  } catch (error: any) {
    console.error("Login Error:", error);
    return { error: "Lỗi hệ thống: " + error.message };
  }

  // Redirect phải ở ngoài try/catch
  redirect("/dashboard");
}

/**
 * ACTION: Đăng xuất
 */
export async function staffLogoutAction() {
  const session = await getStaffSession();

  if (session) {
    await createAuditLog(session.id, "AUTH", "LOGOUT", {});
  }

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}

/**
 * HELPER: Lấy thông tin Session hiện tại (Dùng trong Server Component/Action)
 */
export async function getStaffSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = verifySessionToken<SessionPayload>(token);

  // Kiểm tra hết hạn
  if (!payload || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

/**
 * HELPER: Kiểm tra quyền hạn của Staff đối với một Bot cụ thể
 */
export async function checkBotPermission(
  staffId: string,
  botId: string,
  requiredType: BotPermissionType,
): Promise<boolean> {
  // Admin luôn có quyền
  const { data: staff } = await supabase
    .from("staff_accounts")
    .select("role")
    .eq("id", staffId)
    .single();

  if (staff?.role === "admin") return true;

  // Check bảng phân quyền
  const { data } = await supabase
    .from("staff_bot_permissions")
    .select("*")
    .eq("staff_id", staffId)
    .eq("bot_id", botId)
    .single();

  if (!data) return false;

  // Logic phân cấp quyền
  // view_only: Thấp nhất
  // chat: Gửi tin
  // auth: Cao nhất (Quản lý login)

  if (requiredType === "view_only") return true; // Có row là xem được
  if (
    requiredType === "chat" &&
    (data.permission_type === "chat" || data.permission_type === "auth")
  )
    return true;
  if (requiredType === "auth" && data.permission_type === "auth") return true;

  return false;
}

/**
 * HELPER: Ghi Audit Log (Internal)
 */
export async function createAuditLog(
  staffId: string | null,
  group: string,
  type: string,
  payload: any,
) {
  // Gọi trực tiếp Supabase hoặc RPC function đã tạo
  await supabase.from("audit_logs").insert({
    staff_id: staffId,
    action_group: group,
    action_type: type,
    payload: payload,
  });
}
