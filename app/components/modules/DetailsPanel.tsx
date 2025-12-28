"use client";

import { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import {
  IconRefresh,
  IconCheck,
  IconClose,
  IconClock,
} from "@/app/components/ui/Icons";
import { JsonViewerModal } from "@/app/components/ui/JsonViewerModal";
import {
  startBotLoginAction,
  retryBotLoginAction,
  stopBotAction,
  deleteBotAction,
  startBotFromSavedTokenAction,
  updateBotTokenAction,
  syncBotDataAction,
} from "@/lib/actions/bot.actions";

// [NEW] Import Tabs Component
import { BotDetailTabs } from "./BotDetailTabs";

// --- SUB-COMPONENT: HealthLog ---
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
      <div className="mt-3 p-3 bg-black/20 rounded-lg text-xs text-gray-500 italic text-center border border-gray-800 border-dashed">
        Chưa có dữ liệu kiểm tra sức khỏe.
      </div>
    );

  const isOk = log.status === "OK";
  const date = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div
      className={`mt-3 p-3 rounded-lg border text-xs animate-fade-in ${
        isOk
          ? "bg-green-900/10 border-green-800/30 text-green-300"
          : "bg-red-900/10 border-red-800/30 text-red-300"
      }`}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="font-bold flex items-center gap-1.5">
          {isOk ? (
            <IconCheck className="w-3.5 h-3.5" />
          ) : (
            <IconClose className="w-3.5 h-3.5" />
          )}
          {isOk ? "Hệ thống: Ổn định" : "Hệ thống: Cảnh báo"}
        </span>
        <span className="opacity-70 font-mono text-[10px] bg-black/20 px-1.5 py-0.5 rounded">
          {date}
        </span>
      </div>
      <p className="truncate opacity-90 font-medium">{log.message}</p>
      {log.latency !== undefined && (
        <div className="mt-2 flex items-center gap-2 opacity-60 font-mono text-[10px]">
          <span>Ping: {log.latency}ms</span>
          <span className="w-1 h-1 rounded-full bg-current"></span>
          <span>Action: {log.action || "UNKNOWN"}</span>
        </div>
      )}
    </div>
  );
};

interface DetailsPanelProps {
  bot: ZaloBot | null;
  onRefresh: () => void;
}

