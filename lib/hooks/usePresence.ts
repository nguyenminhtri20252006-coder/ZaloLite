/**
 * lib/hooks/usePresence.ts
 * [CORE HOOK] Quản lý trạng thái hiện diện của nhân viên (Staff Presence).
 * Sử dụng Supabase Realtime để đồng bộ: Ai đang online? Ai đang xem khách nào?
 */

import { useEffect, useState, useRef } from "react";
import supabase from "@/lib/supabaseClient";
import { RealtimeChannel } from "@supabase/supabase-js";

// Định nghĩa trạng thái của một nhân viên
export type PresenceState = {
  staff_id: string;
  username: string;
  full_name: string;
  role: string;
  avatar?: string;

  // Trạng thái động
  online_at: string;
  active_bot_id?: string | null; // Đang làm việc trên Bot nào?
  viewing_thread_id?: string | null; // Đang xem hội thoại nào?
  is_typing?: boolean; // Đang gõ phím?
};

type UsePresenceProps = {
  staffId: string;
  username: string;
  fullName: string;
  role: string;
  avatar?: string;
};

export function usePresence({
  staffId,
  username,
  fullName,
  role,
  avatar,
}: UsePresenceProps) {
  const [peers, setPeers] = useState<PresenceState[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // State cục bộ của người dùng hiện tại
  const [myState, setMyState] = useState<PresenceState>({
    staff_id: staffId,
    username,
    full_name: fullName,
    role,
    avatar,
    online_at: new Date().toISOString(),
    active_bot_id: null,
    viewing_thread_id: null,
    is_typing: false,
  });

  // 1. Khởi tạo Channel Presence
  useEffect(() => {
    if (!staffId) return;

    console.log("[Presence] Initializing channel for:", username);

    // Kênh 'global_presence' dùng chung cho toàn bộ hệ thống
    const channel = supabase.channel("global_presence", {
      config: {
        presence: {
          key: staffId, // Khóa định danh unique cho user này trong channel
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        // Lấy danh sách state của tất cả user khác
        const newState = channel.presenceState<PresenceState>();

        // Flatten object state (vì Supabase trả về dạng { id: [state, state...] })
        // Mỗi user chỉ có 1 state mới nhất, nên ta lấy phần tử [0]
        const peerList = Object.values(newState)
          .map((states) => states[0])
          .filter((p) => p.staff_id !== staffId); // Loại bỏ bản thân mình khỏi danh sách peers

        setPeers(peerList);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        console.log("[Presence] User joined:", key, newPresences);
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        console.log("[Presence] User left:", key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Gửi trạng thái ban đầu lên server
          await channel.track(myState);
        }
      });

    channelRef.current = channel;

    return () => {
      console.log("[Presence] Disconnecting...");
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]); // Chỉ chạy lại khi staffId thay đổi (login/logout)

  // 2. Hàm cập nhật trạng thái (để UI gọi)
  const updateStatus = async (patch: Partial<PresenceState>) => {
    if (!channelRef.current) return;

    const newState = {
      ...myState,
      ...patch,
      online_at: new Date().toISOString(),
    };
    setMyState(newState);

    try {
      await channelRef.current.track(newState);
    } catch (err) {
      console.error("[Presence] Track error:", err);
    }
  };

  return {
    peers, // Danh sách đồng nghiệp đang online
    myState, // Trạng thái hiện tại của mình
    updateStatus, // Hàm cập nhật trạng thái
  };
}
