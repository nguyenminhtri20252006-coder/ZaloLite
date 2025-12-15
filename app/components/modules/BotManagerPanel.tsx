/**
 * app/components/modules/BotManagerPanel.tsx
 * [UPDATED V5.0] Tích hợp Realtime Database.
 */

"use client";

import { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import {
  IconRefresh,
  IconUserPlus,
  IconCog,
  IconClose,
  IconCheck,
  IconClock,
  IconInfo, // Đảm bảo import đủ
} from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  syncBotDataAction,
  updateBotSyncSettingsAction,
  retryBotLoginAction,
  addBotWithTokenAction,
  updateBotTokenAction,
  createPlaceholderBotAction,
} from "@/lib/actions/bot.actions";
// [NEW] Import Hook
import { useZaloBotsRealtime } from "@/lib/hooks/useZaloBotsRealtime";

// ... existing helpers ...
const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return "Chưa hoạt động";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

const HealthLog = ({ log }: { log?: ZaloBot["health_check_log"] }) => {
  if (!log)
    return (
      <div className="mt-3 p-2 bg-black/20 rounded text-xs text-gray-500 italic">
        Chưa có dữ liệu kiểm tra sức khỏe.
      </div>
    );

  const isOk = log.status === "OK";
  const date = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div
      className={`mt-3 p-3 rounded-lg border text-xs ${
        isOk
          ? "bg-green-900/10 border-green-800/30 text-green-300"
          : "bg-red-900/10 border-red-800/30 text-red-300"
      }`}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="font-bold flex items-center gap-1">
          {isOk ? (
            <IconCheck className="w-3 h-3" />
          ) : (
            <IconClose className="w-3 h-3" />
          )}
          {isOk ? "Bot Health: Tốt" : "Bot Health: Có vấn đề"}
        </span>
        <span className="opacity-70">{date}</span>
      </div>
      <p className="truncate opacity-90">{log.message}</p>
      {log.latency && (
        <p className="mt-1 opacity-60 font-mono">Độ trễ: {log.latency}ms</p>
      )}

      {/* [NEW] Hiển thị nút xem raw data nếu cần debug sâu (Optional) */}
      <div className="mt-2 pt-2 border-t border-white/10 flex justify-end">
        <span className="text-[10px] uppercase opacity-50 font-mono">
          Action: {log.action || "UNKNOWN"}
        </span>
      </div>
    </div>
  );
};

