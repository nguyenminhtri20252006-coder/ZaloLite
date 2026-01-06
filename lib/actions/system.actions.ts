/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import supabase from "@/lib/supabaseServer";
import { hashPassword } from "@/lib/utils/security"; // [FIX] Import hàm hash

// --- Types ---
export type SetupState = {
  message?: string;
  error?: string;
  success?: boolean;
};

// --- Check System ---
export async function checkSystemInitialized() {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  console.log(
    `[SystemCheck] Starting Check... URL: ${sbUrl ? "Defined" : "Missing"}`,
  );

  // [DEBUG] Key Validation Log (Masked)
  if (sbKey && anonKey) {
    const sbKeyPrefix = sbKey.substring(0, 10) + "..." + sbKey.slice(-5);
    const anonKeyPrefix = anonKey.substring(0, 10) + "..." + anonKey.slice(-5);

    console.log(`[SystemCheck] Key Inspection:`);
    console.log(`   - ANON Key (Public): ${anonKeyPrefix}`);
    console.log(`   - SERVICE Key (Admin): ${sbKeyPrefix}`);

    if (sbKey === anonKey) {
      console.error(
        `[SystemCheck] 🚨 CRITICAL ERROR: SUPABASE_SERVICE_ROLE_KEY is identical to ANON KEY!`,
      );
      console.error(
        `[SystemCheck] 🚨 You must use the 'service_role' (secret) key from Supabase Dashboard.`,
      );
      throw new Error(
        "Configuration Error: Service Role Key is incorrect (Duplicate of Anon Key). Check server logs.",
      );
    }
  }

  // 1. Network Connectivity Check (Ping Test)
  if (sbUrl) {
    try {
      const pingUrl = `${sbUrl}/rest/v1/`;
      console.log(`[SystemCheck] 1. Pinging Root: ${pingUrl}`);

      const res = await fetch(pingUrl, {
        method: "HEAD",
        headers: {
          apikey: sbKey || "",
          Authorization: `Bearer ${sbKey}`,
        },
        cache: "no-store",
      });

      console.log(
        `[SystemCheck] 1. Root Status: ${res.status} ${res.statusText}`,
      );
    } catch (netErr: any) {
      console.error("[SystemCheck] Network Connectivity Error:", netErr);
      const detail = netErr.cause
        ? JSON.stringify(netErr.cause)
        : netErr.message;
      throw new Error(
        `CRITICAL NETWORK ERROR: Cannot reach Supabase at ${sbUrl}. Details: ${detail}`,
      );
    }

    // 2. Raw Data Query
    try {
      console.log(`[SystemCheck] 2. Raw Data Query (staff_accounts)...`);
      const dataUrl = `${sbUrl}/rest/v1/staff_accounts?select=count&limit=1`;
      const res = await fetch(dataUrl, {
        method: "GET",
        headers: {
          apikey: sbKey || "",
          Authorization: `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          Prefer: "count=exact,head=true",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[SystemCheck] 2. Raw Query Failed: ${res.status}`, text);
        if (res.status === 403 || res.status === 401) {
          throw new Error(
            `Permission Denied (HTTP ${res.status}). Verify SUPABASE_SERVICE_ROLE_KEY.`,
          );
        }
        throw new Error(`Raw Query Failed: ${res.status} - ${text}`);
      }

      const range = res.headers.get("content-range");
      console.log(`[SystemCheck] 2. Raw Query Success. Range: ${range}`);
    } catch (rawErr: any) {
      console.error("[SystemCheck] 2. Raw Query Exception:", rawErr);
      throw new Error(`Database Connection Error: ${rawErr.message}`);
    }
  }

  // 3. Database Query Check (Via Client)
  try {
    console.log("[SystemCheck] 3. Client Query (staff_accounts)...");

    const { count, error } = await supabase
      .from("staff_accounts")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error(
        "[SystemCheck] Client Error Raw:",
        JSON.stringify(error, null, 2),
      );
      const errorMsg = error.message || JSON.stringify(error);
      throw new Error(`Client Query Failed: ${errorMsg}`);
    }

    const isInitialized = (count || 0) > 0;
    console.log(
      `[SystemCheck] Final Result -> Staff count: ${count}. Initialized: ${isInitialized}`,
    );

    return { initialized: isInitialized };
  } catch (e: any) {
    console.error("[SystemCheck] Exception:", e);
    throw new Error(e.message || "Failed to check system status");
  }
}

// --- Create First Admin (Internal Logic) ---
export async function createFirstAdmin(data: any) {
  // 1. Double check: Chỉ cho phép tạo nếu chưa có ai
  const { count } = await supabase
    .from("staff_accounts")
    .select("*", { count: "exact", head: true });

  if (count && count > 0) {
    return {
      success: false,
      error: "Hệ thống đã được khởi tạo. Vui lòng đăng nhập.",
    };
  }

  // [FIX] Hash password trước khi lưu
  const hashedPassword = hashPassword(data.password);

  // 2. Tạo Admin
  const { data: newAdmin, error } = await supabase
    .from("staff_accounts")
    .insert({
      username: data.username,
      password_hash: hashedPassword, // Sử dụng hashed password
      full_name: data.fullName,
      role: "admin",
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[CreateAdmin] Error:", error);
    return { success: false, error: error.message };
  }

  return { success: true, data: newAdmin };
}

// --- Setup Action (For Login Form) ---
export async function setupFirstAdminAction(
  prevState: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  if (!username || !password) {
    return { error: "Vui lòng nhập đủ thông tin" };
  }

  try {
    const res = await createFirstAdmin({ username, password, fullName });
    if (res.success) {
      return {
        success: true,
        message: "Khởi tạo thành công! Vui lòng đăng nhập.",
      };
    } else {
      return { error: res.error || "Lỗi khởi tạo" };
    }
  } catch (e: any) {
    return { error: e.message };
  }
}
