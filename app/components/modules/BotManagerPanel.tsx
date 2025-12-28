/**
 * app/components/modules/BotManagerPanel.tsx
 * [UPDATED V5.1] Tích hợp DetailsPanel & Soft Stop Logic
 */
"use client";

import { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import {
  IconRefresh,
  IconUserPlus,
  IconClose,
} from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  retryBotLoginAction,
  addBotWithTokenAction,
  updateBotTokenAction,
  createPlaceholderBotAction,
} from "@/lib/actions/bot.actions";

// [NEW] Import Hook
import { useZaloBotsRealtime } from "@/lib/hooks/useZaloBotsRealtime";
// [NEW] Import DetailsPanel
import { DetailsPanel } from "./DetailsPanel";
// [NEW] Import LoginPanel (để dùng trong Modal)
import { LoginPanel } from "./LoginPanel";

export function BotManagerPanel({
  bots: initialBots,
  isLoading: initialLoading,
  onRefresh, // Vẫn giữ để refresh cha nếu cần
  onDeleteBot,
  onStartLogin,
  activeQrBotId,
  qrCodeData,
  userRole,
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteBot: (id: string) => void;
  onStartLogin: (id: string) => Promise<void>;
  activeQrBotId: string | null;
  qrCodeData: string | null;
  userRole: string;
}) {
  // 1. Realtime Hook
  const bots = useZaloBotsRealtime(initialBots);

  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);

  // Login Panel State (Local state cho modal thêm mới)
  const [loginMethod, setLoginMethod] = useState<"qr" | "token">("qr");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginState, setLoginState] = useState<"IDLE" | "LOGGING_IN" | "ERROR">(
    "IDLE",
  );
  const [tempBotId, setTempBotId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";
  const selectedBot = bots.find((b) => b.id === selectedBotId) || null;

  // --- HANDLERS CHO LOGIN PANEL (MODAL) ---

  const handleStartLoginQR = async () => {
    setIsProcessing(true);
    setLoginState("LOGGING_IN");
    try {
      // 1. Tạo placeholder bot
      const newBot = await createPlaceholderBotAction();
      setTempBotId(newBot.id);

      // 2. Gọi hàm login từ cha (page.tsx) để trigger luồng QR
      await onStartLogin(newBot.id);

      // Không đóng modal ngay, đợi user quét
      // Khi user quét xong, bot sẽ chuyển sang LOGGED_IN (nhờ Realtime), lúc đó ta đóng modal
    } catch (e) {
      alert("Lỗi: " + String(e));
      setLoginState("ERROR");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartLoginToken = async () => {
    setIsProcessing(true);
    try {
      const res = await addBotWithTokenAction(tokenInput);
      if (res.success && res.botId) {
        if (res.warning) alert(res.warning);
        setShowAddModal(false);
        setTokenInput("");
        setLoginState("IDLE");
        setSelectedBotId(res.botId);
      } else {
        alert(res.error);
        setLoginState("ERROR");
      }
    } catch (e) {
      alert("Lỗi: " + String(e));
      setLoginState("ERROR");
    } finally {
      setIsProcessing(false);
    }
  };

  // Effect: Tự động đóng modal & chọn bot khi tempBotId chuyển sang LOGGED_IN
  // (Logic này giúp UX mượt mà khi quét QR)
  const tempBot = bots.find((b) => b.id === tempBotId);
  if (showAddModal && tempBot && tempBot.status?.state === "LOGGED_IN") {
    setShowAddModal(false);
    setTempBotId(null);
    setSelectedBotId(tempBot.id);
    setLoginState("IDLE");
  }

  // Effect: Pass QR Data vào LoginPanel nếu đang mở modal cho tempBot
  const currentQrCode = tempBotId === activeQrBotId ? qrCodeData : null;

  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* 1. LEFT SIDEBAR (BOT LIST) */}
      <div className="w-80 flex flex-col border-r border-gray-800 bg-gray-900 shrink-0">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-bold text-lg text-white">Danh sách Bot</h2>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 text-[10px] text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-900/50">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Realtime
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setShowAddModal(true);
                  setLoginState("IDLE");
                  setLoginMethod("qr");
                }}
                className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white shadow transition-colors"
                title="Thêm Bot"
              >
                <IconUserPlus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {bots.map((bot) => (
            <button
              key={bot.id}
              onClick={() => setSelectedBotId(bot.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                selectedBotId === bot.id
                  ? "bg-gray-800 border border-blue-500/50 shadow-md"
                  : "hover:bg-gray-800/50 border border-transparent"
              }`}
            >
              <div className="relative">
                <Avatar src={bot.avatar || ""} alt={bot.name} />
                <div
                  className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${
                    bot.status?.state === "LOGGED_IN"
                      ? "bg-green-500"
                      : bot.status?.state === "ERROR"
                      ? "bg-red-500"
                      : bot.status?.state === "QR_WAITING"
                      ? "bg-purple-500 animate-pulse"
                      : "bg-gray-500"
                  }`}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate text-sm text-gray-200">
                  {bot.name}
                </div>
                <div
                  className={`text-xs truncate font-mono ${
                    bot.status?.state === "ERROR"
                      ? "text-red-400"
                      : "text-gray-500"
                  }`}
                >
                  {bot.status?.state === "QR_WAITING"
                    ? "Đang chờ quét..."
                    : bot.status?.state}
                </div>
              </div>
            </button>
          ))}
          {bots.length === 0 && !initialLoading && (
            <div className="text-center text-gray-500 text-xs mt-10">
              Chưa có bot nào.
            </div>
          )}
        </div>
      </div>

      {/* 2. RIGHT CONTENT (DETAILS PANEL) */}
      <div className="flex-1 min-w-0 bg-gray-800 flex flex-col">
        <DetailsPanel
          bot={selectedBot}
          onRefresh={onRefresh} // Vẫn truyền refresh để DetailsPanel có thể trigger reload nếu cần
        />
      </div>

      {/* 3. MODAL ADD BOT */}
      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
              {/* Nút đóng modal */}
              <div className="w-6"></div> {/* Spacer */}
              <h3 className="text-lg font-bold text-white">Quản lý Bot</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <IconClose className="w-6 h-6" />
              </button>
            </div>

            {/* Render LoginPanel bên trong Modal */}
            <LoginPanel
              loginState={loginState}
              loginMethod={loginMethod}
              qrCode={currentQrCode}
              isSending={isProcessing}
              tokenInput={tokenInput}
              onLoginMethodChange={setLoginMethod}
              onTokenChange={setTokenInput}
              onStartLoginQR={handleStartLoginQR}
              onStartLoginToken={handleStartLoginToken}
              renderStatus={() => (
                <span
                  className={
                    loginState === "ERROR" ? "text-red-400" : "text-gray-400"
                  }
                >
                  {loginState === "IDLE"
                    ? "Chờ nhập liệu"
                    : loginState === "LOGGING_IN"
                    ? "Đang xử lý..."
                    : "Lỗi"}
                </span>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
