/**
 * lib/supabaseServer.ts
 * Dành riêng cho Server Actions/API Routes.
 * Sử dụng Service Role Key để bypass RLS (quyền Admin).
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- DEBUG BLOCK (Xóa sau khi fix xong) ---
console.log("---------------------------------------------------");
console.log("[Supabase Server Init]");
console.log("URL:", supabaseUrl ? "✅ Loaded" : "❌ MISSING");
console.log("Service Key Exists:", supabaseServiceRoleKey ? "✅ Yes" : "❌ NO");
if (supabaseServiceRoleKey) {
  // In 5 ký tự đầu/cuối để kiểm tra xem có copy nhầm Anon Key không
  // Service Key thường bắt đầu giống Anon nhưng dài hơn, hoặc khác hẳn.
  console.log(
    "Key Preview:",
    supabaseServiceRoleKey.substring(0, 10) +
      "..." +
      supabaseServiceRoleKey.slice(-5),
  );
}
console.log("---------------------------------------------------");
// -----------------------------------------------------------

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase Server Environment Variables");
}

const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export default supabaseServer;
