/**
 * lib/hooks/useWorkSession.ts
 * [UPDATE] Handle 401 Unauthorized -> Force Logout.
 */

import { useEffect } from "react";

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
