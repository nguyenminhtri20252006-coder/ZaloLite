/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { ReactNode, useEffect, useState, useMemo } from "react";
import { LoginState } from "@/lib/types/zalo.types";
import {
  IconRefresh,
  IconQrCode,
  IconKey,
  IconClose,
} from "@/components/ui/Icons";
import {
  cancelLoginAction,
  resolveLoginConflictAction,
} from "@/lib/actions/bot.actions";
import { useSSE } from "@/context/SSEContext"; // New Hook

interface LoginPanelProps {
  loginState: LoginState;
  loginMethod: "qr" | "token";
  qrCode: string | null;
  isSending: boolean;
  tokenInput: string;

  onLoginMethodChange: (method: "qr" | "token") => void;
  onTokenChange: (token: string) => void;
  onStartLoginQR: (tempId?: string) => void;
  onStartLoginToken: () => void;
  onSuccess?: (realId: string) => void;
  mode?: "create" | "relogin";
  botName?: string;
  onRetrySavedToken?: () => void;
  activeBotId?: string | null;
  renderStatus: () => ReactNode;
}

// [FIX 1] Bọc React.memo để tránh re-render không cần thiết từ cha
export const LoginPanel = React.memo(function LoginPanel({
  loginState,
  loginMethod,
  qrCode: propQrCode,
  isSending,
  onLoginMethodChange,
  onTokenChange,
  onStartLoginQR,
  onStartLoginToken,
  tokenInput,
  onSuccess,
  mode = "create",
  botName,
  onRetrySavedToken,
  activeBotId,
  renderStatus,
}: LoginPanelProps) {
  const isRelogin = mode === "relogin";
  const { subscribe, unsubscribe, isConnected } = useSSE();

  // State SSE
  const [sseQr, setSseQr] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<string>("");
  const [conflictData, setConflictData] = useState<any>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Generate Temp ID once
  const tempSessionId = useMemo(() => {
    return isRelogin
      ? null
      : `sess_${Math.random().toString(36).substring(2, 10)}`;
  }, [isRelogin]);

  const topicId = isRelogin ? activeBotId : tempSessionId;
  const displayQr = sseQr || propQrCode;

  // SSE Subscription Logic
  useEffect(() => {
    if (!topicId || loginMethod !== "qr") return;

    console.log(`[LoginPanel] Subscribing to topic: ${topicId}`);

    const handleQr = (data: any) => {
      if (data.image) setSseQr(data.image);
    };
    const handleStatus = (data: any) => {
      if (data.message) setSseStatus(data.message);
    };
    const handleConflict = (data: any) => setConflictData(data);
    const handleError = (data: any) => setSseStatus(`Lỗi: ${data.message}`);
    const handleSuccess = (data: any) => {
      setSseStatus(data.message || "Thành công!");
      setTimeout(() => {
        if (onSuccess && data.realId) onSuccess(data.realId);
        else window.location.reload();
      }, 1000);
    };

    subscribe(topicId, "qr", handleQr);
    subscribe(topicId, "status", handleStatus);
    subscribe(topicId, "conflict", handleConflict);
    subscribe(topicId, "error", handleError);
    subscribe(topicId, "success", handleSuccess);

    return () => {
      unsubscribe(topicId, "qr", handleQr);
      unsubscribe(topicId, "status", handleStatus);
      unsubscribe(topicId, "conflict", handleConflict);
      unsubscribe(topicId, "error", handleError);
      unsubscribe(topicId, "success", handleSuccess);

      // Cleanup temp session on unmount
      if (tempSessionId) cancelLoginAction(tempSessionId).catch(() => {});
    };
  }, [topicId, loginMethod, subscribe, unsubscribe, tempSessionId, onSuccess]);

  const handleCancel = () => {
    if (tempSessionId) cancelLoginAction(tempSessionId);
    window.location.reload();
  };

  // [UPDATED] Xử lý Retry
  const handleResolveConflict = async (decision: "retry" | "create_new") => {
    if (!conflictData || !conflictData.botId) return;
    setIsResolving(true);
    try {
      const res: any = await resolveLoginConflictAction(
        conflictData.botId,
        decision,
      );
      if (res.success) {
        setConflictData(null);
        // Nếu chọn retry -> Reset UI để user quét lại
        if (decision === "retry") {
          setSseStatus("Đã hủy phiên sai. Vui lòng quét lại QR.");
          setSseQr(null); // Xóa QR cũ
          // Gọi lại login để lấy QR mới
          // [FIX] Use topicId instead of connectionId
          if (onStartLoginQR && topicId) {
            setTimeout(() => onStartLoginQR(topicId), 1000);
          }
        }
      } else {
        alert("Lỗi: " + res.error);
      }
    } catch (e: any) {
      alert("Lỗi client: " + e.message);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center justify-center relative">
      <div className="w-full max-w-md">
        {/* Header */}
        <h1 className="mb-2 text-center text-xl font-bold text-white">
          {isRelogin ? `Đăng nhập lại: ${botName}` : "Thêm Bot Mới"}
        </h1>
        <div className="mb-6 text-center text-gray-400 text-xs font-mono flex flex-col gap-1">
          {renderStatus()}
          {sseStatus && (
            <span className="text-blue-400 font-bold animate-pulse">
              {sseStatus}
            </span>
          )}
        </div>

        {/* CONFLICT MODAL OVERLAY */}
        {conflictData && (
          <div className="absolute inset-0 z-50 bg-gray-900/95 flex flex-col items-center justify-center p-6 text-center rounded-xl border border-red-500/50 animate-in fade-in zoom-in duration-200">
            <div className="bg-red-900/20 p-3 rounded-full mb-3 text-red-500">
              <IconClose className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Tài khoản không khớp!
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              Bạn đang đăng nhập:{" "}
              <strong className="text-yellow-400">
                {conflictData.newName}
              </strong>
              <br />
              Nhưng Bot này là:{" "}
              <strong className="text-blue-400">{conflictData.oldName}</strong>
            </p>

            <div className="flex flex-col gap-2 w-full">
              {/* [UPDATED] Button Retry */}
              <button
                onClick={() => handleResolveConflict("retry")}
                disabled={isResolving}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white rounded-lg font-bold text-sm transition-colors"
              >
                {isResolving
                  ? "Đang xử lý..."
                  : "Hủy bỏ & Quét lại đúng tài khoản"}
              </button>

              <button
                onClick={() => handleResolveConflict("create_new")}
                disabled={isResolving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-colors"
              >
                {isResolving ? "Đang xử lý..." : "Tạo thành Bot mới"}
              </button>
            </div>
          </div>
        )}

        {(loginState === "IDLE" || loginState === "ERROR") && !conflictData && (
          <div className="flex flex-col gap-3 animate-fade-in">
            {isRelogin && onRetrySavedToken && (
              <button
                onClick={onRetrySavedToken}
                disabled={isSending}
                className="flex items-center justify-between p-3 rounded-lg bg-green-900/20 border border-green-800 hover:bg-green-900/40 text-green-400 transition-all group mb-2"
              >
                <div className="flex items-center gap-3">
                  <IconRefresh className="w-5 h-5" />
                  <div className="text-left">
                    <span className="block text-sm font-bold">
                      Dùng Token cũ
                    </span>
                    <span className="block text-[10px] opacity-70">
                      Thử kết nối lại
                    </span>
                  </div>
                </div>
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </button>
            )}

            <div className="flex rounded-lg bg-gray-900 p-1 border border-gray-700">
              <button
                onClick={() => onLoginMethodChange("qr")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-bold transition-colors ${
                  loginMethod === "qr"
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-400 hover:bg-gray-800"
                }`}
              >
                <IconQrCode className="w-4 h-4" /> Quét QR
              </button>
              <button
                onClick={() => onLoginMethodChange("token")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-bold transition-colors ${
                  loginMethod === "token"
                    ? "bg-purple-600 text-white shadow"
                    : "text-gray-400 hover:bg-gray-800"
                }`}
              >
                <IconKey className="w-4 h-4" /> Token
              </button>
            </div>

            {loginMethod === "qr" && (
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-center">
                {/* [FIX] Luôn hiển thị nút, nhưng disable nếu SSE chưa ready */}
                <button
                  onClick={() => onStartLoginQR(topicId!)}
                  disabled={isSending || !isConnected}
                  className="w-full rounded-lg bg-blue-600 py-2.5 px-4 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {!isConnected ? (
                    <>
                      <IconRefresh className="w-4 h-4 animate-spin" /> Kết nối
                      Server...
                    </>
                  ) : (
                    "Lấy mã QR"
                  )}
                </button>
                <p className="mt-2 text-[10px] text-gray-500">
                  Mã QR sẽ được tạo trực tiếp từ Zalo
                </p>
              </div>
            )}

            {loginMethod === "token" && (
              /* ... UI Token giữ nguyên ... */
              <div className="flex flex-col gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <textarea
                  value={tokenInput}
                  onChange={(e) => onTokenChange(e.target.value)}
                  rows={4}
                  className="w-full rounded bg-black/40 p-3 font-mono text-xs text-green-400 border border-gray-600"
                />
                <button
                  onClick={onStartLoginToken}
                  disabled={isSending}
                  className="w-full rounded-lg bg-purple-600 py-2.5 px-4 font-bold text-white"
                >
                  Xác thực & Login
                </button>
              </div>
            )}
          </div>
        )}

        {/* STATE LOGGING IN - SHOW QR */}
        {(loginState === "LOGGING_IN" ||
          (!isRelogin &&
            loginMethod === "qr" &&
            loginState === "IDLE" &&
            isSending)) &&
          loginMethod === "qr" &&
          !conflictData && (
            <div className="flex flex-col items-center gap-4 animate-fade-in py-4">
              {displayQr ? (
                <div className="rounded-xl bg-white p-3 shadow-2xl animate-in zoom-in duration-300">
                  <img
                    src={displayQr}
                    alt="QR"
                    className="h-auto w-56 object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-56 w-56 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-600 bg-gray-800 text-gray-400">
                  <IconRefresh className="mb-2 w-8 h-8 animate-spin" />
                  <span className="text-xs">Đang lấy QR...</span>
                </div>
              )}
              <div className="text-center">
                <p className="text-sm font-bold text-white mb-1">
                  Quét mã bằng Zalo
                </p>
                <p className="text-xs text-gray-500">
                  {displayQr ? "QR đã sẵn sàng" : "Đang kết nối..."}
                </p>
              </div>
              <button
                onClick={handleCancel}
                className="text-xs text-red-400 hover:text-red-300 underline mt-2"
              >
                Hủy bỏ
              </button>
            </div>
          )}
      </div>
    </div>
  );
});
