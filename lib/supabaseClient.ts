/**
 * lib/supabaseClient.ts
 *
 * (TỆP MỚI)
 * Lớp Kết nối (Connection Layer).
 * Khởi tạo và export Supabase client (singleton) cho toàn bộ server-side.
 */
import { createClient } from "@supabase/supabase-js";

// Đảm bảo bạn đã thêm các biến này vào tệp .env.local
// (Bạn có thể lấy chúng từ Cài đặt > API trong Supabase project)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL");
}
if (!supabaseServiceRoleKey) {
  throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * Khởi tạo client Supabase.
 * Chúng ta sử dụng 'service_role key' ở đây vì logic này
 * (Lớp 2, Lớp 3) chỉ chạy trên Server.
 * Điều này cho phép chúng ta bỏ qua các chính sách RLS (Row Level Security)
 * một cách an toàn.
 */
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    // Tắt auto-refresh token (không cần thiết cho server-side role)
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Export client singleton
export default supabase;
