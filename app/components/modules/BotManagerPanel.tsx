/**
 * app/components/modules/BotManagerPanel.tsx
 * [FIXED V5.9] Added 'setActiveQrBotId' prop.
 * [INTEGRATION] Using Universal LoginPanel for both Add & Re-login.
 */

"use client";
import React, { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import {
  IconRefresh,
  IconUserPlus,
  IconClose,
  IconCheck,
  IconClock,
  IconQrCode,
  IconKey,
} from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  addBotWithTokenAction,
  createPlaceholderBotAction,
  stopBotAction,
  retryBotLoginAction,
  updateBotTokenAction,
} from "@/lib/actions/bot.actions";
import { useZaloBotsRealtime } from "@/lib/hooks/useZaloBotsRealtime";
import { BotDetailTabs } from "./BotDetailTabs";
import { LoginPanel } from "./LoginPanel";

// HealthLog Component
const HealthLog = ({ log }: { log?: ZaloBot["health_check_log"] }) => {
  if (!log) return null;
  const isOk = log.status === "OK";
  const date = new Date(log.timestamp).toLocaleTimeString();
  return (
    <div
      className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-4 transition-all ${
        isOk
          ? "bg-green-900/10 border-green-800/30 text-green-300"
          : "bg-red-900/10 border-red-800/30 text-red-300"
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {isOk ? (
          <IconCheck className="w-4 h-4 shrink-0" />
        ) : (
          <IconClose className="w-4 h-4 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-bold truncate">
            Hệ thống: {isOk ? "Ổn định" : "Cảnh báo"}
          </span>
          <span className="truncate opacity-80" title={log.message}>
            {log.message}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 opacity-70 font-mono text-[10px]">
        <span>{date}</span>
        {log.latency !== undefined && <span>{log.latency}ms</span>}
      </div>
    </div>
  );
};

export function BotManagerPanel({
  bots: initialBots,
  isLoading: initialLoading,
  onRefresh,
  onDeleteBot,
  onStartLogin,
  onCreateBot,
  activeQrBotId,
  setActiveQrBotId,
  qrCodeData,
  userRole,
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteBot: (id: string) => Promise<void>;
  onStartLogin: (id: string) => Promise<void>;
  onCreateBot?: (name: string) => Promise<void>;
  activeQrBotId: string | null;
  setActiveQrBotId: (id: string | null) => void;
  qrCodeData: string | null;
  userRole: string;
}) {
  const bots = useZaloBotsRealtime(initialBots);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [reLoginBot, setReLoginBot] = useState<ZaloBot | null>(null);

  // Login Shared State
  const [loginMethod, setLoginMethod] = useState<"qr" | "token">("qr");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginState, setLoginState] = useState<"IDLE" | "LOGGING_IN" | "ERROR">(
    "IDLE",
  );
  const [tempBotId, setTempBotId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";
  const selectedBot = bots.find((b) => b.id === selectedBotId) || null;

  // --- GENERAL HANDLERS ---
  const resetLoginState = () => {
    setLoginMethod("qr");
    setTokenInput("");
    setLoginState("IDLE");
    setIsProcessing(false);
    setTempBotId(null);
  };

  const handleStopBot = async (botId: string, botName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn dừng Bot "${botName}"?`)) return;
    setIsProcessing(true);
    try {
      await stopBotAction(botId);
      onRefresh();
    } catch (e) {
      alert("Lỗi: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- LOGIN LOGIC (ADD NEW) ---
  const handleStartLoginQR_Add = async () => {
    setIsProcessing(true);
    setLoginState("LOGGING_IN");
    try {
      const newBot = await createPlaceholderBotAction();
      setTempBotId(newBot.id);
      await onStartLogin(newBot.id);
    } catch (e) {
      alert("Lỗi: " + String(e));
      setLoginState("ERROR");
      setIsProcessing(false);
    }
  };

  const handleStartLoginToken_Add = async () => {
    setIsProcessing(true);
    try {
      const res = await addBotWithTokenAction(tokenInput);
      if (res.success && res.botId) {
        setShowAddModal(false);
        onRefresh();
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

  // --- LOGIC 2: ĐĂNG NHẬP LẠI (RE-LOGIN) ---

  // [RENAMED] Đổi tên từ handleStartLoginQR_Re -> handleReLoginQR
  const handleReLoginQR = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    setLoginState("LOGGING_IN");
    try {
      await onStartLogin(reLoginBot.id); // Gọi trực tiếp trên ID cũ
    } catch (e) {
      alert("Lỗi: " + String(e));
      setLoginState("ERROR");
      setIsProcessing(false);
    }
  };

  // [RENAMED] Đổi tên từ handleStartLoginToken_Re -> handleUpdateToken
  const handleUpdateToken = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    try {
      const res = await updateBotTokenAction(reLoginBot.id, tokenInput);
      if (res.success) {
        alert("Cập nhật thành công!");
        setReLoginBot(null);
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

  const handleRetrySavedToken = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    try {
      const res = await retryBotLoginAction(reLoginBot.id);
      if (res.success) {
        alert("Đã gửi lệnh thử lại.");
        setReLoginBot(null);
      } else {
        alert(res.error);
      }
    } catch (e) {
      alert("Lỗi: " + String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  // Effects
  const tempBot = bots.find((b) => b.id === tempBotId);
  if (showAddModal && tempBot && tempBot.status?.state === "LOGGED_IN") {
    setShowAddModal(false);
    resetLoginState();
  }

  if (reLoginBot) {
    const liveBot = bots.find((b) => b.id === reLoginBot.id);
    if (liveBot && liveBot.status?.state === "LOGGED_IN" && !activeQrBotId) {
      // Optional: Auto close if re-login success
    }
  }

  const currentQrCode =
    tempBotId === activeQrBotId || reLoginBot?.id === activeQrBotId
      ? qrCodeData
      : null;

  // --- RENDER RE-LOGIN MODAL (Function inside component) ---
  const renderReLoginModal = () => {
    if (!reLoginBot) return null;

    const isQRMode = activeQrBotId === reLoginBot.id;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Avatar
                src={reLoginBot.avatar || ""}
                alt={reLoginBot.name}
                size="sm"
              />
              Đăng nhập lại: {reLoginBot.name}
            </h3>
            <button
              onClick={() => {
                setReLoginBot(null);
                setActiveQrBotId(null);
              }}
              className="text-gray-400 hover:text-white"
            >
              <IconClose className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
            {/* OPTION TABS */}
            {!isQRMode && (
              <div className="grid grid-cols-1 gap-3 mb-6">
                <button
                  onClick={handleReLoginQR}
                  className="flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-full text-blue-400">
                      <IconQrCode className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white">Quét mã QR</div>
                      <div className="text-xs text-gray-400">
                        Tạo phiên đăng nhập mới
                      </div>
                    </div>
                  </div>
                  <span className="text-gray-500 group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </button>

                <button
                  onClick={handleRetrySavedToken}
                  disabled={isProcessing}
                  className="flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-all group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-full text-green-400">
                      <IconRefresh className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white">Dùng Token cũ</div>
                      <div className="text-xs text-gray-400">
                        Thử kết nối lại với token đã lưu
                      </div>
                    </div>
                  </div>
                  {isProcessing ? (
                    <span className="animate-spin">⌛</span>
                  ) : (
                    <span className="text-gray-500 group-hover:translate-x-1 transition-transform">
                      →
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setLoginMethod("token")}
                  className={`flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-all group ${
                    loginMethod === "token" ? "ring-2 ring-purple-500" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-full text-purple-400">
                      <IconKey className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white">Cập nhật Token</div>
                      <div className="text-xs text-gray-400">
                        Nhập JSON token mới thủ công
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* QR DISPLAY AREA */}
            {isQRMode && (
              <div className="flex flex-col items-center justify-center py-4 animate-fade-in">
                {qrCodeData ? (
                  <div className="bg-white p-3 rounded-xl shadow-lg mb-4">
                    <img
                      src={qrCodeData}
                      alt="QR Code"
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 flex flex-col items-center justify-center bg-gray-700/30 rounded-xl mb-4 text-gray-400 border-2 border-dashed border-gray-600">
                    <IconRefresh className="w-8 h-8 animate-spin mb-2" />
                    <span className="text-xs">Đang lấy mã QR...</span>
                  </div>
                )}
                <p className="text-sm text-center text-gray-300 font-medium">
                  Mở Zalo trên điện thoại và quét mã
                </p>
                <p className="text-xs text-center text-gray-500 mt-1">
                  Mã sẽ hết hạn sau vài phút
                </p>
                <button
                  onClick={() => {
                    setActiveQrBotId(null);
                    setLoginMethod("qr");
                  }}
                  className="mt-6 text-xs text-red-400 hover:text-red-300 underline"
                >
                  Hủy bỏ
                </button>
              </div>
            )}

            {/* TOKEN INPUT AREA */}
            {loginMethod === "token" && !isQRMode && (
              <div className="mt-2 animate-fade-in p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <label className="text-xs text-gray-400 mb-2 block font-bold uppercase">
                  Dán JSON Token mới:
                </label>
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-black/30 border border-gray-600 rounded p-3 text-xs font-mono text-green-400 focus:outline-none focus:border-purple-500 min-h-[100px] mb-4"
                  placeholder='{"cookie":..., "imei":...}'
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setLoginMethod("qr")}
                    className="px-3 py-2 text-xs text-gray-400 hover:text-white"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleUpdateToken}
                    disabled={!tokenInput || isProcessing}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? "Đang xử lý..." : "Cập nhật & Đăng nhập"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- RENDER ---

  // VIEW 2: DETAILS
  if (selectedBotId && selectedBot) {
    return (
      <div className="flex-1 bg-gray-900 flex flex-col h-full overflow-hidden w-full animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-800 bg-gray-900 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedBotId(null)}
              className="p-2 hover:bg-gray-800 rounded-full text-gray-400 transition-colors flex items-center gap-2 group"
            >
              <span className="text-xl group-hover:-translate-x-1 transition-transform">
                ←
              </span>
              <span className="text-sm font-medium">Quay lại</span>
            </button>
            <div className="h-8 w-px bg-gray-700 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 border border-gray-600 shrink-0">
                <Avatar
                  src={selectedBot.avatar || ""}
                  alt={selectedBot.name}
                  size="md"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white leading-tight">
                  {selectedBot.name}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedBot.status?.state === "LOGGED_IN"
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  ></span>
                  <span className="text-xs text-gray-400 font-mono">
                    {selectedBot.status?.state || "UNKNOWN"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {selectedBot.status?.state === "LOGGED_IN" ? (
              <button
                onClick={() => handleStopBot(selectedBot.id, selectedBot.name)}
                disabled={isProcessing}
                className="px-4 py-1.5 bg-yellow-600/20 text-yellow-400 border border-yellow-600/50 rounded text-xs hover:bg-yellow-600/40 transition-colors font-bold flex items-center gap-2"
              >
                {isProcessing ? "..." : "🛑 Dừng Bot"}
              </button>
            ) : (
              <button
                onClick={() => {
                  setReLoginBot(selectedBot);
                  resetLoginState();
                }}
                className="px-4 py-1.5 bg-green-600/20 text-green-400 border border-green-600/50 rounded text-xs hover:bg-green-600/40 transition-colors font-bold flex items-center gap-2"
              >
                🔄 Đăng nhập lại
              </button>
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  if (confirm("Xóa Bot này?")) {
                    await onDeleteBot(selectedBot.id);
                    setSelectedBotId(null);
                  }
                }}
                className="px-3 py-1.5 bg-gray-800 text-gray-500 border border-gray-700 rounded text-xs hover:bg-red-900/20 hover:text-red-400 hover:border-red-900 transition-colors"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs font-bold uppercase tracking-wider">
              <IconClock className="w-4 h-4" /> Nhật ký hoạt động
            </div>
            <HealthLog log={selectedBot.health_check_log} />
          </div>
          <BotDetailTabs botId={selectedBot.id} />
        </div>

        {/* RE-LOGIN MODAL */}
        {renderReLoginModal()}
      </div>
    );
  }

  // VIEW 1: LIST
  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100 overflow-hidden flex-col">
      <div className="p-8 border-b border-gray-800 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Quản lý Bot</h1>
          <p className="text-gray-400 text-sm mt-1">
            Danh sách ({bots.length}) tài khoản Zalo
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 border border-gray-700"
          >
            <IconRefresh
              className={`w-5 h-5 ${initialLoading ? "animate-spin" : ""}`}
            />
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setShowAddModal(true);
                resetLoginState();
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg font-medium text-sm"
            >
              <IconUserPlus className="w-5 h-5" />
              <span>Thêm Bot Mới</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
        {bots.length === 0 && !initialLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
            <p>Chưa có bot nào.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col group relative"
              >
                <div className="p-6 flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 rounded-full bg-gray-700 overflow-hidden border-2 border-gray-600 shrink-0">
                      <Avatar src={bot.avatar || ""} alt={bot.name} size="lg" />
                    </div>
                    <div
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        bot.status?.state === "LOGGED_IN"
                          ? "bg-green-900/30 text-green-400 border-green-800"
                          : "bg-gray-700 text-gray-400 border-gray-600"
                      }`}
                    >
                      {bot.status?.state === "QR_WAITING"
                        ? "SCAN QR"
                        : bot.status?.state || "UNKNOWN"}
                    </div>
                  </div>
                  <h3 className="font-bold text-white text-lg truncate mb-1">
                    {bot.name}
                  </h3>
                  <p className="text-gray-500 text-xs font-mono mb-4 bg-gray-900/50 px-2 py-1 rounded w-fit">
                    {bot.global_id || "ID: ---"}
                  </p>
                  {activeQrBotId === bot.id &&
                    bot.status?.state === "QR_WAITING" && (
                      <div className="mb-4 p-2 bg-white rounded flex justify-center">
                        <span className="text-xs text-black font-bold">
                          Đang chờ quét...
                        </span>
                      </div>
                    )}
                </div>
                <div className="bg-gray-900/50 p-4 border-t border-gray-700 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSelectedBotId(bot.id)}
                    className="col-span-2 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/30 hover:border-blue-600 rounded text-xs font-bold transition-all"
                  >
                    Quản lý Chi tiết
                  </button>
                  {bot.status?.state !== "LOGGED_IN" && (
                    <button
                      onClick={() => {
                        setReLoginBot(bot);
                        resetLoginState();
                      }}
                      disabled={activeQrBotId === bot.id}
                      className="py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors col-span-2"
                    >
                      Đăng nhập lại
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900">
              <h3 className="text-lg font-bold text-white">Thêm Bot Mới</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                <IconClose className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <LoginPanel
                loginState={loginState}
                loginMethod={loginMethod}
                qrCode={currentQrCode}
                isSending={isProcessing}
                tokenInput={tokenInput}
                onLoginMethodChange={setLoginMethod}
                onTokenChange={setTokenInput}
                onStartLoginQR={handleStartLoginQR_Add}
                onStartLoginToken={handleStartLoginToken_Add}
                renderStatus={() => (
                  <span
                    className={`text-xs font-mono ${
                      loginState === "ERROR" ? "text-red-400" : "text-gray-400"
                    }`}
                  >
                    Status: {loginState}
                  </span>
                )}
              />
            </div>
          </div>
        </div>
      )}

      {/* RE-LOGIN MODAL (List view context) */}
      {renderReLoginModal()}
    </div>
  );
}
