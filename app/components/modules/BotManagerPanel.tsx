/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { ZaloBot, HealthCheckLog } from "@/lib/types/database.types";
import {
  IconRefresh,
  IconUserPlus,
  IconClose,
  IconCheck,
  IconClock,
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
  stopBotSyncAction, // [NEW]
  debugBotInfoAction,
} from "@/lib/actions/bot.actions";
import { useZaloBotsRealtime } from "@/lib/hooks/useZaloBotsRealtime";
import { BotDetailTabs } from "./BotDetailTabs";
import { LoginPanel } from "./LoginPanel";
import { BotListPanel } from "./BotListPanel";
import {
  Zap,
  Power,
  Bug,
  Terminal,
  Minimize2,
  Activity,
  Play,
  Pause,
} from "lucide-react";
import { useSSE } from "@/app/context/SSEContext";

// --- INTERNAL COMPONENTS ---

// 1. Log Terminal: Hiển thị log SSE Realtime & Tiến độ
const LogTerminal = ({
  logs,
  onClose,
  isSyncing,
  stats,
  onStop, // [NEW]
}: {
  logs: any[];
  onClose: () => void;
  isSyncing: boolean;
  stats: {
    groupsProcessed: number;
    totalGroups: number;
    friendsProcessed: number;
    eta: string;
  };
  onStop: () => void; // [NEW]
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  // Tính phần trăm tiến độ (Ước lượng: Friends 10%, Groups 90%)
  const progressPercent = useMemo(() => {
    let p = 0;
    if (stats.friendsProcessed > 0) p += 10;
    if (stats.totalGroups > 0)
      p += (stats.groupsProcessed / stats.totalGroups) * 85;
    if (
      !isSyncing &&
      logs.length > 0 &&
      logs[logs.length - 1].type === "success"
    )
      p = 100;
    return Math.min(Math.round(p), 100);
  }, [stats, isSyncing, logs]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0d1117] border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl h-[650px] flex flex-col font-mono text-sm relative overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-[#161b22] rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div
                className="w-3 h-3 rounded-full bg-red-500/80 cursor-pointer"
                onClick={onClose}
                title="Đóng"
              ></div>
              <div
                className="w-3 h-3 rounded-full bg-yellow-500/80 cursor-pointer"
                onClick={onClose}
                title="Thu nhỏ"
              ></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <h3 className="font-bold text-gray-200 flex items-center gap-2 ml-2">
              <Terminal className="w-4 h-4 text-blue-400" /> Sync Terminal
              {isSyncing ? (
                <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-800 animate-pulse">
                  Running...
                </span>
              ) : (
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                  Idle
                </span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-2">
              {stats.eta && isSyncing ? `Còn khoảng: ${stats.eta}` : ""}
            </span>
            {isSyncing && (
              <button
                onClick={onStop}
                className="ml-2 px-2 py-0.5 bg-red-900/50 hover:bg-red-900/80 text-red-400 text-xs border border-red-800 rounded flex items-center gap-1 transition-colors"
              >
                <div className="w-2 h-2 bg-red-500 rounded-sm"></div> Dừng
              </button>
            )}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 text-xs rounded border ${
                autoScroll
                  ? "bg-blue-900/30 border-blue-500/50 text-blue-400"
                  : "bg-transparent border-gray-700 text-gray-500"
              }`}
            >
              {autoScroll ? "Auto-scroll: ON" : "OFF"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded"
              title="Thu nhỏ (Chạy ngầm)"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar Area */}
        <div className="bg-[#161b22] px-4 py-2 border-b border-gray-800 grid grid-cols-3 gap-4 text-xs text-gray-400">
          <div className="flex flex-col gap-1">
            <span>
              Bạn bè:{" "}
              <strong className="text-white">{stats.friendsProcessed}</strong>
            </span>
            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: stats.friendsProcessed > 0 ? "100%" : "0%" }}
              ></div>
            </div>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <div className="flex justify-between">
              <span>
                Nhóm:{" "}
                <strong className="text-white">
                  {stats.groupsProcessed} / {stats.totalGroups || "?"}
                </strong>
              </span>
              <span className="text-green-400 font-bold">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 text-gray-300 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 opacity-50">
              <Terminal className="w-12 h-12 mb-2" />
              <p>Waiting for logs...</p>
            </div>
          )}
          {logs.map((log: any, idx: number) => (
            <div
              key={idx}
              className={`flex gap-2 break-words leading-relaxed group hover:bg-gray-800/30 px-2 py-0.5 -mx-2 rounded ${
                log.type === "error"
                  ? "text-red-400 bg-red-900/10 border-l-2 border-red-500"
                  : log.type === "success"
                  ? "text-green-400 bg-green-900/10 border-l-2 border-green-500"
                  : log.type === "warning"
                  ? "text-yellow-400 bg-yellow-900/10 border-l-2 border-yellow-500"
                  : "text-gray-300"
              }`}
            >
              <span className="text-gray-600 text-[10px] whitespace-nowrap mt-1 font-mono opacity-60 w-[70px]">
                {new Date(log.timestamp).toLocaleTimeString([], {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <div className="flex-1">{log.message}</div>
            </div>
          ))}
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>
    </div>
  );
};

// 2. Health Log: Hiển thị trạng thái hệ thống
const HealthLog = ({ log }: { log?: any }) => {
  if (!log) return null;
  const logData = log as HealthCheckLog;
  return (
    <div
      className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-4 transition-all ${
        logData.status === "OK"
          ? "bg-green-900/10 border-green-800/30 text-green-300"
          : "bg-red-900/10 border-red-800/30 text-red-300"
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {logData.status === "OK" ? (
          <IconCheck className="w-4 h-4 shrink-0" />
        ) : (
          <IconClose className="w-4 h-4 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-bold truncate">
            Hệ thống: {logData.status === "OK" ? "Ổn định" : "Cảnh báo"}
          </span>
          <span className="truncate opacity-80" title={logData.message}>
            {logData.message}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 opacity-70 font-mono text-[10px]">
        <span>
          {logData.timestamp
            ? new Date(logData.timestamp).toLocaleTimeString()
            : ""}
        </span>
        {logData.latency !== undefined && <span>{logData.latency}ms</span>}
      </div>
    </div>
  );
};

// [UPDATED] Sync Status Badge
const SyncStatusBadge = ({ status }: { status: any }) => {
  if (!status) return null;

  const lastRun = status.last_updated
    ? new Date(status.last_updated).toLocaleString()
    : "Chưa chạy";
  const isRunning = status.state === "RUNNING";
  const isError = status.state === "ERROR";
  const isStopped = status.state === "STOPPED";

  let colorClass = "text-gray-400 bg-gray-800 border-gray-700";
  if (isRunning)
    colorClass = "text-blue-400 bg-blue-900/20 border-blue-800 animate-pulse";
  else if (isError) colorClass = "text-red-400 bg-red-900/20 border-red-800";
  else if (isStopped)
    colorClass = "text-yellow-400 bg-yellow-900/20 border-yellow-800";
  else if (status.state === "COMPLETED")
    colorClass = "text-green-400 bg-green-900/20 border-green-800";

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border text-xs mt-3 ${colorClass}`}
    >
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4" />
        <div className="flex flex-col">
          <span className="font-bold">Sync: {status.state || "UNKNOWN"}</span>
          <span className="text-[10px] opacity-70">
            {status.detail
              ? status.detail
              : status.progress
              ? `Tiến độ: ${status.progress}%`
              : status.step
              ? `Bước: ${status.step}`
              : "Sẵn sàng"}
          </span>
        </div>
      </div>
      <div className="text-[10px] opacity-60 text-right flex flex-col">
        <span>{lastRun}</span>
        {status.error && (
          <span
            className="text-red-400 font-bold max-w-[150px] truncate"
            title={status.error}
          >
            {status.error}
          </span>
        )}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

export function BotManagerPanel({
  bots: initialBots,
  isLoading: initialLoading,
  onRefresh,
  onDeleteBot,
  onStartLogin,
  activeQrBotId,
  setActiveQrBotId,
  userRole,
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteBot: (id: string) => Promise<void>;
  onStartLogin: (id: string) => Promise<void>;
  activeQrBotId: string | null;
  setActiveQrBotId: (id: string | null) => void;
  qrCodeData: string | null;
  userRole: string;
}) {
  const bots = useZaloBotsRealtime(initialBots);

  const isAdmin = userRole === "admin";
  const { subscribe, unsubscribe, isConnected } = useSSE();

  // STATE MANAGEMENT
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const selectedBot = bots.find((b) => b.id === selectedBotId) || null;

  // Login & Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [reLoginBot, setReLoginBot] = useState<ZaloBot | null>(null);
  const [loginMethod, setLoginMethod] = useState<"qr" | "token">("qr");
  const [tokenInput, setTokenInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginState, setLoginState] = useState<"IDLE" | "LOGGING_IN" | "ERROR">(
    "IDLE",
  );
  const [tempBotId, setTempBotId] = useState<string | null>(null);

  // Sync & Debug State
  const [isTogglingRealtime, setIsTogglingRealtime] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);
  const [showLogTerminal, setShowLogTerminal] = useState(false);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  // [NEW] Stats Tracking
  const [syncStats, setSyncStats] = useState({
    groupsProcessed: 0,
    totalGroups: 0,
    friendsProcessed: 0,
    eta: "",
  });

  // -- SSE EFFECT --
  useEffect(() => {
    if (selectedBot && (selectedBot as any).sync_status) {
      const s = (selectedBot as any).sync_status;
      if (s.state === "RUNNING") {
        setIsSyncing(true);
        if (s.progress)
          setSyncStats((prev) => ({ ...prev, groupsProcessed: s.progress }));
      } else {
        setIsSyncing(false);
      }
    }
  }, [selectedBot]);

  // [NEW] SSE HANDLER using Context
  // Logic: Khi component mount, hoặc selectedBotId thay đổi, ta subscribe vào Global SSE
  // Global SSE sẽ tự giữ kết nối kể cả khi unmount component này (vì Provider ở Layout)
  useEffect(() => {
    if (!selectedBotId) return;

    // Topic Sync
    const topic = `sync_bot_${selectedBotId}`;

    const handleLog = (data: any) => {
      // Double check botId in payload (Optional but safer)
      if (data.botId && data.botId !== selectedBotId) return;

      if (showLogTerminal || isSyncing) {
        setSyncLogs((prev) => {
          const newLogs = [...prev, data];
          return newLogs.length > 500
            ? newLogs.slice(newLogs.length - 500)
            : newLogs;
        });

        // Update Stats from Log Message (Client-side parsing fallback)
        const msg = data.message || "";
        if (msg.includes("bạn bè")) {
          const match = msg.match(/(\d+)/);
          if (match)
            setSyncStats((prev) => ({
              ...prev,
              friendsProcessed: parseInt(match[0]),
            }));
        }
        if (msg.includes("nhóm")) {
          const match = msg.match(/(\d+)/);
          if (match)
            setSyncStats((prev) => ({
              ...prev,
              totalGroups: parseInt(match[0]),
            }));
        }
      }
    };

    subscribe(topic, "sync-log", handleLog);

    return () => {
      unsubscribe(topic, "sync-log", handleLog);
    };
  }, [selectedBotId, showLogTerminal, isSyncing, subscribe, unsubscribe]);

  // HANDLERS
  const handleStopSync = async () => {
    if (!selectedBotId) return;
    if (confirm("Bạn muốn dừng quá trình đồng bộ ngay lập tức?")) {
      // Optimistic UI Update
      setSyncLogs((prev) => [
        ...prev,
        {
          timestamp: new Date(),
          message: "🛑 Đang gửi lệnh dừng...",
          type: "warning",
        },
      ]);

      await stopBotSyncAction(selectedBotId);
    }
  };

  const handleManualSync = async (botId: string) => {
    if (
      confirm(
        "Đồng bộ toàn bộ dữ liệu? Quá trình có thể mất từ 5-10 phút tùy số lượng nhóm.",
      )
    ) {
      setIsSyncing(true);
      setSyncLogs([]);
      setSyncStats({
        groupsProcessed: 0,
        totalGroups: 0,
        friendsProcessed: 0,
        eta: "Đang tính...",
      });
      setShowLogTerminal(true);

      try {
        setSyncLogs((prev) => [
          ...prev,
          {
            timestamp: new Date(),
            message: `--> Gửi lệnh Sync...`,
            type: "info",
          },
        ]);

        const res = await syncBotDataAction(botId);

        if (!res.success) {
          setSyncLogs((prev) => [
            ...prev,
            {
              timestamp: new Date(),
              message: `Lỗi Sync Action: ${res.error}`,
              type: "error",
            },
          ]);
          setIsSyncing(false);
        }
      } catch (e: any) {
        setSyncLogs((prev) => [
          ...prev,
          {
            timestamp: new Date(),
            message: `Lỗi Client Call: ${e.message}`,
            type: "error",
          },
        ]);
        setIsSyncing(false);
      }
    }
  };

  // ... (Other handlers keep same logic)
  const resetLoginState = () => {
    setLoginMethod("qr");
    setTokenInput("");
    setLoginState("IDLE");
    setIsProcessing(false);
    setTempBotId(null);
  };
  const handleDebug = async (botId: string) => {
    setIsDebugging(true);
    try {
      const res: any = await debugBotInfoAction(botId);
      if (res.success) {
        alert("Check Server Console.");
        console.log("Debug:", res.data);
      } else alert("Lỗi: " + res.error);
    } catch (e: any) {
      alert("Lỗi: " + e.message);
    } finally {
      setIsDebugging(false);
    }
  };
  const handleToggleRealtime = async (botId: string, currentState: boolean) => {
    setIsTogglingRealtime(true);
    try {
      const res = await toggleRealtimeAction(botId, currentState);
      if (res && !res.success) {
        alert(res.error);
      } else {
        onRefresh();
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsTogglingRealtime(false);
    }
  };
  const handleStopBot = async (botId: string, botName: string) => {
    if (!confirm(`Dừng Bot?`)) return;
    setIsProcessing(true);
    try {
      await stopBotAction(botId);
      onRefresh();
    } catch (e) {
      alert(String(e));
    } finally {
      setIsProcessing(false);
    }
  };
  const handleStartLoginQR_Add = async (clientTempId?: string) => {
    setIsProcessing(true);
    setLoginState("LOGGING_IN");
    try {
      let targetId = clientTempId;
      if (!targetId) {
        const newBot = await createPlaceholderBotAction();
        targetId = newBot.id;
      }
      setTempBotId(targetId);
      setActiveQrBotId(targetId);
      await onStartLogin(targetId);
    } catch (e) {
      alert(String(e));
      setLoginState("ERROR");
      setIsProcessing(false);
    }
  };
  const handleStartLoginToken_Add = async () => {
    setIsProcessing(true);
    try {
      const res: any = await addBotWithTokenAction(
        tokenInput,
        tempBotId || undefined,
      );
      if (res.success && res.botId) {
        setShowAddModal(false);
        resetLoginState();
        setSelectedBotId(res.botId);
        onRefresh();
      } else {
        alert(res.error);
        setLoginState("ERROR");
      }
    } catch (e) {
      alert(String(e));
      setLoginState("ERROR");
    } finally {
      setIsProcessing(false);
    }
  };
  const handleLoginSuccess = (realId: string) => {
    setShowAddModal(false);
    setReLoginBot(null);
    resetLoginState();
    setSelectedBotId(realId);
    onRefresh();
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
        alert(String(e));
        setLoginState("ERROR");
        setIsProcessing(false);
      }
    }, 500);
  };
  const handleRetrySavedToken = async () => {
    if (!reLoginBot) return;
    setIsProcessing(true);
    try {
      const res = await retryBotLoginAction(reLoginBot.id);
      if (res.success) {
        alert("Đã gửi lệnh thử lại.");
        setReLoginBot(null);
        onRefresh();
      } else alert(res.error);
    } catch (e) {
      alert(String(e));
    } finally {
      setIsProcessing(false);
    }
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
      } else alert(res.error);
    } catch (e) {
      alert(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- RENDER HELPERS ---
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
            {!isQRMode ? (
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleReLoginQR}
                  className="flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-full text-blue-400">
                      <IconRefresh className="w-6 h-6" />
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
                  className="flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg group"
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
            ) : (
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
                onSuccess={handleLoginSuccess}
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
                      <div className="px-2 py-0.5 bg-green-900/40 text-green-400 text-[10px] rounded border border-green-700 flex items-center gap-1">
                        <Activity className="w-3 h-3 animate-pulse" />
                        LISTENING
                      </div>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        selectedBot.status?.state === "ACTIVE"
                          ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                          : selectedBot.status?.state === "LOGGED_IN"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                    ></span>
                    <span className="text-xs text-gray-400 font-mono">
                      {selectedBot.status?.state === "ACTIVE"
                        ? "ĐANG LẮNG NGHE"
                        : selectedBot.status?.state === "LOGGED_IN"
                        ? "CHỜ KÍCH HOẠT (STANDBY)"
                        : "DỪNG HOẠT ĐỘNG"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {selectedBot.status?.state === "LOGGED_IN" ||
                selectedBot.status?.state === "ACTIVE" ? (
                  <>
                    {/* 1. Toggle Realtime Button */}
                    <button
                      onClick={() =>
                        handleToggleRealtime(
                          selectedBot.id,
                          !selectedBot.is_realtime_active,
                        )
                      }
                      disabled={isTogglingRealtime}
                      className={`px-4 py-2 rounded text-xs font-bold flex items-center gap-2 transition-all border shadow-lg ${
                        selectedBot.is_realtime_active
                          ? "bg-red-600/20 text-red-400 border-red-600/50 hover:bg-red-600/30"
                          : "bg-green-600/20 text-green-400 border-green-600/50 hover:bg-green-600/30"
                      }`}
                      title={
                        selectedBot.is_realtime_active
                          ? "Tắt chế độ lắng nghe sự kiện"
                          : "Bật chế độ lắng nghe sự kiện (Realtime)"
                      }
                    >
                      {isTogglingRealtime ? (
                        <IconRefresh className="w-4 h-4 animate-spin" />
                      ) : selectedBot.is_realtime_active ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      {selectedBot.is_realtime_active
                        ? "Tắt Lắng Nghe"
                        : "Bật Lắng Nghe"}
                    </button>

                    <div className="h-6 w-px bg-gray-700 mx-1"></div>

                    {/* 2. Sync Button */}
                    <button
                      onClick={() => {
                        if (!isSyncing) handleManualSync(selectedBot.id);
                        else setShowLogTerminal(true);
                      }}
                      className={`px-3 py-2 bg-blue-900/20 text-blue-400 border border-blue-900/50 rounded text-xs font-bold flex items-center gap-2 hover:bg-blue-900/30 transition-all ${
                        isSyncing
                          ? "animate-pulse border-blue-500 ring-1 ring-blue-500/50"
                          : ""
                      }`}
                      title="Đồng bộ danh bạ và nhóm"
                    >
                      <IconRefresh
                        className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                      />
                      {isSyncing ? "Đang đồng bộ..." : "Đồng bộ Dữ liệu"}
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => handleDebug(selectedBot.id)}
                        disabled={isDebugging}
                        className="px-3 py-2 bg-purple-900/20 text-purple-400 border border-purple-900/50 rounded text-xs font-bold flex items-center gap-2 hover:bg-purple-900/30 transition-all"
                        title="Kiểm tra thông tin Bot (Logs)"
                      >
                        <Bug
                          className={`w-4 h-4 ${
                            isDebugging ? "animate-pulse" : ""
                          }`}
                        />
                        Debug Info
                      </button>
                    )}

                    <div className="h-6 w-px bg-gray-700 mx-1"></div>

                    {/* 4. Stop Button */}
                    <button
                      onClick={() =>
                        handleStopBot(selectedBot.id, selectedBot.name)
                      }
                      disabled={isProcessing}
                      className="px-3 py-2 bg-gray-800 text-gray-400 border border-gray-600 rounded text-xs font-bold flex items-center gap-2 hover:bg-red-900/20 hover:text-red-400 hover:border-red-800 transition-all"
                    >
                      <Power className="w-4 h-4" /> Dừng Bot
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setReLoginBot(selectedBot);
                      resetLoginState();
                    }}
                    className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded text-sm font-bold hover:bg-blue-600/40 flex items-center gap-2"
                  >
                    <IconRefresh className="w-4 h-4" />
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
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                    title="Xóa Bot khỏi hệ thống"
                  >
                    <IconClose className="w-5 h-5" />
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

                <SyncStatusBadge status={(selectedBot as any).sync_status} />
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

      {showLogTerminal && (
        <LogTerminal
          logs={syncLogs}
          onClose={() => setShowLogTerminal(false)}
          isSyncing={isSyncing}
          stats={syncStats}
          onStop={handleStopSync}
        />
      )}

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
                onSuccess={handleLoginSuccess}
                activeBotId={tempBotId}
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
