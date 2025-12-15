/**
 * lib/hooks/useZaloBotsRealtime.ts
 * [FIXED] Sửa lỗi import supabaseClient và thêm Type definition.
 */

import { useEffect, useState } from "react";
// [FIX 1] Import default thay vì { createClient }
// Giả định file này export default supabase instance.
// Nếu export const supabase thì cần đổi thành import { supabase } from ...
import supabaseClient from "@/lib/supabaseClient";
import { ZaloBot } from "@/lib/types/database.types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useZaloBotsRealtime(initialBots: ZaloBot[]) {
  const [bots, setBots] = useState<ZaloBot[]>(initialBots);

  // [FIX 1 Logic] Nếu supabaseClient là hàm thì gọi, nếu là object thì dùng luôn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase =
    typeof supabaseClient === "function"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabaseClient as any)()
      : supabaseClient;

  // Đồng bộ lại state nếu props initialBots thay đổi
  useEffect(() => {
    setBots(initialBots);
  }, [initialBots]);

  useEffect(() => {
    console.log("[Realtime] 🔌 Subscribing to 'zalo_bots'...");

    const channel = supabase
      .channel("realtime-zalo-bots")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zalo_bots",
        },
        // [FIX 2] Thêm type cho payload
        (payload: RealtimePostgresChangesPayload<ZaloBot>) => {
          console.log("[Realtime] ⚡ Event received:", payload.eventType);

          if (payload.eventType === "UPDATE") {
            const updatedBot = payload.new as ZaloBot;
            setBots((prev) =>
              prev.map((b) => (b.id === updatedBot.id ? updatedBot : b)),
            );
          } else if (payload.eventType === "INSERT") {
            const newBot = payload.new as ZaloBot;
            setBots((prev) => [newBot, ...prev]);
          } else if (payload.eventType === "DELETE") {
            // payload.old có thể chỉ chứa ID hoặc object tùy cấu hình Replica Identity
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldRecord = payload.old as any;
            if (oldRecord && oldRecord.id) {
              setBots((prev) => prev.filter((b) => b.id !== oldRecord.id));
            } else {
              console.warn("[Realtime] Delete event received but ID missing.");
            }
          }
        },
      )
      // [FIX 3] Thêm type cho status
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] ✅ Connected to Zalo Bots channel.");
        }
      });

    return () => {
      console.log("[Realtime] 🔌 Unsubscribing...");
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return bots;
}
