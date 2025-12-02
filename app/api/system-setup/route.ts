/**
 * app/api/system-setup/route.ts
 * Endpoint khởi tạo tài khoản Admin đầu tiên cho hệ thống ZaloLite CRM.
 * Logic: Tạo record trong bảng `staff_accounts`.
 * Warning: Hãy xóa hoặc bảo vệ endpoint này sau khi deploy production.
 */
import { NextRequest, NextResponse } from "next/server";
import supabase from "@/lib/supabaseClient";
import { hashPassword } from "@/lib/utils/security";

export async function GET(request: NextRequest) {
  try {
    console.log("[System Setup] Đang kiểm tra tài khoản Admin...");

    // 1. Kiểm tra xem đã có admin nào chưa
    const { data: existingAdmin, error: checkError } = await supabase
      .from("staff_accounts")
      .select("id")
      .eq("username", "admin")
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116: No rows found -> Là trạng thái tốt để tạo mới
      throw new Error("Lỗi kiểm tra DB: " + checkError.message);
    }

    if (existingAdmin) {
      return NextResponse.json(
        { error: "Hệ thống đã có tài khoản Admin. Không thể khởi tạo lại." },
        { status: 403 },
      );
    }

    // 2. Tạo password hash
    // Mật khẩu mặc định: admin123
    const passwordHash = hashPassword("admin123");

    // 3. Insert Admin vào bảng staff_accounts
    const { data: newAdmin, error: createError } = await supabase
      .from("staff_accounts")
      .insert({
        username: "admin",
        password_hash: passwordHash,
        full_name: "Super Administrator",
        role: "admin",
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      throw new Error("Lỗi tạo Admin: " + createError.message);
    }

    console.log("[System Setup] Khởi tạo thành công:", newAdmin.id);

    return NextResponse.json({
      success: true,
      message: "Đã khởi tạo Admin thành công.",
      credentials: {
        username: "admin",
        password: "admin123",
      },
      staff_id: newAdmin.id,
    });
  } catch (error: any) {
    console.error("[System Setup] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Lỗi không xác định" },
      { status: 500 },
    );
  }
}

// Luôn chạy động để không bị cache kết quả cũ
export const dynamic = "force-dynamic";
