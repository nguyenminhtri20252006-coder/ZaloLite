"use client";

import { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import {
  IconRefresh,
  IconUserPlus,
  IconCog,
  IconClose,
  IconCheck,
} from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import { syncBotDataAction } from "@/lib/actions/bot.actions";

// Icon Cloud Sync
const IconCloudSync = ({ className }: { className: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M4.5 9.75a6 6 0 0111.573-2.226 3.75 3.75 0 014.133 4.303A4.5 4.5 0 0118 20.25H6.75a5.25 5.25 0 01-2.25-10.5zM2.25 15a6.75 6.75 0 006.75 6.75H18A6 6 0 0024 15.75c0-2.658-1.706-4.93-4.1-5.75a6.75 6.75 0 00-11.8-2.25A6.75 6.75 0 002.25 15z"
      clipRule="evenodd"
    />
    <path d="M12 12.75a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-3.75z" />
  </svg>
);

export function BotManagerPanel({
  bots,
  isLoading,
  onRefresh,
  onCreateBot,
  onDeleteBot,
  onStartLogin,
  activeQrBotId,
  qrCodeData,
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateBot: (name: string) => void;
  onDeleteBot: (id: string) => void;
  onStartLogin: (id: string) => void;
  activeQrBotId: string | null;
  qrCodeData: string | null;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  // State quản lý loading Sync cho từng bot
  const [syncingBotId, setSyncingBotId] = useState<string | null>(null);

  const handleCreateSubmit = () => {
    if (!newBotName.trim()) return;
    onCreateBot(newBotName);
    setNewBotName("");
    setIsCreating(false);
  };

  const handleSyncData = async (botId: string) => {
    if (syncingBotId) return;
    setSyncingBotId(botId);
    try {
      const res = await syncBotDataAction(botId);
      if (res.success) {
        alert(res.message);
      } else {
        alert("Lỗi đồng bộ: " + res.error);
      }
    } catch (e: unknown) {
      alert("Lỗi hệ thống khi đồng bộ.");
    } finally {
      setSyncingBotId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white">Quản lý Bot Zalo</h1>
          <p className="text-sm text-gray-400 mt-1">
            Danh sách các tài khoản OA/Profile ({bots.length})
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors"
          >
            <IconRefresh
              className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20"
          >
            <IconUserPlus className="w-5 h-5" />
            Thêm Bot Mới
          </button>
        </div>
      </div>

      {/* Form Tạo Bot Mới */}
      {isCreating && (
        <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-blue-500/30 animate-fade-in-down">
          <h3 className="text-sm font-bold text-blue-400 mb-2">
            Cấu hình Bot Mới
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="Đặt tên gợi nhớ cho Bot..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubmit()}
            />
            <button
              onClick={handleCreateSubmit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
            >
              Tạo Ngay
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Grid Danh sách Bot */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-10">
        {bots.length === 0 && !isLoading && (
          <div className="col-span-full flex flex-col items-center justify-center h-64 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
            <IconCog className="w-12 h-12 mb-4 opacity-20" />
            <p>Chưa có Bot nào được cấu hình.</p>
          </div>
        )}

        {bots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            onDelete={() => onDeleteBot(bot.id)}
            onLogin={() => onStartLogin(bot.id)}
            onSync={() => handleSyncData(bot.id)}
            isQrActive={activeQrBotId === bot.id}
            qrCode={activeQrBotId === bot.id ? qrCodeData : null}
            isSyncing={syncingBotId === bot.id}
          />
        ))}
      </div>
    </div>
  );
}

// --- Sub-component: Bot Card ---
function BotCard({
  bot,
  onDelete,
  onLogin,
  onSync,
  isQrActive,
  qrCode,
  isSyncing,
}: {
  bot: ZaloBot;
  onDelete: () => void;
  onLogin: () => void;
  onSync: () => void;
  isQrActive: boolean;
  qrCode: string | null;
  isSyncing: boolean;
}) {
  const currentState = bot.status?.state || "STOPPED";
  const isLoggedIn = currentState === "LOGGED_IN";

  return (
    <div className="group relative bg-gray-800 rounded-xl border border-gray-700 shadow-sm hover:shadow-xl hover:border-gray-600 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Status Bar */}
      <div
        className={`h-1.5 w-full ${
          isLoggedIn
            ? "bg-green-600"
            : currentState === "ERROR"
            ? "bg-red-600"
            : "bg-gray-600"
        }`}
      />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header Info */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar src={bot.avatar || ""} alt={bot.name} />
            <div>
              <h3
                className="font-bold text-white text-lg truncate max-w-[140px]"
                title={bot.name}
              >
                {bot.name}
              </h3>
              <p className="text-xs text-gray-400 font-mono truncate max-w-[140px]">
                ID: {bot.global_id || "Chưa login"}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              if (window.confirm("Bạn có chắc chắn muốn xóa Bot này không?"))
                onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-all"
            title="Xóa Bot"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[160px] bg-gray-900/50 rounded-lg border border-gray-700/50 p-4 mb-4">
          {isQrActive && qrCode ? (
            <div className="flex flex-col items-center animate-fade-in">
              <div className="bg-white p-2 rounded-lg mb-2">
                <img
                  src={qrCode}
                  alt="Scan me"
                  className="w-32 h-32 object-contain"
                />
              </div>
              <p className="text-xs text-purple-300 font-medium animate-pulse">
                Quét mã Zalo để đăng nhập
              </p>
            </div>
          ) : isLoggedIn ? (
            <div className="text-center w-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-900/30 text-green-400 mb-2">
                <IconCheck className="w-6 h-6" />
              </div>
              <p className="text-sm text-green-400 font-medium mb-3">
                Session Active
              </p>

              {/* Sync Button */}
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800 rounded-lg text-xs text-blue-300 transition-colors"
              >
                <IconCloudSync
                  className={`w-4 h-4 ${isSyncing ? "animate-bounce" : ""}`}
                />
                {isSyncing ? "Đang đồng bộ..." : "Đồng bộ Dữ liệu"}
              </button>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <p className="text-sm mb-1">{currentState}</p>
              {currentState === "ERROR" && (
                <p className="text-xs text-red-400 max-w-[200px] truncate">
                  {bot.status.error_message || "Lỗi không xác định"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isLoggedIn && (
          <button
            onClick={onLogin}
            disabled={currentState === "QR_WAITING"}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm ${
              currentState === "QR_WAITING"
                ? "bg-purple-900/50 text-purple-300 border border-purple-700 cursor-wait"
                : "bg-white text-gray-900 hover:bg-gray-100"
            }`}
          >
            {currentState === "QR_WAITING"
              ? "Đang chờ..."
              : "Đăng nhập / Kích hoạt"}
          </button>
        )}
      </div>
    </div>
  );
}
