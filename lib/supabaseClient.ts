/**
 * lib/supabaseClient.ts
 * Dành cho Client Components (Realtime, Auth, Public Data).
 * Sử dụng Anon Key (An toàn, tuân thủ RLS).
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase Client Environment Variables (NEXT_PUBLIC_...)",
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
