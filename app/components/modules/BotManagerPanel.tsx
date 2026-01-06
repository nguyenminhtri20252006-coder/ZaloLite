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
  deleteBotAction, // [FIX] Import thêm deleteBotAction
} from "@/lib/actions/bot.actions";
import { useZaloBotsRealtime } from "@/lib/hooks/useZaloBotsRealtime";
import { BotDetailTabs } from "./BotDetailTabs";
import { LoginPanel } from "./LoginPanel";
import { BotListPanel } from "./BotListPanel";
import { Zap, Power } from "lucide-react";

// HealthLog Component giữ nguyên
const HealthLog = ({ log }: { log?: ZaloBot["health_check_log"] }) => {
  if (!log) return null;
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
  qrCodeData: propQrCodeData,
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

  const [isTogglingRealtime, setIsTogglingRealtime] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [loginMethod, setLoginMethod] = useState<"qr" | "token">("qr");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginState, setLoginState] = useState<"IDLE" | "LOGGING_IN" | "ERROR">(
    "IDLE",
  );
  const [tempBotId, setTempBotId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";
  const selectedBot = bots.find((b) => b.id === selectedBotId) || null;

  // Handlers giữ nguyên
  const handleToggleRealtime = async (botId: string, currentState: boolean) => {
    setIsTogglingRealtime(true);
    try {
      const res = await toggleRealtimeAction(botId, !currentState);
      if (res && !res.success) alert(res.error); // Check res exist
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsTogglingRealtime(false);
    }
  };

  const handleManualSync = async (botId: string) => {
    if (confirm("Đồng bộ toàn bộ dữ liệu?")) {
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
    if (!confirm(`Dừng Bot "${botName}"?`)) return;
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

  // ADD BOT FLOW (QR)
  const handleStartLoginQR_Add = async () => {
    setIsProcessing(true);
    setLoginState("LOGGING_IN");

    try {
      const newBot = await createPlaceholderBotAction();
      setTempBotId(newBot.id);
      setActiveQrBotId(newBot.id);

      // Chờ 1.5s để Client kịp kết nối SSE tới Server
      console.log("Waiting for SSE connection...");
      setTimeout(async () => {
        try {
          await onStartLogin(newBot.id);
        } catch (e) {
          console.error(e);
          alert("Lỗi gọi API Login");
        }
      }, 1500);
    } catch (e) {
      alert("Lỗi: " + String(e));
      setLoginState("ERROR");
      setIsProcessing(false);
    }
  };

  // [FIX CRITICAL] ADD BOT FLOW (TOKEN)
  const handleStartLoginToken_Add = async () => {
    setIsProcessing(true);
    try {
      console.log("[Client] Calling addBotWithTokenAction...");
      // Gọi action và ép kiểu any để truy cập property thoải mái (hoặc define interface response)
      const res: any = await addBotWithTokenAction(
        tokenInput,
        tempBotId || undefined,
      );

      console.log("[Client] Response:", res);

      if (res.success) {
        setShowAddModal(false);
        // Bây giờ truy cập res.botId sẽ không bị lỗi TypeScript
        if (res.botId) {
          alert(`Thêm/Cập nhật Bot thành công! (ID: ${res.botId})`);
          setSelectedBotId(res.botId);
        } else {
          alert(
            "Thêm bot thành công nhưng không lấy được ID trả về (Vui lòng refresh).",
          );
        }

        resetLoginState();
      } else {
        // Truy cập res.error an toàn
        alert(res.error || "Có lỗi xảy ra từ Server (Không rõ nguyên nhân).");
        setLoginState("ERROR");
      }
    } catch (e: any) {
      console.error("[Client] Error:", e);
      alert("Lỗi Client: " + (e.message || String(e)));
      setLoginState("ERROR");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReLoginQR = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    setLoginState("LOGGING_IN");
    setActiveQrBotId(reLoginBot.id);
    setTimeout(async () => {
      try {
        await onStartLogin(reLoginBot.id);
      } catch (e) {
        alert("Lỗi: " + String(e));
        setLoginState("ERROR");
        setIsProcessing(false);
      }
    }, 1500);
  };

  const handleUpdateToken = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    try {
      const res: any = await updateBotTokenAction(reLoginBot.id, tokenInput);
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

  // Auto-close modal
  const tempBot = bots.find((b) => b.id === tempBotId);
  // [FIX] Chỉ đóng modal nếu loginState là LOGGING_IN (tránh đóng sớm khi vừa tạo placeholder)
  if (
    showAddModal &&
    tempBot &&
    tempBot.status?.state === "LOGGED_IN" &&
    loginState === "LOGGING_IN"
  ) {
    setShowAddModal(false);
    resetLoginState();
    if (tempBotId) setSelectedBotId(tempBotId);
  }

  // --- RENDER ---
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
            {(isQRMode || loginMethod === "token") && (
              <LoginPanel
                loginState={loginState}
                loginMethod={isQRMode ? "qr" : "token"}
                qrCode={null}
                isSending={isProcessing}
                tokenInput={tokenInput}
                onLoginMethodChange={setLoginMethod}
                onTokenChange={setTokenInput}
                onStartLoginQR={handleReLoginQR}
                onStartLoginToken={handleUpdateToken}
                mode="relogin"
                botName={reLoginBot.name}
                onRetrySavedToken={handleRetrySavedToken}
                activeBotId={reLoginBot.id}
                renderStatus={() => (
                  <span className="text-xs font-mono text-gray-400">
                    Status: {reLoginBot.status?.state || loginState} -{" "}
                    {reLoginBot.status?.message}
                  </span>
                )}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

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
                <button
                  onClick={() => handleManualSync(selectedBot.id)}
                  disabled={isSyncing}
                  className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                >
                  <IconRefresh
                    className={`w-5 h-5 ${isSyncing ? "animate-spin" : ""}`}
                  />
                </button>
                <div className="h-6 w-px bg-gray-700 mx-1"></div>
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
                qrCode={null}
                isSending={isProcessing}
                tokenInput={tokenInput}
                onLoginMethodChange={setLoginMethod}
                onTokenChange={setTokenInput}
                onStartLoginQR={handleStartLoginQR_Add}
                onStartLoginToken={handleStartLoginToken_Add}
                activeBotId={tempBotId}
                renderStatus={() => {
                  const tBot = bots.find((b) => b.id === tempBotId);
                  const statusMsg = tBot?.status?.message || loginState;
                  const statusState = tBot?.status?.state || "UNKNOWN";
                  return (
                    <span
                      className={`text-xs font-mono ${
                        statusState === "ERROR"
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      Status: {statusState} - {statusMsg}
                    </span>
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
      {renderReLoginModal()}
    </div>
  );
}
