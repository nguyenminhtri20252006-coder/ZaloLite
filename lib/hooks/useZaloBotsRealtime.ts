/**
 * lib/hooks/useZaloBotsRealtime.ts
 * [FIXED] Sử dụng default export instance từ supabaseClient.
 */

import { useEffect, useState } from "react";
// Import instance trực tiếp, không dùng createClient()
import supabase from "@/lib/supabaseClient";
import { ZaloBot } from "@/lib/types/database.types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useZaloBotsRealtime(initialBots: ZaloBot[]) {
  const [bots, setBots] = useState<ZaloBot[]>(initialBots);

  useEffect(() => {
    setBots(initialBots);
  }, [initialBots]);

  useEffect(() => {
    console.log("[Realtime] 🔌 Subscribing to 'zalo_bots'...");

    // Dùng trực tiếp biến supabase đã import
    const channel = supabase
      .channel("realtime-zalo-bots")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zalo_bots",
        },
        (payload: RealtimePostgresChangesPayload<ZaloBot>) => {
          if (payload.eventType === "UPDATE") {
            const updatedBot = payload.new;
            setBots((prev) =>
              prev.map((b) => (b.id === updatedBot.id ? updatedBot : b)),
            );
          } else if (payload.eventType === "INSERT") {
            const newBot = payload.new;
            setBots((prev) => [newBot, ...prev]);
          } else if (payload.eventType === "DELETE") {
            const oldRecord = payload.old as Partial<ZaloBot>;
            if (oldRecord && oldRecord.id) {
              setBots((prev) => prev.filter((b) => b.id !== oldRecord.id));
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] ✅ Connected to Zalo Bots channel.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return bots;
}
