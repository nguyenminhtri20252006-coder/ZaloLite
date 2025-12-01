"use server";

import {
  getAccountByUsername,
  createSession,
  deleteSession,
} from "@/lib/models/system-auth.model";
import { verifyPassword, generateRandomString } from "@/lib/utils/security";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE_NAME = "parent_online_session";
const SESSION_DURATION_DAYS = 7;

// Định nghĩa kiểu State trả về để type-safe
type LoginState = {
  error: string;
};

/**
 * Xử lý đăng nhập từ Form
 * SỬA LỖI: Thêm tham số `prevState` vào đầu tiên để khớp với useActionState
 */
export async function loginAction(
  prevState: LoginState | undefined | null, // <-- THÊM THAM SỐ NÀY
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Vui lòng nhập đầy đủ thông tin." };
  }

  try {
    // 1. Tìm tài khoản
    const account = await getAccountByUsername(username);

    if (!account || !account.is_active) {
      return { error: "Tài khoản không tồn tại hoặc bị khóa." };
    }

    // 2. Kiểm tra mật khẩu
    const isValid = verifyPassword(
      password,
      account.password_hash,
      account.salt || "",
    );
    if (!isValid) {
      return { error: "Mật khẩu không chính xác." };
    }

    // 3. Tạo Session Token
    const token = generateRandomString(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    await createSession(account.id, token, expiresAt);

    // 4. Lưu Cookie (Secure, HTTPOnly)
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
      sameSite: "lax",
    });
  } catch (error) {
    console.error("Login Error:", error);
    return { error: "Lỗi hệ thống. Vui lòng thử lại sau." };
  }

  // 5. Redirect (Phải nằm ngoài khối try/catch trong Next.js actions)
  redirect("/dashboard");
}

/**
 * Xử lý đăng xuất
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Xóa trong DB
    await deleteSession(token);
  }

  // Xóa Cookie
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

/**
 * Lấy thông tin Session hiện tại (dùng cho Middleware/Layout)
 * Lưu ý: Helper này nên được gọi ở Server Components
 */
export async function getCurrentSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}
