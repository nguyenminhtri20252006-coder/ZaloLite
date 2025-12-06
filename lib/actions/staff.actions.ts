/**
 * lib/actions/staff.actions.ts
 * Business Logic cho Quản trị viên & Nhân viên.
 * Updated: Payload session khớp với DB schema v2 (thêm avatar, phone).
 */

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import supabase from "@/lib/supabaseServer";
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "@/lib/utils/security";
import { BotPermissionType } from "@/lib/types/database.types";

const COOKIE_NAME = "staff_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 ngày

// [UPDATED] Session Payload đầy đủ hơn
type SessionPayload = {
  id: string;
  username: string;
  role: string;
  full_name: string;
  avatar?: string | null; // New
  phone?: string | null; // New
  expiresAt: number;
};

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
    const { data: staff } = await supabase
      .from("staff_accounts")
      .select("*")
      .eq("username", username)
      .single();

    if (!staff || !staff.is_active) {
      return { error: "Tài khoản không tồn tại hoặc đã bị khóa." };
    }

    const isValid = verifyPassword(password, staff.password_hash);
    if (!isValid) {
      return { error: "Mật khẩu không chính xác." };
    }

    // [UPDATED] Tạo Session Token với thông tin mở rộng
    const expiresAt = Date.now() + SESSION_DURATION;
    const payload: SessionPayload = {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      full_name: staff.full_name,
      avatar: staff.avatar,
      phone: staff.phone,
      expiresAt,
    };

    const token = createSessionToken(payload);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
      sameSite: "lax",
    });

    await createAuditLog(staff.id, "AUTH", "LOGIN", {
      method: "PASSWORD",
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("Login Error:", err);
    return { error: "Lỗi hệ thống: " + err };
  }

  redirect("/dashboard");
}

export async function staffLogoutAction() {
  const session = await getStaffSession();

  if (session) {
    await createAuditLog(session.id, "AUTH", "LOGOUT", {});
  }

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}

export async function getStaffSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = verifySessionToken<SessionPayload>(token);

  if (!payload || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

export async function checkBotPermission(
  staffId: string,
  botId: string,
  requiredType: BotPermissionType,
): Promise<boolean> {
  const { data: staff } = await supabase
    .from("staff_accounts")
    .select("role")
    .eq("id", staffId)
    .single();

  if (staff?.role === "admin") return true;

  const { data } = await supabase
    .from("staff_bot_permissions")
    .select("*")
    .eq("staff_id", staffId)
    .eq("bot_id", botId)
    .single();

  if (!data) return false;

  if (requiredType === "view_only") return true;
  if (
    requiredType === "chat" &&
    (data.permission_type === "chat" || data.permission_type === "auth")
  )
    return true;
  if (requiredType === "auth" && data.permission_type === "auth") return true;

  return false;
}

export async function createAuditLog(
  staffId: string | null,
  group: string,
  type: string,
  payload: unknown,
) {
  await supabase.from("audit_logs").insert({
    staff_id: staffId,
    action_group: group,
    action_type: type,
    payload: payload,
  });
}