export function BotManagerPanel({
  bots: initialBots, // Rename prop để tránh conflict
  isLoading,
  onRefresh,
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
  // [NEW] Sử dụng Hook Realtime
  // bots state bây giờ sẽ tự động cập nhật khi DB thay đổi
  const bots = useZaloBotsRealtime(initialBots);

  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReLoginModal, setShowReLoginModal] = useState(false);
  const [addMethod, setAddMethod] = useState<"SELECT" | "TOKEN">("SELECT");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync Settings State
  const [syncInterval, setSyncInterval] = useState(0);
  const [editingSyncId, setEditingSyncId] = useState<string | null>(null);

  // Tìm bot đang chọn trong danh sách REALTIME
  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const isAdmin = userRole === "admin";

  // ... (Giữ nguyên các hàm handleAddByQR, handleAddByToken, handleUpdateToken, handleRetryOldToken, handleLoginQR, handleSyncManual, handleSaveSettings)
  const handleAddByQR = async () => {
    setIsProcessing(true);
    try {
      const newBot = await createPlaceholderBotAction();
      await onStartLogin(newBot.id);
      // onRefresh(); // Không cần gọi refresh thủ công nữa vì Realtime sẽ tự push bot mới về
      setSelectedBotId(newBot.id);
      setShowAddModal(false);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      alert("Lỗi: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddByToken = async () => {
    setIsProcessing(true);
    try {
      const res = await addBotWithTokenAction(tokenInput);
      if (res.success && res.botId) {
        // onRefresh(); // Realtime lo
        setSelectedBotId(res.botId);
        setShowAddModal(false);
        setTokenInput("");
      } else {
        alert(res.error);
      }
    } catch (e: unknown) {
      alert("Lỗi hệ thống: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateToken = async () => {
    if (!selectedBotId) return;
    setIsProcessing(true);
    try {
      const res = await updateBotTokenAction(selectedBotId, tokenInput);
      if (res.success) {
        alert("Đã cập nhật token và đăng nhập lại thành công!");
        // onRefresh();
        setShowReLoginModal(false);
        setTokenInput("");
      } else {
        alert("Lỗi: " + res.error);
      }
    } catch (e: unknown) {
      alert("Lỗi hệ thống: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryOldToken = async (botId: string) => {
    if (
      !confirm(
        "Hệ thống sẽ thử kết nối lại bằng Token hiện có trong Database. Tiếp tục?",
      )
    )
      return;
    setIsProcessing(true);
    try {
      const res = await retryBotLoginAction(botId);
      if (res.success) {
        alert("Đã gửi lệnh thử lại. Vui lòng chờ...");
        // onRefresh();
      } else {
        alert("Thất bại: " + res.error);
      }
    } catch (e: unknown) {
      alert("Lỗi hệ thống: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoginQR = async (botId: string) => {
    await onStartLogin(botId);
  };

  const handleSyncManual = async (botId: string) => {
    const res = await syncBotDataAction(botId);
    if (res.success) {
      alert("Đã kích hoạt đồng bộ.");
      // onRefresh();
    } else {
      alert(res.error);
    }
  };

  const handleSaveSettings = async (botId: string) => {
    await updateBotSyncSettingsAction(botId, syncInterval);
    setEditingSyncId(null);
    // onRefresh();
    alert("Đã lưu cấu hình.");
  };

  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100">
      {/* SIDEBAR */}
      <div className="w-80 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-bold text-lg text-white">Danh sách Bot</h2>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-900/50">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Realtime
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white shadow"
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
                  ? "bg-gray-800 border border-blue-500/50"
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
                      : "bg-gray-500"
                  }`}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate text-sm">{bot.name}</div>
                <div className="text-xs text-gray-500 truncate font-mono">
                  {bot.status?.state}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 bg-gray-800 relative flex flex-col">
        {selectedBot ? (
          <div className="flex-1 p-8 overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border-2 border-gray-600 overflow-hidden">
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
                  <span
                    className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      selectedBot.status?.state === "LOGGED_IN"
                        ? "bg-green-900 text-green-300"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {selectedBot.status?.state}
                  </span>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    if (confirm("Xóa Bot?")) onDeleteBot(selectedBot.id);
                    if (selectedBotId === selectedBot.id)
                      setSelectedBotId(null);
                  }}
                  className="text-red-400 hover:bg-red-900/30 p-2 rounded border border-red-900/50 flex gap-2 items-center text-sm transition-colors"
                >
                  <IconClose className="w-4 h-4" /> Xóa Bot
                </button>
              )}
            </div>

            {/* ERROR / OFFLINE SECTION */}
            {selectedBot.status?.state !== "LOGGED_IN" && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-700 flex flex-col items-center mb-6">
                {/* QR Display - Realtime update */}
                {/* Lưu ý: qrCodeData vẫn đang được truyền từ cha (page.tsx) hoặc state cục bộ. 
                    Nếu muốn realtime cả QR, ta nên lấy field qr_code từ bot object */}
                {selectedBot.status?.state === "QR_WAITING" ? (
                  selectedBot.status.qr_code ? (
                    <div className="flex flex-col items-center animate-fade-in mb-6">
                      <div className="bg-white p-3 rounded-xl mb-4 shadow-lg">
                        <img
                          src={selectedBot.status.qr_code}
                          className="w-64 h-64 object-contain"
                          alt="QR"
                        />
                      </div>
                      <p className="text-blue-400 animate-pulse font-medium">
                        Quét mã để đăng nhập
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center animate-fade-in mb-6">
                      <div className="w-64 h-64 bg-gray-800 rounded-xl flex items-center justify-center mb-4">
                        <span className="animate-spin text-4xl">↻</span>
                      </div>
                      <p className="text-gray-400">Đang tạo mã QR...</p>
                    </div>
                  )
                ) : null}

                {/* Error Message */}
                {selectedBot.status?.state === "ERROR" && (
                  <div className="mb-6 w-full max-w-2xl bg-red-900/20 border border-red-900/50 p-4 rounded-lg flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="font-bold text-red-400 text-sm">
                        Bot đã dừng hoạt động
                      </p>
                      <p className="text-xs text-red-300 opacity-80">
                        {selectedBot.status.error_message}
                      </p>
                    </div>
                  </div>
                )}

                {/* Recovery Actions (3 Options) */}
                <div className="text-center w-full max-w-2xl">
                  <p className="text-gray-400 mb-4 text-sm font-medium uppercase tracking-wider">
                    Chọn phương thức khôi phục:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* OPTION 1: RETRY OLD TOKEN */}
                    <button
                      onClick={() => handleRetryOldToken(selectedBot.id)}
                      disabled={isProcessing}
                      className="flex flex-col items-center justify-center p-4 bg-gray-800 hover:bg-yellow-600/20 border border-gray-700 hover:border-yellow-500 rounded-xl transition-all group"
                    >
                      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        🔄
                      </span>
                      <span className="font-bold text-white text-xs">
                        Thử lại (Token Cũ)
                      </span>
                      <span className="text-[10px] text-gray-500 mt-1">
                        Nếu chỉ lỗi mạng
                      </span>
                    </button>

                    {/* OPTION 2: SCAN QR */}
                    <button
                      onClick={() => handleLoginQR(selectedBot.id)}
                      disabled={isProcessing}
                      className="flex flex-col items-center justify-center p-4 bg-gray-800 hover:bg-blue-600/20 border border-gray-700 hover:border-blue-500 rounded-xl transition-all group"
                    >
                      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        📱
                      </span>
                      <span className="font-bold text-white text-xs">
                        Quét QR Mới
                      </span>
                      <span className="text-[10px] text-gray-500 mt-1">
                        Tạo phiên mới
                      </span>
                    </button>

                    {/* OPTION 3: NEW TOKEN */}
                    <button
                      onClick={() => {
                        setTokenInput("");
                        setShowReLoginModal(true);
                      }}
                      disabled={isProcessing}
                      className="flex flex-col items-center justify-center p-4 bg-gray-800 hover:bg-purple-600/20 border border-gray-700 hover:border-purple-500 rounded-xl transition-all group"
                    >
                      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        🍪
                      </span>
                      <span className="font-bold text-white text-xs">
                        Nhập Token Mới
                      </span>
                      <span className="text-[10px] text-gray-500 mt-1">
                        Update thủ công
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Panels (Status & Config) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <IconClock className="w-5 h-5 text-blue-400" /> Trạng thái
                </h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Lần cuối active:</span>
                    <span className="text-white font-mono">
                      {timeAgo(selectedBot.last_activity_at)}
                    </span>
                  </div>
                  {selectedBot.status?.state === "LOGGED_IN" && (
                    <button
                      onClick={() => handleSyncManual(selectedBot.id)}
                      className="w-full mt-2 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 rounded flex justify-center items-center gap-2 transition-colors"
                    >
                      <IconRefresh className="w-4 h-4" /> Đồng bộ dữ liệu
                    </button>
                  )}
                  {/* Realtime Log Display */}
                  <HealthLog log={selectedBot.health_check_log} />
                </div>
              </div>

              {isAdmin && (
                <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <IconCog className="w-5 h-5 text-purple-400" /> Cấu hình
                    </h3>
                    <button
                      onClick={() => {
                        setEditingSyncId(
                          editingSyncId === selectedBot.id
                            ? null
                            : selectedBot.id,
                        );
                        setSyncInterval(selectedBot.auto_sync_interval || 0);
                      }}
                      className="text-xs text-gray-400 hover:text-white underline"
                    >
                      {editingSyncId === selectedBot.id ? "Hủy" : "Sửa"}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-2">
                      Tự động đồng bộ (phút)
                    </label>
                    {editingSyncId === selectedBot.id ? (
                      <div className="flex gap-2 animate-fade-in">
                        <select
                          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                          value={syncInterval}
                          onChange={(e) =>
                            setSyncInterval(Number(e.target.value))
                          }
                        >
                          <option value={0}>Tắt</option>
                          <option value={15}>15 phút</option>
                          <option value={30}>30 phút</option>
                          <option value={60}>60 phút</option>
                        </select>
                        <button
                          onClick={() => handleSaveSettings(selectedBot.id)}
                          className="px-4 bg-purple-600 hover:bg-purple-500 rounded text-white text-sm font-bold"
                        >
                          Lưu
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-white font-medium bg-gray-800 p-2 rounded border border-gray-700">
                        {selectedBot.auto_sync_interval
                          ? `${selectedBot.auto_sync_interval} phút`
                          : "Đang tắt"}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <IconUserPlus className="w-16 h-16 opacity-20 mb-4" />
            <p>Chọn một Bot để bắt đầu.</p>
          </div>
        )}
      </div>

      {/* MODAL ADD BOT */}
      {showAddModal && isAdmin && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-gray-700 flex justify-between bg-gray-900">
              <h3 className="font-bold text-white">Thêm Bot Mới</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {addMethod === "SELECT" ? (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleAddByQR}
                    disabled={isProcessing}
                    className="p-6 bg-gray-700 hover:bg-blue-600/20 border border-gray-600 hover:border-blue-500 rounded-xl flex flex-col items-center transition-all"
                  >
                    <span className="text-2xl mb-2">📱</span>
                    <span className="font-bold text-white">Quét QR</span>
                  </button>
                  <button
                    onClick={() => setAddMethod("TOKEN")}
                    className="p-6 bg-gray-700 hover:bg-purple-600/20 border border-gray-600 hover:border-purple-500 rounded-xl flex flex-col items-center transition-all"
                  >
                    <span className="text-2xl mb-2">🍪</span>
                    <span className="font-bold text-white">Nhập Token</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder='{"cookie":..., "imei":...}'
                    className="w-full h-40 bg-gray-900 border border-gray-600 rounded p-3 text-xs font-mono text-green-400 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setAddMethod("SELECT")}
                      className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                    >
                      Quay lại
                    </button>
                    <button
                      onClick={handleAddByToken}
                      disabled={!tokenInput || isProcessing}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-sm"
                    >
                      Thêm ngay
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL RE-LOGIN (UPDATE TOKEN) */}
      {showReLoginModal && isAdmin && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-gray-700 flex justify-between bg-gray-900">
              <h3 className="font-bold text-white">
                Cập nhật Token cho: {selectedBot?.name}
              </h3>
              <button
                onClick={() => setShowReLoginModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-400">
                Nhập JSON Credentials mới để khôi phục kết nối cho bot này.
              </p>
              <textarea
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder='{"cookie":..., "imei":...}'
                className="w-full h-40 bg-gray-900 border border-gray-600 rounded p-3 text-xs font-mono text-green-400 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowReLoginModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  onClick={handleUpdateToken}
                  disabled={!tokenInput || isProcessing}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-sm flex items-center gap-2"
                >
                  {isProcessing ? "Đang xử lý..." : "Cập nhật & Đăng nhập"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
