/**
 * app/(system)/bot-manager/page.tsx
 * [UPDATED] Fix: Removed deprecated 'createBotAction' usage.
 */

"use client";

import { useState, useEffect } from "react";
import { ZaloBot, ZaloBotStatus } from "@/lib/types/database.types";
import { BotManagerPanel } from "@/app/components/modules/BotManagerPanel";
import {
  getBotsAction,
  deleteBotAction,
  startBotLoginAction,
} from "@/lib/actions/bot.actions";
import { getStaffSession } from "@/lib/actions/staff.actions";

export default function BotManagerPage() {
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("staff");

  // State quản lý QR Code Flow
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // --- 1. Data Fetching ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch Bots
      const botsData = await getBotsAction();
      setBots(botsData);

      // Fetch User Role
      const session = await getStaffSession();
      if (session) setUserRole(session.role);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Helper: Update state local để UI phản hồi nhanh ---
  const updateBotStatusLocally = (
    botId: string,
    state: ZaloBotStatus["state"],
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

  // --- 2. Handlers ---

  // [REMOVED] handleCreateBot - Logic tạo bot giờ được xử lý bên trong BotManagerPanel (LoginPanel)

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
      onRefresh={fetchData}
      // onCreateBot={handleCreateBot} // [REMOVED] No longer needed
      onDeleteBot={handleDeleteBot}
      onStartLogin={handleStartLogin}
      activeQrBotId={activeQrBotId}
      setActiveQrBotId={setActiveQrBotId}
      qrCodeData={qrCodeData}
      userRole={userRole}
    />
  );
}
