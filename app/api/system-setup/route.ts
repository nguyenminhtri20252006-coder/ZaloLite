/**
 * app/api/system-setup/route.ts
 * Endpoint đặc biệt để khởi tạo tài khoản Admin đầu tiên.
 * Cần bảo mật endpoint này sau khi deploy (hoặc xóa đi).
 */
import { NextRequest, NextResponse } from "next/server";
import { createProfile } from "@/lib/models/profile.model";
import {
  createSystemAccount,
  getAccountByUsername,
} from "@/lib/models/system-auth.model";
import { hashPassword } from "@/lib/utils/security";

export async function GET(request: NextRequest) {
  try {
    // 1. Kiểm tra xem đã có admin nào chưa (tránh bị reset)
    const existingAdmin = await getAccountByUsername("admin");
    if (existingAdmin) {
      return NextResponse.json(
        { error: "Hệ thống đã có tài khoản Admin. Không thể khởi tạo lại." },
        { status: 403 },
      );
    }

    // 2. Tạo Profile gốc
    const profile = await createProfile({
      zalo_uid: "system_admin_01", // Fake UID
      display_name: "System Administrator",
      email: "admin@parentonline.com",
      status: "active",
      zalo_name: "Admin",
    });

    // 3. Mã hóa mật khẩu mặc định
    // Mật khẩu mặc định là: admin123 (Bạn nên đổi ngay sau khi login)
    const { hash, salt } = hashPassword("admin123");

    // 4. Tạo System Account
    const account = await createSystemAccount({
      profile_id: profile.id,
      username: "admin",
      password_hash: hash,
      salt: salt,
      role: "admin", // Full quyền
      is_active: true,
    });

    return NextResponse.json({
      success: true,
      message: "Đã khởi tạo Admin thành công.",
      credentials: {
        username: "admin",
        password: "admin123",
      },
      account_id: account.id,
    });
  } catch (error: unknown) {
    // SỬA LỖI: Thay 'any' bằng 'unknown' và kiểm tra kiểu dữ liệu an toàn
    const errorMessage =
      error instanceof Error ? error.message : "Lỗi không xác định";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
