"use client";

import { useState, useEffect, useRef } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import { BotManagerPanel } from "@/app/components/modules/BotManagerPanel";
import {
  getBotsAction,
  createBotAction,
  deleteBotAction,
  startBotLoginAction,
} from "@/lib/actions/bot.actions";
import { ZALO_EVENTS } from "@/lib/event-emitter";

export default function BotManagerPage() {
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State quản lý QR Code Flow
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // SSE Ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- 1. Data Fetching ---
  const fetchBots = async () => {
    setIsLoading(true);
    try {
      const data = await getBotsAction();
      setBots(data);
    } catch (error) {
      console.error("Failed to fetch bots:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  // --- 2. SSE Listener (Realtime Status & QR) ---
  useEffect(() => {
    if (eventSourceRef.current) return;

    console.log("[UI] Connecting to SSE for Bot Status...");
    eventSourceRef.current = new EventSource("/api/zalo-events");

    eventSourceRef.current.onmessage = (event) => {
      // Heartbeat or simple text
    };

    // Lắng nghe QR Code
    eventSourceRef.current.addEventListener(ZALO_EVENTS.QR_GENERATED, (e) => {
      try {
        const payload = JSON.parse(e.data);
        // Payload: { botId: string, qrCode: string }
        if (payload.botId && payload.qrCode) {
          // Chỉ update nếu đúng bot đang được user tương tác (hoặc update vào state chung)
          console.log(`[SSE] Received QR for bot ${payload.botId}`);
          if (payload.botId === activeQrBotId) {
            setQrCodeData(payload.qrCode);
          }
          // Cũng nên update trạng thái bot trong list thành QR_WAITING
          updateBotStatusLocally(payload.botId, "QR_WAITING");
        }
      } catch (err) {
        console.error("SSE Parse Error (QR):", err);
      }
    });

    // Lắng nghe Status Update (Login Success/Error)
    eventSourceRef.current.addEventListener(ZALO_EVENTS.STATUS_UPDATE, (e) => {
      try {
        const payload = JSON.parse(e.data);
        // Payload: { botId: string, status: { state: string, error?: string } }
        if (payload.botId && payload.status) {
          console.log(
            `[SSE] Status update for ${payload.botId}:`,
            payload.status,
          );
          updateBotStatusLocally(
            payload.botId,
            payload.status.state,
            payload.status.error_message,
          );

          // Nếu login thành công hoặc lỗi -> Reset QR state
          if (
            payload.status.state === "LOGGED_IN" ||
            payload.status.state === "ERROR"
          ) {
            if (activeQrBotId === payload.botId) {
              setActiveQrBotId(null);
              setQrCodeData(null);
            }
            // Reload list để lấy info mới nhất (Avatar, Name) nếu login thành công
            if (payload.status.state === "LOGGED_IN") {
              fetchBots();
            }
          }
        }
      } catch (err) {
        console.error("SSE Parse Error (Status):", err);
      }
    });

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [activeQrBotId]); // Re-bind listener if active bot changes? No, logic is inside handler.

  // Helper: Update state local để UI phản hồi nhanh
  const updateBotStatusLocally = (
    botId: string,
    state: any,
    error?: string,
  ) => {
    setBots((prev) =>
      prev.map((b) => {
        if (b.id !== botId) return b;
        return {
          ...b,
          status: { ...b.status, state, error_message: error },
        };
      }),
    );
  };

  // --- 3. Handlers ---

  const handleCreateBot = async (name: string) => {
    try {
      await createBotAction(name);
      fetchBots(); // Reload list
    } catch (e) {
      alert("Lỗi tạo bot: " + (e as Error).message);
    }
  };

  const handleDeleteBot = async (id: string) => {
    try {
      await deleteBotAction(id);
      setBots((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      alert("Lỗi xóa bot: " + (e as Error).message);
    }
  };

  const handleStartLogin = async (id: string) => {
    // Reset state QR cũ
    setQrCodeData(null);
    setActiveQrBotId(id);

    // Update UI ngay lập tức sang trạng thái loading/waiting
    updateBotStatusLocally(id, "QR_WAITING");

    try {
      // Gọi Server Action để trigger backend
      await startBotLoginAction(id);
    } catch (e) {
      alert(
        "Không thể khởi động tiến trình đăng nhập: " + (e as Error).message,
      );
      updateBotStatusLocally(id, "ERROR", (e as Error).message);
      setActiveQrBotId(null);
    }
  };

  return (
    <BotManagerPanel
      bots={bots}
      isLoading={isLoading}
      onRefresh={fetchBots}
      onCreateBot={handleCreateBot}
      onDeleteBot={handleDeleteBot}
      onStartLogin={handleStartLogin}
      activeQrBotId={activeQrBotId}
      qrCodeData={qrCodeData}
    />
  );
}
