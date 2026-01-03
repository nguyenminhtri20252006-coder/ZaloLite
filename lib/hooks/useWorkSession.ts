/**
 * lib/hooks/useWorkSession.ts
 * [UPDATE] Handle 401 Unauthorized -> Force Logout.
 */

import { useEffect, useState } from "react";
import { getStaffSession } from "@/lib/actions/staff.actions";

const PING_INTERVAL = 5 * 60 * 1000; // 5 phút

export function useWorkSession() {
  const sendHeartbeat = async () => {
    try {
      const res = await fetch("/api/staff/heartbeat", {
        method: "POST",
      });

      // [NEW] Nếu server trả về 401 (do session timeout hoặc cookie hết hạn)
      if (res.status === 401) {
        console.warn("[WorkSession] Session expired. Redirecting to login...");
        // Xóa cookie (nếu cần thiết, dù server đã reject) và chuyển hướng
        window.location.href = "/login";
        return;
      }

      // console.log("[WorkSession] Ping sent successfully");
    } catch (e) {
      console.error("[WorkSession] Ping failed", e);
    }
  };
  useEffect(() => {
    // 1. Ping ngay lập tức
    sendHeartbeat();

    // 2. Thiết lập interval
    const intervalId = setInterval(sendHeartbeat, PING_INTERVAL);

    // Cleanup
    return () => clearInterval(intervalId);
  }, []);
}

// [NEW] Hook để lấy thông tin Staff hiện tại
export function useStaffAuth() {
  const [staff, setStaff] = useState<{
    id: string;
    role: string;
    username: string;
    full_name: string;
    avatar?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const session = await getStaffSession();
        if (session) {
          setStaff(session);
        }
      } catch (error) {
        console.error("Failed to fetch staff session:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, []);

  return { staff, loading };
}
