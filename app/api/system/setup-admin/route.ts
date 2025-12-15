/**
 * app/api/system/setup-admin/route.ts
 * [SECURE UPDATE] Chỉ cho phép chạy khi chưa có tài khoản nào.
 */

import { NextResponse } from "next/server";
import supabase from "@/lib/supabaseServer";
import { hashPassword } from "@/lib/utils/security";

export async function POST(req: Request) {
  try {
    // 1. Kiểm tra xem hệ thống đã khởi tạo chưa
    const { count } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Forbidden: Hệ thống đã có quản trị viên." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { username, password, fullName } = body;

    if (!username || !password || !fullName) {
      return NextResponse.json(
        { error: "Thiếu thông tin (username, password, fullName)." },
        { status: 400 },
      );
    }

    // 2. Tạo Admin
    const hashedPassword = hashPassword(password);

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
      message: "Khởi tạo Admin đầu tiên thành công.",
      data: { id: data.id, username: data.username },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Lỗi Server: " + errorMessage },
      { status: 500 },
    );
  }
}
