/**
 * setup-admin.mjs
 * Script Node.js để gọi API tạo Admin.
 * Cách dùng:
 * 1. Mở terminal tại thư mục dự án.
 * 2. Chạy lệnh: node setup-admin.mjs
 */

const API_URL = "http://localhost:3000/api/system/setup-admin";

// --- CẤU HÌNH TÀI KHOẢN ADMIN MONG MUỐN ---
const ADMIN_CONFIG = {
  username: "admin", // Tên đăng nhập
  password: "admin123", // Mật khẩu (Nên đặt mạnh hơn)
  fullName: "System Administrator",
  secret: "zalolite-setup-secret-2024", // Khớp với file API route
};

async function runSetup() {
  console.log("🚀 Đang khởi tạo tài khoản Admin...");
  console.log(`   Target: ${API_URL}`);
  console.log(`   User:   ${ADMIN_CONFIG.username}`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ADMIN_CONFIG),
    });

    const result = await response.json();

    if (response.ok) {
      console.log("\n✅ THÀNH CÔNG!");
      console.log("   Thông tin tài khoản đã được lưu vào Database.");
      console.log("   ID:", result.data.id);
      console.log(
        "\n👉 Bạn có thể đăng nhập ngay tại: http://localhost:3000/login",
      );
    } else {
      console.error("\n❌ THẤT BẠI:", result.error);
    }
  } catch (error) {
    console.error("\n❌ LỖI KẾT NỐI:", error.message);
    console.log("   (Đảm bảo server Next.js đang chạy ở cổng 3000)");
  }
}

runSetup();
