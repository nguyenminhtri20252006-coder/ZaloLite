/**
 * lib/actions/staff.actions.ts
 * [UPDATED] Thêm các hành động CRUD quản lý nhân viên.
 */

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import supabase from "@/lib/supabaseServer";
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  hashPassword,
} from "@/lib/utils/security";
import { BotPermissionType, StaffRole } from "@/lib/types/database.types";

// ... (Giữ nguyên các hàm login/logout cũ) ...
const COOKIE_NAME = "staff_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  id: string;
  username: string;
  role: string;
  full_name: string;
  avatar?: string | null;
  phone?: string | null;
  expiresAt: number;
};

export type LoginState = {
  error?: string;
  success?: boolean;
};

export async function staffLoginAction(
  prevState: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  // ... (Logic cũ)
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

    await createAuditLog(staff.id, "AUTH", "LOGIN", { method: "PASSWORD" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { error: "Lỗi hệ thống: " + err };
  }
  redirect("/dashboard");
}

export async function staffLogoutAction() {
  const session = await getStaffSession();
  if (session) await createAuditLog(session.id, "AUTH", "LOGOUT", {});
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}

export async function getStaffSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken<SessionPayload>(token);
  if (!payload || payload.expiresAt < Date.now()) return null;
  return payload;
}

// --- NEW CRUD ACTIONS ---

export async function getAllStaffAction() {
  const { data, error } = await supabase
    .from("staff_accounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createStaffAction(payload: {
  username: string;
  password: string;
  full_name: string;
  role: StaffRole;
  phone?: string;
}) {
  const { username, password, full_name, role, phone } = payload;

  // Check tồn tại
  const { data: exist } = await supabase
    .from("staff_accounts")
    .select("id")
    .eq("username", username)
    .single();
  if (exist) return { success: false, error: "Tên đăng nhập đã tồn tại" };

  const password_hash = hashPassword(password);

  const { error } = await supabase.from("staff_accounts").insert({
    username,
    password_hash,
    full_name,
    role,
    phone,
    is_active: true,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateStaffAction(
  id: string,
  payload: {
    full_name?: string;
    role?: StaffRole;
    phone?: string;
    is_active?: boolean;
  },
) {
  const { error } = await supabase
    .from("staff_accounts")
    .update(payload)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function changeStaffPasswordAction(
  id: string,
  newPassword: string,
) {
  const password_hash = hashPassword(newPassword);
  const { error } = await supabase
    .from("staff_accounts")
    .update({ password_hash })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteStaffAction(id: string) {
  // Không xóa admin gốc nếu muốn an toàn (logic thêm nếu cần)
  const { error } = await supabase.from("staff_accounts").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ... (Giữ nguyên checkBotPermission và createAuditLog)
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
