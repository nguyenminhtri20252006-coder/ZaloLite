"use server";

import supabase from "@/lib/supabaseServer";
import { hashPassword } from "@/lib/utils/security";
import { revalidatePath } from "next/cache";

/**
 * Kiểm tra xem hệ thống đã được khởi tạo chưa (đã có tài khoản nào chưa).
 */
export async function checkSystemInitialized() {
  try {
    const { count, error } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (error) throw new Error(error.message);

    // Nếu count > 0 nghĩa là đã khởi tạo
    return { initialized: (count || 0) > 0 };
  } catch (error) {
    console.error("Check Init Error:", error);
    // Nếu lỗi kết nối DB, mặc định trả về true để không lộ form đăng ký
    return { initialized: true, error: "Lỗi kết nối CSDL" };
  }
}

// Định nghĩa type cho State trả về
export type SetupState = {
  error?: string;
  success?: boolean;
  message?: string;
};

/**
 * Action tạo tài khoản Admin đầu tiên (Setup Wizard).
 */
// Thay 'any' bằng 'SetupState | null' hoặc 'unknown'
export async function setupFirstAdminAction(
  prevState: SetupState | null,
  formData: FormData,
): Promise<SetupState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  if (!username || !password || !fullName) {
    return { error: "Vui lòng điền đầy đủ thông tin." };
  }

  try {
    // 1. Double Check: Đảm bảo chưa có ai trong DB
    const { count } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (count && count > 0) {
      return { error: "Hệ thống đã được khởi tạo. Vui lòng đăng nhập." };
    }

    // 2. Tạo Admin
    const hashedPassword = hashPassword(password);

    const { error } = await supabase.from("staff_accounts").insert({
      username,
      password_hash: hashedPassword,
      full_name: fullName,
      role: "admin", // Bắt buộc là Admin
      is_active: true,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/login");
    return { success: true, message: "Khởi tạo thành công! Hãy đăng nhập." };
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    return { error: err || "Lỗi hệ thống." };
  }
}
