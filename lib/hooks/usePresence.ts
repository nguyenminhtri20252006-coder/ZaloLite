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
  active_bot_id?: string | null;
  viewing_thread_id?: string | null;
  is_typing?: boolean;
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

    // Dùng trực tiếp biến supabase đã import
    const channel = supabase.channel("global_presence", {
      config: {
        presence: {
          key: staffId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const newState = channel.presenceState<PresenceState>();
        const peerList = Object.values(newState)
          .map((states) => states[0])
          .filter((p) => p.staff_id !== staffId);

        setPeers(peerList);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Gửi trạng thái ban đầu lên server
          await channel.track(myState);
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

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
    peers,
    myState,
    updateStatus,
  };
}
