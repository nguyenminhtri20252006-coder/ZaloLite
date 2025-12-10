/**
 * app/components/modules/BotManagerPanel.tsx
 * [FIXED]
 * - Fix lỗi "Property does not exist" (thêm prop onStartLogin).
 * - Fix lỗi "no-explicit-any" (xử lý error chuẩn).
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
} from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  syncBotDataAction,
  updateBotSyncSettingsAction,
  retryBotLoginAction,
  addBotWithTokenAction,
  createPlaceholderBotAction,
} from "@/lib/actions/bot.actions";

// --- Helpers ---
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

const getHealthStatus = (dateStr: string | null) => {
  if (!dateStr) return "dead";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60 * 60 * 1000) return "healthy"; // < 1 giờ
  if (diff < 24 * 60 * 60 * 1000) return "warning"; // < 24 giờ
  return "dead"; // > 24 giờ
};

export function BotManagerPanel({
  bots,
  isLoading,
  onRefresh,
  onDeleteBot,
  onStartLogin, // [FIX] Thêm prop này để khớp với BotInterface
  activeQrBotId,
  qrCodeData,
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteBot: (id: string) => void;
  onStartLogin: (id: string) => Promise<void>; // [FIX] Định nghĩa type rõ ràng
  activeQrBotId: string | null;
  qrCodeData: string | null;
}) {
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMethod, setAddMethod] = useState<"SELECT" | "TOKEN">("SELECT");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync Settings State
  const [syncInterval, setSyncInterval] = useState(0);
  const [editingSyncId, setEditingSyncId] = useState<string | null>(null); // [FIX] Bổ sung state thiếu

  const selectedBot = bots.find((b) => b.id === selectedBotId);

  // --- Actions ---

  const handleAddByQR = async () => {
    setIsProcessing(true);
    try {
      const newBot = await createPlaceholderBotAction();
      // Gọi prop để parent set state QR active
      await onStartLogin(newBot.id);

      onRefresh();
      setSelectedBotId(newBot.id);
      setShowAddModal(false);
    } catch (e: unknown) {
      // [FIX] Thay any bằng unknown
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
        onRefresh();
        setSelectedBotId(res.botId);
        setShowAddModal(false);
        setTokenInput("");
      } else {
        alert(res.error);
      }
    } catch (e: unknown) {
      // [FIX] unknown
      alert("Lỗi hệ thống: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoginQR = async (botId: string) => {
    // Gọi prop từ parent thay vì gọi trực tiếp action, để parent update state activeQrBotId
    await onStartLogin(botId);
  };

  const handleSyncManual = async (botId: string) => {
    const res = await syncBotDataAction(botId);
    if (res.success) {
      alert("Đã kích hoạt đồng bộ. Vui lòng đợi vài giây rồi làm mới trang.");
      onRefresh();
    } else {
      alert(res.error);
    }
  };

  const handleSaveSettings = async (botId: string) => {
    await updateBotSyncSettingsAction(botId, syncInterval);
    setEditingSyncId(null);
    onRefresh();
    alert("Đã lưu cấu hình.");
  };

  const handleReLogin = async (botId: string) => {
    if (!confirm("Đăng nhập lại để làm mới token?")) return;
    await retryBotLoginAction(botId);
    onRefresh();
  };

  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100">
      {/* 1. SIDEBAR LIST */}
      <div className="w-80 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-bold text-lg text-white">Danh sách Bot</h2>
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
              className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white shadow"
            >
              <IconUserPlus className="w-5 h-5" />
            </button>
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

      {/* 2. MAIN CONTENT */}
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
              <button
                onClick={() => {
                  if (confirm("Xóa Bot?")) onDeleteBot(selectedBot.id);
                  if (selectedBotId === selectedBot.id) setSelectedBotId(null);
                }}
                className="text-red-400 hover:bg-red-900/30 p-2 rounded border border-red-900/50 flex gap-2 items-center text-sm transition-colors"
              >
                <IconClose className="w-4 h-4" /> Xóa Bot
              </button>
            </div>

            {/* Login & QR Section */}
            {selectedBot.status?.state !== "LOGGED_IN" && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-700 flex flex-col items-center mb-6">
                {selectedBot.status?.state === "QR_WAITING" &&
                qrCodeData &&
                activeQrBotId === selectedBot.id ? (
                  <div className="flex flex-col items-center animate-fade-in">
                    <div className="bg-white p-3 rounded-xl mb-4 shadow-lg">
                      <img
                        src={qrCodeData}
                        className="w-64 h-64 object-contain"
                        alt="QR"
                      />
                    </div>
                    <p className="text-blue-400 animate-pulse font-medium">
                      Quét mã để đăng nhập
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-gray-400 mb-4">
                      Bot chưa kết nối hoặc phiên đã hết hạn.
                    </p>
                    <div className="flex gap-4 justify-center">
                      <button
                        onClick={() => handleLoginQR(selectedBot.id)}
                        className="px-6 py-2 bg-blue-600 rounded text-white font-medium hover:bg-blue-500 shadow-lg"
                      >
                        Lấy mã QR
                      </button>
                      <button
                        onClick={() => retryBotLoginAction(selectedBot.id)}
                        className="px-6 py-2 bg-gray-700 rounded text-white font-medium hover:bg-gray-600"
                      >
                        Thử lại Token cũ
                      </button>
                    </div>
                  </div>
                )}
                {selectedBot.status?.state === "ERROR" && (
                  <p className="mt-4 text-red-400 text-sm bg-red-900/20 px-4 py-2 rounded border border-red-900/50">
                    Lỗi: {selectedBot.status.error_message}
                  </p>
                )}
              </div>
            )}

            {/* Settings & Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Card */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <IconClock className="w-5 h-5 text-blue-400" /> Hoạt động
                </h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Lần cuối active:</span>
                    <span className="text-white font-mono">
                      {timeAgo(selectedBot.last_activity_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cập nhật lúc:</span>
                    <span className="text-white font-mono">
                      {new Date(selectedBot.updated_at).toLocaleString()}
                    </span>
                  </div>
                  {selectedBot.status?.state === "LOGGED_IN" && (
                    <button
                      onClick={() => handleSyncManual(selectedBot.id)}
                      className="w-full mt-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 rounded flex justify-center items-center gap-2 transition-colors"
                    >
                      <IconRefresh className="w-4 h-4" /> Đồng bộ dữ liệu ngay
                    </button>
                  )}
                </div>
              </div>

              {/* Config Card */}
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

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-2">
                      Tự động đồng bộ (phút)
                    </label>
                    {editingSyncId === selectedBot.id ? (
                      <div className="flex gap-2 animate-fade-in">
                        <select
                          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
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
                          className="px-4 bg-purple-600 hover:bg-purple-500 rounded text-white text-sm font-bold transition-colors"
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
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <IconUserPlus className="w-16 h-16 opacity-20 mb-4" />
            <p>Chọn một Bot hoặc thêm mới để bắt đầu.</p>
          </div>
        )}
      </div>

      {/* Modal Add Bot */}
      {showAddModal && (
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
                    className="p-6 bg-gray-700 hover:bg-blue-600/20 border border-gray-600 hover:border-blue-500 rounded-xl flex flex-col items-center transition-all group"
                  >
                    <span className="text-3xl mb-3 group-hover:scale-110 transition-transform">
                      📱
                    </span>
                    <span className="font-bold text-white">Quét QR</span>
                    <span className="text-xs text-gray-400 mt-1">
                      Nhanh & An toàn
                    </span>
                  </button>
                  <button
                    onClick={() => setAddMethod("TOKEN")}
                    className="p-6 bg-gray-700 hover:bg-purple-600/20 border border-gray-600 hover:border-purple-500 rounded-xl flex flex-col items-center transition-all group"
                  >
                    <span className="text-3xl mb-3 group-hover:scale-110 transition-transform">
                      🍪
                    </span>
                    <span className="font-bold text-white">Nhập Token</span>
                    <span className="text-xs text-gray-400 mt-1">
                      Cookie & IMEI
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder='{"cookie":..., "imei":..., "userAgent":...}'
                    className="w-full h-40 bg-gray-900 border border-gray-600 rounded p-3 text-xs font-mono text-green-400 focus:border-purple-500 focus:outline-none resize-none"
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
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-sm flex items-center gap-2"
                    >
                      {isProcessing && (
                        <IconRefresh className="w-4 h-4 animate-spin" />
                      )}
                      Thêm ngay
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
