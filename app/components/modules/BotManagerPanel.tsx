/* eslint-disable @typescript-eslint/no-explicit-any */
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
  toggleRealtimeAction,
  syncBotDataAction,
} from "@/lib/actions/bot.actions";
import { useZaloBotsRealtime } from "@/lib/hooks/useZaloBotsRealtime";
import { BotDetailTabs } from "./BotDetailTabs";
import { LoginPanel } from "./LoginPanel";
import { BotListPanel } from "./BotListPanel";
import { Zap, Power } from "lucide-react"; // Import Lucide Icons

// HealthLog Component
const HealthLog = ({ log }: { log?: ZaloBot["health_check_log"] }) => {
  if (!log) return null;
  // [FIX] Type Casting for JSONB field
  const logData = log as any;

  const isOk = logData.status === "OK";
  const date = logData.timestamp
    ? new Date(logData.timestamp).toLocaleTimeString()
    : "";

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
          <span className="truncate opacity-80" title={logData.message}>
            {logData.message}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 opacity-70 font-mono text-[10px]">
        <span>{date}</span>
        {logData.latency !== undefined && <span>{logData.latency}ms</span>}
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

  // States for Actions
  const [isTogglingRealtime, setIsTogglingRealtime] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // --- HANDLERS (LOGIC MỚI) ---

  const handleToggleRealtime = async (botId: string, currentState: boolean) => {
    setIsTogglingRealtime(true);
    try {
      const res = await toggleRealtimeAction(botId, !currentState);
      if (res.success) {
        // onRefresh(); // Realtime hook will update UI
      } else {
        alert(res.error);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsTogglingRealtime(false);
    }
  };

  const handleManualSync = async (botId: string) => {
    if (
      confirm(
        "Đồng bộ toàn bộ dữ liệu (Bạn bè, Nhóm)? Quá trình này có thể mất vài phút.",
      )
    ) {
      setIsSyncing(true);
      try {
        const res = await syncBotDataAction(botId);
        if (res.success) alert("Đã đồng bộ xong!");
        else alert("Lỗi đồng bộ: " + res.error);
      } catch (e: any) {
        alert(e.message);
      } finally {
        setIsSyncing(false);
      }
    }
  };

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

  // --- ADD BOT FLOW ---
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
      // [UPDATE] Gọi hàm Add Bot có xử lý Merge
      const res = await addBotWithTokenAction(
        tokenInput,
        tempBotId || undefined,
      );
      if (res.success && res.botId) {
        setShowAddModal(false);
        alert("Thêm/Cập nhật Bot thành công!");
        // [AUTO-SELECT] Chuyển ngay sang Bot vừa thêm/merge
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

  // --- RE-LOGIN FLOW ---
  const handleReLoginQR = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    setLoginState("LOGGING_IN");
    try {
      await onStartLogin(reLoginBot.id);
    } catch (e) {
      alert("Lỗi: " + String(e));
      setLoginState("ERROR");
      setIsProcessing(false);
    }
  };

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
    // Auto select temp bot if login success via QR
    if (tempBotId) setSelectedBotId(tempBotId);
  }

  const currentQrCode =
    tempBotId === activeQrBotId || reLoginBot?.id === activeQrBotId
      ? qrCodeData
      : null;

  // Render Modal (Login/Re-login) logic... (Same as before)
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
            {!isQRMode && (
              <div className="grid grid-cols-1 gap-3 mb-6">
                <button
                  onClick={handleReLoginQR}
                  className="flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-full text-blue-400">
                      <IconQrCode className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white">Quét mã QR</div>
                      <div className="text-xs text-gray-400">Tạo phiên mới</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={handleRetrySavedToken}
                  disabled={isProcessing}
                  className="flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-full text-green-400">
                      <IconRefresh className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white">Dùng Token cũ</div>
                      <div className="text-xs text-gray-400">
                        Thử kết nối lại
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setLoginMethod("token")}
                  className={`flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg group ${
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
                        Nhập JSON thủ công
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}
            {isQRMode && (
              <div className="flex flex-col items-center justify-center py-4">
                {qrCodeData ? (
                  <div className="bg-white p-3 rounded-xl shadow-lg mb-4">
                    <img
                      src={qrCodeData}
                      alt="QR"
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-gray-700/30 rounded-xl mb-4">
                    <IconRefresh className="w-8 h-8 animate-spin" />
                  </div>
                )}
                <button
                  onClick={() => {
                    setActiveQrBotId(null);
                    setLoginMethod("qr");
                  }}
                  className="mt-6 text-xs text-red-400 hover:underline"
                >
                  Hủy bỏ
                </button>
              </div>
            )}
            {loginMethod === "token" && !isQRMode && (
              <div className="mt-2 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-black/30 border border-gray-600 rounded p-3 text-xs font-mono text-green-400 min-h-[100px] mb-4"
                  placeholder='{"cookie":..., "imei":...}'
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setLoginMethod("qr")}
                    className="px-3 py-2 text-xs text-gray-400"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleUpdateToken}
                    disabled={!tokenInput || isProcessing}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold disabled:opacity-50"
                  >
                    {isProcessing ? "..." : "Cập nhật"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- RENDER MAIN ---
  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* LEFT: LIST PANEL */}
      <div className="w-[350px] flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
          <h2 className="font-bold text-lg">Danh sách Bot</h2>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="p-2 hover:bg-gray-800 rounded text-gray-400"
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
                className="p-2 bg-blue-600 hover:bg-blue-500 rounded text-white"
              >
                <IconUserPlus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <BotListPanel
            bots={bots}
            selectedBotId={selectedBotId}
            onSelectBot={setSelectedBotId}
            onRefresh={onRefresh}
            width={350}
          />
        </div>
      </div>

      {/* RIGHT: DETAIL PANEL */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
        {selectedBotId && selectedBot ? (
          <div className="flex flex-col h-full animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900 shrink-0">
              <div className="flex items-center gap-4">
                <Avatar
                  src={selectedBot.avatar || ""}
                  alt={selectedBot.name}
                  size="md"
                />
                <div>
                  <h2 className="text-xl font-bold text-white leading-tight flex items-center gap-2">
                    {selectedBot.name}
                    {selectedBot.is_realtime_active && (
                      <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    )}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        selectedBot.status?.state === "LOGGED_IN"
                          ? selectedBot.is_realtime_active
                            ? "bg-green-500"
                            : "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                    ></span>
                    <span className="text-xs text-gray-400 font-mono">
                      {selectedBot.status?.state || "UNKNOWN"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Realtime Toggle */}
                {selectedBot.status?.state === "LOGGED_IN" && (
                  <div className="flex items-center gap-2 bg-gray-800 rounded-full px-3 py-1.5 border border-gray-700">
                    <span
                      className={`text-xs font-bold ${
                        selectedBot.is_realtime_active
                          ? "text-yellow-400"
                          : "text-gray-500"
                      }`}
                    >
                      {selectedBot.is_realtime_active
                        ? "REALTIME ON"
                        : "REALTIME OFF"}
                    </span>
                    <button
                      disabled={isTogglingRealtime}
                      onClick={() =>
                        handleToggleRealtime(
                          selectedBot.id,
                          selectedBot.is_realtime_active,
                        )
                      }
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        selectedBot.is_realtime_active
                          ? "bg-yellow-600"
                          : "bg-gray-600"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          selectedBot.is_realtime_active
                            ? "left-[22px]"
                            : "left-0.5"
                        }`}
                      ></div>
                    </button>
                  </div>
                )}

                {/* Manual Sync */}
                <button
                  onClick={() => handleManualSync(selectedBot.id)}
                  disabled={isSyncing}
                  className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                  title="Đồng bộ dữ liệu ngay"
                >
                  <IconRefresh
                    className={`w-5 h-5 ${isSyncing ? "animate-spin" : ""}`}
                  />
                </button>

                <div className="h-6 w-px bg-gray-700 mx-1"></div>

                {/* Actions */}
                {selectedBot.status?.state === "LOGGED_IN" ? (
                  <button
                    onClick={() =>
                      handleStopBot(selectedBot.id, selectedBot.name)
                    }
                    disabled={isProcessing}
                    className="px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-900/50 rounded text-xs font-bold flex items-center gap-1 hover:bg-red-900/40"
                  >
                    <Power className="w-3 h-3" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setReLoginBot(selectedBot);
                      resetLoginState();
                    }}
                    className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded text-xs font-bold hover:bg-blue-600/40"
                  >
                    Đăng nhập lại
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
                    className="px-3 py-1.5 bg-gray-800 text-gray-500 border border-gray-700 rounded text-xs hover:text-red-400 hover:border-red-900"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs font-bold uppercase tracking-wider">
                  <IconClock className="w-4 h-4" /> Nhật ký hoạt động
                </div>
                <HealthLog log={selectedBot.health_check_log} />
              </div>
              <BotDetailTabs botId={selectedBot.id} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <IconUserPlus className="w-8 h-8 opacity-50" />
            </div>
            <p>Chọn một Bot để xem chi tiết</p>
          </div>
        )}
      </div>

      {/* MODALS */}
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
      {renderReLoginModal()}
    </div>
  );
}
