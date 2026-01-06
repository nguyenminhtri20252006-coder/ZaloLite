/**
 * lib/supabaseServer.ts
 * Dành riêng cho Server Actions/API Routes.
 * Sử dụng Service Role Key để bypass RLS (quyền Admin).
 */
import { createClient } from "@supabase/supabase-js";

// [FIX] Trim() để loại bỏ khoảng trắng thừa nếu có
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseServiceRoleKey) {
  // Console error để debug môi trường server (khi build logs không hiện ra client)
  console.error("Missing Supabase Env Vars:", {
    url: !!supabaseUrl,
    serviceKey: !!supabaseServiceRoleKey,
  });
  throw new Error("Missing Supabase Server Environment Variables");
}

const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  // [FIX] Ép buộc sử dụng native fetch của Next.js để tránh lỗi môi trường
  global: {
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        cache: "no-store", // Đảm bảo server actions không cache request DB
      });
    },
  },
});

export default supabaseServer;
