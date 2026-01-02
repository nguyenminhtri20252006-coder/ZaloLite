/**
 * app/api/system/setup-admin/route.ts
 * [SECURE UPDATE V2.5]
 * - Logic: Chỉ cho phép chạy khi hệ thống CHƯA CÓ bất kỳ tài khoản nào.
 * - Map đúng field Database V6 (full_name, phone).
 */

import { NextResponse } from "next/server";
import supabase from "@/lib/supabaseServer";
import { hashPassword } from "@/lib/utils/security";

export async function POST(req: Request) {
  console.log("[SetupAdmin] Đang kiểm tra điều kiện khởi tạo...");

  try {
    // 1. Kiểm tra xem hệ thống đã khởi tạo chưa (Đếm số lượng staff)
    // count: 'exact' giúp đếm chính xác số rows
    const { count, error: countError } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("[SetupAdmin] DB Error:", countError);
      return NextResponse.json(
        { error: "Lỗi kết nối Database kiểm tra: " + countError.message },
        { status: 500 },
      );
    }

    // Nếu đã có bất kỳ tài khoản nào -> Chặn ngay lập tức
    if (count !== null && count > 0) {
      console.warn("[SetupAdmin] Blocked: Hệ thống đã có quản trị viên.");
      return NextResponse.json(
        { error: "Forbidden: Hệ thống đã được khởi tạo. Vui lòng đăng nhập." },
        { status: 403 },
      );
    }

    // 2. Parse Body từ Client gửi lên
    const body = await req.json();
    const { username, password, fullName, phone } = body;

    // Validate input cơ bản
    if (!username || !password || !fullName) {
      return NextResponse.json(
        { error: "Thiếu thông tin bắt buộc (username, password, fullName)." },
        { status: 400 },
      );
    }

    // 3. Tạo Admin đầu tiên
    console.log(`[SetupAdmin] Đang tạo tài khoản Admin: ${username}`);
    const hashedPassword = hashPassword(password);

    const { data, error } = await supabase
      .from("staff_accounts")
      .insert({
        username: username,
        password_hash: hashedPassword,
        full_name: fullName, // Map JSON 'fullName' -> DB 'full_name'
        role: "admin", // Bắt buộc là Admin
        phone: phone || null, // Optional
        is_active: true,
      })
      .select("id, username, role")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // 4. (Optional) Tạo Audit Log khởi tạo
    await supabase.from("audit_logs").insert({
      staff_id: data.id, // Admin vừa tạo
      action_group: "SYSTEM",
      action_type: "SETUP_INIT",
      payload: { message: "System initialized via Setup Wizard" },
    });

    return NextResponse.json({
      success: true,
      message: "Khởi tạo Admin đầu tiên thành công.",
      data: data,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SetupAdmin] Exception:", errorMessage);
    return NextResponse.json(
      { error: "Lỗi Server: " + errorMessage },
      { status: 500 },
    );
  }
}
