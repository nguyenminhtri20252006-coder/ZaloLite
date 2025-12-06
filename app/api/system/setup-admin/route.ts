/**
 * app/api/system/setup-admin/route.ts
 * [TEMPORARY ENDPOINT] Dùng để khởi tạo tài khoản Admin đầu tiên.
 * Cần có SETUP_SECRET để bảo vệ.
 */

import { NextResponse } from "next/server";
import supabase from "@/lib/supabaseServer";
import { hashPassword } from "@/lib/utils/security";

// Khóa bí mật tạm thời để tránh người lạ gọi API này
const SETUP_SECRET = "zalolite-setup-secret-2024";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { secret, username, password, fullName } = body;

    // 1. Kiểm tra Secret Key
    if (secret !== SETUP_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized: Sai mã bí mật setup." },
        { status: 401 },
      );
    }

    if (!username || !password || !fullName) {
      return NextResponse.json(
        { error: "Thiếu thông tin (username, password, fullName)." },
        { status: 400 },
      );
    }

    // 2. Kiểm tra xem username đã tồn tại chưa
    const { data: existing } = await supabase
      .from("staff_accounts")
      .select("id")
      .eq("username", username)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `Tài khoản '${username}' đã tồn tại.` },
        { status: 409 },
      );
    }

    // 3. Mã hóa mật khẩu
    const hashedPassword = hashPassword(password);

    // 4. Insert vào DB
    const { data, error } = await supabase
      .from("staff_accounts")
      .insert({
        username,
        password_hash: hashedPassword,
        full_name: fullName,
        role: "admin",
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      message: "Tạo tài khoản Admin thành công!",
      data: {
        id: data.id,
        username: data.username,
        role: data.role,
      },
    });
  } catch (error: unknown) {
    // [FIX] Xử lý lỗi an toàn (Type Safe)
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Setup API] Error:", errorMessage);

    return NextResponse.json(
      { error: "Lỗi Server: " + errorMessage },
      { status: 500 },
    );
  }
}
