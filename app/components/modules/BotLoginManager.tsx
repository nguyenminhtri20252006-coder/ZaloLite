"use client";

import { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconRefresh,
  IconUserPlus,
  IconClose,
  IconCheck,
} from "@/app/components/ui/Icons";
import {
  createPlaceholderBotAction,
  startBotLoginAction,
  addBotWithTokenAction,
  retryBotLoginAction,
  deleteBotAction,
} from "@/lib/actions/bot.actions";

/**
 * Giao diện Quản lý Đăng nhập & Danh sách Bot
 */
export function BotLoginManager({
  bots,
  isLoading,
  onRefresh,
  activeQrBotId,
  qrCodeData,
  onSetActiveQrBotId, // [NEW] Nhận props từ cha để control trạng thái chờ QR
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  activeQrBotId: string | null;
  qrCodeData: string | null;
  onSetActiveQrBotId?: (id: string | null) => void;
}) {
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  // State quản lý Modal thêm Bot
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMethod, setAddMethod] = useState<"SELECT" | "TOKEN">("SELECT");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedBot = bots.find((b) => b.id === selectedBotId);

  // --- HANDLERS ---

  // 1. Add via QR
  const handleAddByQR = async () => {
    setIsProcessing(true);
    try {
      // Tạo bot rỗng
      const newBot = await createPlaceholderBotAction();

      // Update UI trạng thái chờ QR cho bot mới
      if (onSetActiveQrBotId) onSetActiveQrBotId(newBot.id);

      // Trigger Login QR
      await startBotLoginAction(newBot.id);

      // Auto select bot mới và đóng modal
      onRefresh();
      setSelectedBotId(newBot.id);
      setShowAddModal(false);
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Add via Token
  const handleAddByToken = async () => {
    if (!tokenInput.trim()) return;
    setIsProcessing(true);
    try {
      const res = await addBotWithTokenAction(tokenInput);
      if (res.success) {
        onRefresh();
        setSelectedBotId(res.botId!);
        setShowAddModal(false);
        setTokenInput("");
        setAddMethod("SELECT");
      } else {
        alert("Lỗi: " + res.error);
      }
    } catch (e) {
      alert("Lỗi hệ thống");
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Retry Login (Bot cũ)
  const handleRetryLogin = async (botId: string) => {
    if (!confirm("Thử đăng nhập lại với Token cũ?")) return;
    try {
      const res = await retryBotLoginAction(botId);
      if (!res.success) alert(res.error);
      else alert("Đã gửi lệnh đăng nhập lại. Vui lòng chờ...");
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    }
  };

  // 4. Start QR for existing bot
  const handleStartQR = async (botId: string) => {
    if (onSetActiveQrBotId) onSetActiveQrBotId(botId);
    await startBotLoginAction(botId);
  };

  // 5. Delete
  const handleDelete = async (botId: string) => {
    if (!confirm("Xóa bot này khỏi hệ thống?")) return;
    await deleteBotAction(botId);
    onRefresh();
    if (selectedBotId === botId) setSelectedBotId(null);
  };

  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100 relative">
      {/* 1. SIDEBAR DANH SÁCH BOT */}
      <div className="w-80 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-bold text-lg">Danh sách Bot</h2>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
            >
              <IconRefresh
                className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white shadow-lg"
              title="Thêm Bot"
            >
              <IconUserPlus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
                <StatusDot status={bot.status?.state} />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate text-sm">{bot.name}</div>
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
          {bots.length === 0 && (
            <div className="text-center text-gray-500 text-sm mt-10 px-4">
              Chưa có bot nào. <br /> Bấm dấu (+) để thêm.
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN DETAIL AREA */}
      <div className="flex-1 bg-gray-800 relative flex flex-col">
        {selectedBot ? (
          <div className="flex-1 p-8 overflow-y-auto">
            {/* Header Detail */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-600">
                  <img
                    src={
                      selectedBot.avatar || "https://via.placeholder.com/128"
                    }
                    className="w-full h-full object-cover"
                    alt=""
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {selectedBot.name}
                  </h1>
                  <p className="text-gray-400 text-sm font-mono mt-1">
                    ID: {selectedBot.global_id}
                  </p>
                  <StatusBadge status={selectedBot.status?.state} />
                </div>
              </div>
              <button
                onClick={() => handleDelete(selectedBot.id)}
                className="text-red-400 hover:bg-red-900/30 p-2 rounded-lg text-sm flex items-center gap-2 transition-colors border border-red-900/50"
              >
                <IconClose className="w-4 h-4" /> Xóa Bot
              </button>
            </div>

            {/* ERROR STATE: Show Retry Button */}
            {selectedBot.status?.state === "ERROR" && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3 text-red-200">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-bold text-sm">Lỗi phiên đăng nhập</p>
                    <p className="text-xs opacity-80">
                      {selectedBot.status.error_message}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRetryLogin(selectedBot.id)}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-bold shadow"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* QR LOGIN AREA */}
            <div className="grid grid-cols-1 gap-6">
              {/* Nếu đang chờ QR (QR_WAITING) hoặc người dùng muốn login lại */}
              {selectedBot.status?.state !== "LOGGED_IN" && (
                <div className="bg-gray-900 rounded-xl p-8 border border-gray-700 flex flex-col items-center justify-center min-h-[300px]">
                  {selectedBot.status?.state === "QR_WAITING" ? (
                    <>
                      {qrCodeData && activeQrBotId === selectedBot.id ? (
                        <div className="flex flex-col items-center animate-fade-in">
                          <div className="bg-white p-3 rounded-xl shadow-2xl mb-4">
                            <img
                              src={qrCodeData}
                              alt="QR"
                              className="w-64 h-64 object-contain"
                            />
                          </div>
                          <p className="text-blue-400 font-medium animate-pulse">
                            Mở Zalo trên điện thoại và quét mã này
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-purple-400">
                          <IconRefresh className="w-10 h-10 animate-spin mb-3" />
                          <p>Đang khởi tạo mã QR...</p>
                        </div>
                      )}
                    </>
                  ) : selectedBot.status?.state === "STARTING" ? (
                    <div className="flex flex-col items-center text-yellow-400">
                      <IconRefresh className="w-10 h-10 animate-spin mb-3" />
                      <p>Đang kết nối lại...</p>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <p>Bot đang dừng hoạt động.</p>
                      {/* Nút kích hoạt lại QR cho bot cũ */}
                      <button
                        onClick={() => handleStartQR(selectedBot.id)}
                        className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 font-medium"
                      >
                        Lấy mã QR mới
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* LOGGED IN VIEW */}
              {selectedBot.status?.state === "LOGGED_IN" && (
                <div className="bg-green-900/10 border border-green-800/50 rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px]">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.4)] mb-4">
                    <IconCheck className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    Đang hoạt động
                  </h3>
                  <p className="text-green-300 text-sm text-center max-w-md">
                    Bot đã kết nối thành công. Bạn có thể chuyển sang tab Chat
                    để bắt đầu nhắn tin.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p>Chọn một Bot để xem chi tiết.</p>
          </div>
        )}
      </div>

      {/* 3. MODAL ADD BOT */}
      {showAddModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900">
              <h3 className="text-lg font-bold text-white">Thêm Bot Mới</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <IconClose className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {addMethod === "SELECT" ? (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleAddByQR}
                    disabled={isProcessing}
                    className="flex flex-col items-center justify-center p-6 bg-gray-700 hover:bg-blue-600/20 border border-gray-600 hover:border-blue-500 rounded-xl transition-all group"
                  >
                    <div className="w-16 h-16 bg-white rounded-lg p-1 mb-4 group-hover:scale-110 transition-transform">
                      {/* Fake QR Icon */}
                      <div className="w-full h-full bg-black flex items-center justify-center text-white text-xs">
                        QR
                      </div>
                    </div>
                    <span className="font-bold text-white">Quét mã QR</span>
                    <span className="text-xs text-gray-400 mt-1 text-center">
                      Dành cho tài khoản mới
                    </span>
                  </button>

                  <button
                    onClick={() => setAddMethod("TOKEN")}
                    className="flex flex-col items-center justify-center p-6 bg-gray-700 hover:bg-purple-600/20 border border-gray-600 hover:border-purple-500 rounded-xl transition-all group"
                  >
                    <div className="w-16 h-16 bg-gray-900 rounded-lg flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                      🍪
                    </div>
                    <span className="font-bold text-white">Nhập Token</span>
                    <span className="text-xs text-gray-400 mt-1 text-center">
                      Cookie & IMEI có sẵn
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Dán JSON Credentials (Cookie, IMEI...)
                    </label>
                    <textarea
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder='{"cookie": {...}, "imei": "...", "userAgent": "..."}'
                      className="w-full h-40 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs font-mono text-green-400 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setAddMethod("SELECT")}
                      className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                    >
                      Quay lại
                    </button>
                    <button
                      onClick={handleAddByToken}
                      disabled={isProcessing || !tokenInput}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {isProcessing && (
                        <IconRefresh className="w-4 h-4 animate-spin" />
                      )}
                      Đăng nhập ngay
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- UI Helpers ---

function StatusDot({ status }: { status?: string }) {
  const color =
    status === "LOGGED_IN"
      ? "bg-green-500"
      : status === "QR_WAITING"
      ? "bg-purple-500 animate-pulse"
      : status === "ERROR"
      ? "bg-red-500"
      : "bg-gray-500";

  return (
    <div
      className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${color}`}
    />
  );
}

function StatusBadge({ status }: { status?: string }) {
  const style =
    status === "LOGGED_IN"
      ? "bg-green-900 text-green-300 border-green-700"
      : status === "QR_WAITING"
      ? "bg-purple-900 text-purple-300 border-purple-700"
      : status === "ERROR"
      ? "bg-red-900 text-red-300 border-red-700"
      : "bg-gray-700 text-gray-300 border-gray-600";

  return (
    <span
      className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${style}`}
    >
      {status || "UNKNOWN"}
    </span>
  );
}
