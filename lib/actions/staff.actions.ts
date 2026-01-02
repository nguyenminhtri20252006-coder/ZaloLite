/**
 * lib/actions/staff.actions.ts
 * [SECURITY UPDATE]
 * - Các action CRUD Staff: Chỉ Admin được thực hiện.
 * - Tích hợp Work Sessions & Audit Logs chuẩn Database V6.
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
  hashSessionToken,
} from "@/lib/utils/security";
// Import Role từ DB types
// Giả sử definition role là string literal hoặc enum
type StaffRole = "admin" | "staff";
type BotPermissionType = "owner" | "chat" | "view_only";

const COOKIE_NAME = "staff_session";
// [UPDATE] Giảm thời gian session xuống 4 tiếng
const SESSION_DURATION = 4 * 60 * 60 * 1000;

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

// --- HELPER SESSION TRACKING ---

async function startWorkSession(staffId: string, token: string) {
  try {
    const tokenHash = hashSessionToken(token);

    // Cleanup: Đóng các session treo quá lâu (VD: > 1 ngày không ping)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Đóng session cũ chưa có end date và last_ping cũ
    await supabase
      .from("work_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("staff_id", staffId)
      .is("ended_at", null)
      .lt("last_ping_at", yesterday);

    // Tạo session mới cho token này
    await supabase.from("work_sessions").insert({
      staff_id: staffId,
      started_at: new Date().toISOString(),
      last_ping_at: new Date().toISOString(),
      session_token_hash: tokenHash,
    });
  } catch (e) {
    console.error("Start Session Error:", e);
  }
}

async function endWorkSession(staffId: string, token?: string) {
  try {
    let query = supabase
      .from("work_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("staff_id", staffId)
      .is("ended_at", null);

    if (token) {
      // Chỉ đóng đúng session của token này
      const tokenHash = hashSessionToken(token);
      query = query.eq("session_token_hash", tokenHash);
    }

    await query;
  } catch (e) {
    console.error("End Session Error:", e);
  }
}

// --- MAIN ACTIONS ---

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

    // [SYS] Ghi nhận Session bắt đầu
    await startWorkSession(staff.id, token);
    await createAuditLog(staff.id, "AUTH", "LOGIN", { method: "PASSWORD" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { error: "Lỗi hệ thống: " + err };
  }
  redirect("/dashboard");
}

export async function staffLogoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = await getStaffSession();

  if (session && token) {
    // [SYS] Đóng Session
    await endWorkSession(session.id, token);
    await createAuditLog(session.id, "AUTH", "LOGOUT", {});
  }

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

// --- SECURE CRUD ACTIONS ---

async function requireAdmin() {
  const session = await getStaffSession();
  if (!session || session.role !== "admin") {
    throw new Error("Unauthorized: Bạn không có quyền quản trị.");
  }
  return session;
}

export async function getAllStaffAction() {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("staff_accounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Nếu là Staff thường, ẩn password_hash
  if (session.role !== "admin") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return data.map(({ password_hash, ...rest }) => ({
      ...rest,
      password_hash: "***",
    }));
  }

  return data;
}

export async function createStaffAction(payload: {
  username: string;
  password: string;
  full_name: string;
  role: StaffRole;
  phone?: string;
}) {
  try {
    await requireAdmin();

    const { username, password, full_name, role, phone } = payload;
    const { data: exist } = await supabase
      .from("staff_accounts")
      .select("id")
      .eq("username", username)
      .single();
    if (exist) return { success: false, error: "Tên đăng nhập đã tồn tại" };

    const password_hash = hashPassword(password);

    // [SYS] Insert Staff với Phone
    const { error } = await supabase.from("staff_accounts").insert({
      username,
      password_hash,
      full_name,
      role,
      phone, // Added in Schema
      is_active: true,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return { success: false, error: err };
  }
}

export async function getStaffBotPermissionsAction(staffId: string) {
  try {
    await requireAdmin();
    const { data, error } = await supabase
      .from("staff_bot_permissions")
      .select("bot_id, permission_type")
      .eq("staff_id", staffId);

    if (error) throw new Error(error.message);
    return { success: true, data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function assignBotPermissionAction(
  staffId: string,
  botId: string,
  permissionType: BotPermissionType,
) {
  try {
    await requireAdmin();
    const { error } = await supabase.from("staff_bot_permissions").upsert(
      {
        staff_id: staffId,
        bot_id: botId,
        permission_type: permissionType,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "staff_id, bot_id" }, // [NOTE] Check constraint name in DB
    );

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function revokeBotPermissionAction(
  staffId: string,
  botId: string,
) {
  try {
    await requireAdmin();
    const { error } = await supabase
      .from("staff_bot_permissions")
      .delete()
      .eq("staff_id", staffId)
      .eq("bot_id", botId);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
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
  try {
    await requireAdmin(); // Guard
    const { error } = await supabase
      .from("staff_accounts")
      .update(payload)
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return { success: false, error: err };
  }
}

export async function changeStaffPasswordAction(
  id: string,
  newPassword: string,
) {
  const session = await getStaffSession();
  if (!session) return { success: false, error: "Unauthorized" };

  // Admin đổi cho bất kỳ ai, Staff chỉ đổi cho chính mình
  if (session.role !== "admin" && session.id !== id) {
    return { success: false, error: "Bạn chỉ có thể đổi mật khẩu của mình." };
  }

  const password_hash = hashPassword(newPassword);
  const { error } = await supabase
    .from("staff_accounts")
    .update({ password_hash })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteStaffAction(id: string) {
  try {
    await requireAdmin(); // Guard
    const { error } = await supabase
      .from("staff_accounts")
      .delete()
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return { success: false, error: err };
  }
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

  // View Only: Quyền thấp nhất
  if (requiredType === "view_only") return true;

  // Chat: Cần quyền Chat hoặc Owner
  if (
    requiredType === "chat" &&
    (data.permission_type === "chat" || data.permission_type === "owner")
  )
    return true;

  // Owner: Cần quyền Owner
  if (requiredType === "owner" && data.permission_type === "owner") return true;

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
