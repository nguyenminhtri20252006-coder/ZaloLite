/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient";
import { ZaloBot } from "@/lib/types/database.types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface BotInfoRecord {
  id: string;
  status: any;
  is_active: boolean;
  is_realtime_active: boolean;
  health_check_log: any;
  qr_code?: string;
  updated_at?: string;
}

type UIBot = ZaloBot & {
  bot_info_id?: string;
  status?: any;
  is_active?: boolean;
  is_realtime_active?: boolean;
  health_check_log?: any;
};

export function useZaloBotsRealtime(initialBots: ZaloBot[]) {
  const [bots, setBots] = useState<UIBot[]>(initialBots as UIBot[]);

  // [FIX] Sử dụng pattern "Derived State" chuẩn của React
  // Theo dõi prop bằng state (thay vì ref) để so sánh an toàn
  const [prevInitialBotsJson, setPrevInitialBotsJson] = useState(
    JSON.stringify(initialBots),
  );

  const currentJson = JSON.stringify(initialBots);

  // Kiểm tra ngay trong quá trình render
  if (currentJson !== prevInitialBotsJson) {
    console.log(
      "[Realtime] Syncing new initialBots from server (Derived State)",
    );
    setPrevInitialBotsJson(currentJson);
    setBots(initialBots as UIBot[]);
    // React sẽ restart render ngay tại đây, không chạy xuống dưới -> Hiệu năng tốt, không lỗi Effect
  }

  useEffect(() => {
    console.log("[Realtime] 🔌 Subscribing to 'zalo_bot_info' changes...");

    const channel = supabase
      .channel("realtime-zalo-bots-tracking")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "zalo_bot_info",
        },
        (payload: RealtimePostgresChangesPayload<BotInfoRecord>) => {
          if (payload.eventType === "UPDATE") {
            const updatedInfo = payload.new;
            // Fallback lấy ID từ old nếu new thiếu (do cấu hình REPLICA)
            const recordId = updatedInfo.id || (payload.old as any)?.id;

            if (!recordId) return;

            setBots((prevBots) => {
              const targetBot = prevBots.find(
                (b) => b.bot_info_id === recordId,
              );

              if (!targetBot) return prevBots;

              return prevBots.map((b) => {
                if (b.bot_info_id === recordId) {
                  return {
                    ...b,
                    status: updatedInfo.status || b.status,
                    is_active: updatedInfo.is_active ?? b.is_active,
                    is_realtime_active:
                      updatedInfo.is_realtime_active ?? b.is_realtime_active,
                    health_check_log:
                      updatedInfo.health_check_log || b.health_check_log,
                  };
                }
                return b;
              });
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return bots;
}
