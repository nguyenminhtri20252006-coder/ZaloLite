/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import supabase from "@/lib/supabaseServer"; // Sử dụng Service Role (Admin) để bypass RLS

// --- Types ---
export type SetupState = {
  message?: string;
  error?: string;
  success?: boolean;
};

// --- Check System ---
export async function checkSystemInitialized() {
  try {
    // Sử dụng Service Role để đếm chính xác số lượng tài khoản
    const { count, error } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error(
        "[SystemCheck] Database Error:",
        JSON.stringify(error, null, 2),
      );
      throw new Error(`Database Error: ${error.message}`);
    }

    // Nếu count > 0 nghĩa là đã có admin/staff -> Hệ thống đã khởi tạo
    const isInitialized = (count || 0) > 0;
    console.log(
      `[SystemCheck] Staff count: ${count}. Initialized: ${isInitialized}`,
    );

    return { initialized: isInitialized };
  } catch (e: any) {
    console.error("[SystemCheck] Exception:", e);
    // Trả về false để an toàn, cho phép thử setup lại hoặc hiện lỗi
    throw new Error(e.message || "Failed to check system status");
  }
}

// --- Create First Admin (Internal Logic) ---
export async function createFirstAdmin(data: any) {
  // 1. Double check: Chỉ cho phép tạo nếu chưa có ai
  const { count } = await supabase
    .from("staff_accounts")
    .select("*", { count: "exact", head: true });

  if (count && count > 0) {
    return {
      success: false,
      error: "Hệ thống đã được khởi tạo. Vui lòng đăng nhập.",
    };
  }

  // 2. Tạo Admin
  const { data: newAdmin, error } = await supabase
    .from("staff_accounts")
    .insert({
      username: data.username,
      password_hash: data.password,
      full_name: data.fullName,
      role: "admin",
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[CreateAdmin] Error:", error);
    return { success: false, error: error.message };
  }

  return { success: true, data: newAdmin };
}

// --- Setup Action (For Login Form) ---
// [FIX] Khôi phục hàm này để Login Page gọi được
export async function setupFirstAdminAction(
  prevState: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  if (!username || !password) {
    return { error: "Vui lòng nhập đủ thông tin" };
  }

  try {
    const res = await createFirstAdmin({ username, password, fullName });
    if (res.success) {
      return {
        success: true,
        message: "Khởi tạo thành công! Vui lòng đăng nhập.",
      };
    } else {
      return { error: res.error || "Lỗi khởi tạo" };
    }
  } catch (e: any) {
    return { error: e.message };
  }
}