export function DetailsPanel({ bot, onRefresh }: DetailsPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewTokenData, setViewTokenData] = useState<any | null>(null);

  // State cho nhập token mới
  const [showUpdateToken, setShowUpdateToken] = useState(false);
  const [newTokenInput, setNewTokenInput] = useState("");

  if (!bot) {
    return (
      <div className="flex-1 bg-gray-800 flex flex-col items-center justify-center text-gray-500">
        <p>Chọn một Bot từ danh sách để xem chi tiết.</p>
      </div>
    );
  }

  // [FIXED] Helpers: Check token lỏng hơn (Loose Check)
  const hasSavedToken = (b: ZaloBot) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = b.access_token as any;

    // Chỉ cần là object và không rỗng là OK
    // (Bỏ check imei/cookie bắt buộc để support mọi loại token từ QR)
    return token && typeof token === "object" && Object.keys(token).length > 0;
  };

  const getQrCodeData = (b: ZaloBot) => {
    return b.status?.qr_code;
  };

  // --- ACTIONS ---

  const handleStartSaved = async () => {
    setIsProcessing(true);
    try {
      const res = await startBotFromSavedTokenAction(bot.id);
      if (!res.success) alert(res.error);
      else onRefresh();
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartQR = async () => {
    setIsProcessing(true);
    try {
      await startBotLoginAction(bot.id);
      onRefresh();
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStop = async () => {
    if (!confirm("Bạn muốn tạm ngưng bot này? Token sẽ được giữ lại.")) return;
    setIsProcessing(true);
    try {
      await stopBotAction(bot.id);
      onRefresh();
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "CẢNH BÁO: Hành động này sẽ XÓA VĨNH VIỄN bot và dữ liệu liên quan.\nBạn có chắc chắn không?",
      )
    )
      return;
    setIsProcessing(true);
    try {
      await deleteBotAction(bot.id);
      onRefresh();
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = async () => {
    await retryBotLoginAction(bot.id);
    onRefresh();
  };

  const handleUpdateToken = async () => {
    if (!newTokenInput) return;
    setIsProcessing(true);
    try {
      const res = await updateBotTokenAction(bot.id, newTokenInput);
      if (res.success) {
        alert("Đã cập nhật token và đang khởi động lại...");
        setShowUpdateToken(false);
        setNewTokenInput("");
        onRefresh();
      } else {
        alert(res.error);
      }
    } catch (e) {
      alert("Lỗi: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncManual = async () => {
    const res = await syncBotDataAction(bot.id);
    if (res.success) {
      alert("Đã kích hoạt đồng bộ.");
      onRefresh();
    } else {
      alert(res.error);
    }
  };

  return (
    <div className="flex-1 bg-gray-800 relative flex flex-col h-full overflow-hidden">
      <div className="flex-1 p-8 overflow-y-auto scrollbar-thin">
        {/* HEADER CONTROL CENTER (Existing Code) */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-600 bg-gray-700">
              <img
                src={bot.avatar || "https://via.placeholder.com/128"}
                className="w-full h-full object-cover"
                alt="Avatar"
                onError={(e) =>
                  (e.currentTarget.src =
                    "https://via.placeholder.com/128?text=Bot")
                }
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{bot.name}</h1>
              <p className="text-gray-400 text-sm font-mono mt-1">
                ID: {bot.global_id}
              </p>
              <div className="mt-2">
                <StatusBadge status={bot.status?.state} />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {hasSavedToken(bot) && (
              <button
                onClick={() => setViewTokenData(bot.access_token)}
                className="text-gray-400 hover:bg-gray-700 p-2 rounded-lg text-sm border border-gray-700 transition-colors flex items-center gap-2"
                title="Xem Token"
              >
                <span>🔑</span> <span className="hidden sm:inline">Token</span>
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-red-900 hover:text-red-400 hover:bg-red-900/10 p-2 rounded-lg text-sm transition-colors"
              title="Xóa vĩnh viễn"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* LAYOUT GRID: CONTROL & STATUS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUMN 1: MAIN CONTROL (Chiếm 2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* STATE: ERROR & STOPPED (Gộp chung Logic Khôi phục) */}
            {(bot.status?.state === "ERROR" ||
              bot.status?.state === "STOPPED" ||
              !bot.status?.state) && (
              <div className="flex flex-col gap-6">
                {/* Thông báo trạng thái */}
                {bot.status?.state === "ERROR" ? (
                  <div className="p-6 bg-red-900/20 border border-red-700/50 rounded-lg flex flex-col gap-4">
                    <div className="flex items-start gap-3 text-red-200">
                      <span className="text-2xl">⚠️</span>
                      <div>
                        <p className="font-bold text-lg">Bot gặp sự cố</p>
                        <p className="text-sm opacity-90 mt-1 font-mono">
                          {bot.status.error_message || "Lỗi không xác định"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700 text-center">
                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                      💤
                    </div>
                    <p className="text-lg font-medium text-gray-300">
                      Bot đang tạm ngưng
                    </p>
                    {hasSavedToken(bot) && (
                      <p className="text-sm text-gray-500 mt-1">
                        Token xác thực vẫn được lưu trữ an toàn.
                      </p>
                    )}
                  </div>
                )}

                {/* Khu vực Action Khôi phục */}
                <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4">
                    Tùy chọn khởi động lại
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Option 1: Start Saved / Retry */}
                    <button
                      onClick={
                        bot.status?.state === "ERROR"
                          ? handleRetry
                          : handleStartSaved
                      }
                      disabled={!hasSavedToken(bot) || isProcessing}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all group ${
                        hasSavedToken(bot)
                          ? "bg-green-900/20 border-green-700 hover:bg-green-900/30 hover:border-green-500 cursor-pointer"
                          : "bg-gray-800 border-gray-700 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        {isProcessing ? (
                          <IconRefresh className="animate-spin" />
                        ) : (
                          "🔄"
                        )}
                      </span>
                      <span className="font-bold text-white text-sm">
                        {bot.status?.state === "ERROR" ? "Thử lại" : "Bật lại"}
                      </span>
                      <span className="text-[10px] text-gray-400 mt-1 text-center">
                        Dùng Token đã lưu
                      </span>
                    </button>

                    {/* Option 2: Scan QR New */}
                    <button
                      onClick={handleStartQR}
                      disabled={isProcessing}
                      className="flex flex-col items-center justify-center p-4 bg-gray-800 hover:bg-blue-600/20 border border-gray-700 hover:border-blue-500 rounded-xl transition-all group"
                    >
                      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        📱
                      </span>
                      <span className="font-bold text-white text-sm">
                        Quét QR Mới
                      </span>
                      <span className="text-[10px] text-gray-400 mt-1 text-center">
                        Tạo phiên đăng nhập mới
                      </span>
                    </button>

                    {/* Option 3: New Token */}
                    <button
                      onClick={() => setShowUpdateToken(!showUpdateToken)}
                      disabled={isProcessing}
                      className={`flex flex-col items-center justify-center p-4 bg-gray-800 hover:bg-purple-600/20 border border-gray-700 hover:border-purple-500 rounded-xl transition-all group ${
                        showUpdateToken
                          ? "border-purple-500 bg-purple-900/10"
                          : ""
                      }`}
                    >
                      <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        🍪
                      </span>
                      <span className="font-bold text-white text-sm">
                        Nhập Token Mới
                      </span>
                      <span className="text-[10px] text-gray-400 mt-1 text-center">
                        Cập nhật JSON thủ công
                      </span>
                    </button>
                  </div>

                  {/* Expandable Token Input */}
                  {showUpdateToken && (
                    <div className="mt-4 pt-4 border-t border-gray-700 animate-fade-in">
                      <label className="text-xs text-gray-400 mb-2 block">
                        Dán JSON Token mới vào đây:
                      </label>
                      <textarea
                        value={newTokenInput}
                        onChange={(e) => setNewTokenInput(e.target.value)}
                        className="w-full bg-black/30 border border-gray-600 rounded p-3 text-xs font-mono text-green-400 focus:outline-none focus:border-purple-500 min-h-[100px]"
                        placeholder='{"cookie":...}'
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => setShowUpdateToken(false)}
                          className="px-3 py-1 text-xs text-gray-400 hover:text-white"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={handleUpdateToken}
                          disabled={!newTokenInput || isProcessing}
                          className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold"
                        >
                          Cập nhật & Đăng nhập
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STATE: QR WAITING */}
            {bot.status?.state === "QR_WAITING" && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-700 flex flex-col items-center justify-center min-h-[300px]">
                {getQrCodeData(bot) ? (
                  <div className="flex flex-col items-center animate-fade-in">
                    <div className="bg-white p-3 rounded-xl shadow-2xl mb-6">
                      <img
                        src={getQrCodeData(bot) || ""}
                        alt="QR Code"
                        className="w-64 h-64 object-contain"
                      />
                    </div>
                    <p className="text-blue-400 font-medium animate-pulse text-lg">
                      Quét mã trên ứng dụng Zalo
                    </p>
                    <p className="text-gray-500 text-sm mt-2">
                      Mã sẽ hết hạn sau vài phút
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-purple-400">
                    <IconRefresh className="w-12 h-12 animate-spin mb-4" />
                    <p className="text-lg">Đang khởi tạo phiên đăng nhập...</p>
                  </div>
                )}

                <button
                  onClick={handleStop}
                  className="mt-8 text-gray-500 hover:text-white text-sm underline transition-colors"
                >
                  Hủy bỏ
                </button>
              </div>
            )}

            {/* STATE: STARTING */}
            {bot.status?.state === "STARTING" && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-700 flex flex-col items-center justify-center min-h-[300px]">
                <div className="flex flex-col items-center text-yellow-500">
                  <IconRefresh className="w-16 h-16 animate-spin mb-6" />
                  <h3 className="text-xl font-bold">Đang kết nối...</h3>
                  <p className="text-gray-400 mt-2 text-sm">
                    Đang xác thực thông tin tài khoản
                  </p>
                </div>
              </div>
            )}

            {/* STATE: LOGGED IN */}
            {bot.status?.state === "LOGGED_IN" && (
              <div className="bg-green-900/10 border border-green-800/50 rounded-xl p-8 flex flex-col items-center justify-center min-h-[250px]">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] mb-6 animate-pulse-slow">
                  <IconCheck className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Đang hoạt động
                </h3>
                <p className="text-green-300 text-sm text-center max-w-md mb-8">
                  Bot đã kết nối ổn định. Hệ thống đang lắng nghe tin nhắn.
                </p>

                <button
                  onClick={handleStop}
                  className="px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-2"
                >
                  <span>⏸️</span> Tạm ngưng hoạt động
                </button>
              </div>
            )}

            {/* [NEW] Tích hợp Tab quản lý Bot bên dưới Control Panel */}
            {bot.status?.state === "LOGGED_IN" && (
              <BotDetailTabs botId={bot.id} />
            )}
          </div>

          {/* COLUMN 2: HEALTH STATUS (Chiếm 1/3) */}
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-5 h-fit">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <IconClock className="w-5 h-5 text-blue-400" /> Trạng thái
            </h3>
            <div className="space-y-4 text-sm text-gray-300">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-500">Active:</span>
                <span className="text-white font-mono font-medium">
                  {timeAgo(bot.last_activity_at)}
                </span>
              </div>

              {bot.status?.state === "LOGGED_IN" && (
                <button
                  onClick={handleSyncManual}
                  disabled={isProcessing}
                  className="w-full py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded flex justify-center items-center gap-2 transition-colors text-xs font-bold uppercase tracking-wide"
                >
                  <IconRefresh
                    className={`w-3.5 h-3.5 ${
                      isProcessing ? "animate-spin" : ""
                    }`}
                  />{" "}
                  Đồng bộ dữ liệu
                </button>
              )}

              {/* REALTIME LOG DISPLAY */}
              <div className="pt-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-2">
                  Health Log
                </p>
                <HealthLog log={bot.health_check_log} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL VIEW TOKEN */}
      <JsonViewerModal
        isOpen={!!viewTokenData}
        onClose={() => setViewTokenData(null)}
        title="Thông tin Credentials (Token)"
        data={viewTokenData || {}}
      />
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const style =
    status === "LOGGED_IN"
      ? "bg-green-900 text-green-300 border-green-700"
      : status === "QR_WAITING"
      ? "bg-purple-900 text-purple-300 border-purple-700"
      : status === "STARTING"
      ? "bg-yellow-900 text-yellow-300 border-yellow-700"
      : status === "ERROR"
      ? "bg-red-900 text-red-300 border-red-700"
      : "bg-gray-700 text-gray-300 border-gray-600";

  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${style}`}
    >
      {status || "UNKNOWN"}
    </span>
  );
}
