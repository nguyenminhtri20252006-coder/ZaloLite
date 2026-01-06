/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import supabase from "@/lib/supabaseServer"; // Dùng Service Role
import { hashPassword } from "@/lib/utils/security"; // [FIX] Import hash function

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, fullName } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Thiếu thông tin đăng ký" },
        { status: 400 },
      );
    }

    // 1. Kiểm tra xem đã có admin nào chưa (Double check)
    const { count } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Hệ thống đã có quản trị viên. Vui lòng đăng nhập." },
        { status: 403 },
      );
    }

    // 2. Tạo Admin đầu tiên
    // [FIX] Hash password trước khi lưu
    const hashedPassword = hashPassword(password);

    const { data, error } = await supabase
      .from("staff_accounts")
      .insert({
        username,
        password_hash: hashedPassword, // Lưu hashed password
        full_name: fullName || "System Admin",
        role: "admin",
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Setup Admin Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data });
  } catch (e: any) {
    console.error("API Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
