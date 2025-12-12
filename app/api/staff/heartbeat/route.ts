/**
 * app/api/staff/heartbeat/route.ts
 * [TRACKING UPDATE]
 * - Check timeout: Nếu last_ping_at > 10 phút -> Vô hiệu hóa session (Logout).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import supabase from "@/lib/supabaseServer";
import { getStaffSession } from "@/lib/actions/staff.actions";
import { hashSessionToken } from "@/lib/utils/security"; // [UPDATE] Import

// Ngưỡng timeout (10 phút)
const MAX_INACTIVE_TIME_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const session = await getStaffSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const rawToken = cookieStore.get("staff_session")?.value;

    if (!rawToken) {
      return NextResponse.json({ error: "Missing Token" }, { status: 400 });
    }

    const tokenHash = hashSessionToken(rawToken);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // Tìm session ĐANG MỞ khớp với TOKEN HASH
    const { data: activeSession } = await supabase
      .from("work_sessions")
      .select("id, last_ping_at")
      .eq("staff_id", session.id)
      .eq("session_token_hash", tokenHash)
      .is("ended_at", null)
      .single();

    if (activeSession) {
      const lastPingTime = new Date(activeSession.last_ping_at).getTime();
      const now = Date.now();

      // [NEW] Logic kiểm tra Inactive Timeout
      if (now - lastPingTime > MAX_INACTIVE_TIME_MS) {
        console.log(
          `[Heartbeat] Session timeout for user ${session.username}. Inactive > 10m.`,
        );

        // Đóng session
        await supabase
          .from("work_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", activeSession.id);

        // Trả về 401 để Client tự logout
        return NextResponse.json(
          { error: "Session Expired (Inactive > 10m)" },
          { status: 401 },
        );
      }

      // Nếu còn active -> Update Heartbeat
      await supabase
        .from("work_sessions")
        .update({
          last_ping_at: new Date().toISOString(),
          ip_address: ip,
          user_agent: userAgent,
        })
        .eq("id", activeSession.id);
    } else {
      // Trường hợp không tìm thấy session mở (DB bị xóa hoặc lỗi),
      // ta tạo mới để duy trì tracking (Fail-safe)
      await supabase.from("work_sessions").insert({
        staff_id: session.id,
        started_at: new Date().toISOString(),
        last_ping_at: new Date().toISOString(),
        session_token_hash: tokenHash,
        user_agent: userAgent,
        ip_address: ip,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Heartbeat] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
