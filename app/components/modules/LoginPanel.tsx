/**
 * app/components/modules/LoginPanel.tsx
 * [UPDATED] Universal Login Panel.
 * - Supports 'create' mode (Add New Bot).
 * - Supports 'relogin' mode (Fix Broken Bot).
 */
import { ReactNode } from "react";
import { LoginState } from "@/lib/types/zalo.types";
import { IconRefresh, IconQrCode, IconKey } from "@/app/components/ui/Icons"; // [FIXED] Import đủ icons

interface LoginPanelProps {
  loginState: LoginState;
  loginMethod: "qr" | "token";
  qrCode: string | null;
  isSending: boolean;
  tokenInput: string;

  // Handlers
  onLoginMethodChange: (method: "qr" | "token") => void;
  onTokenChange: (token: string) => void;
  onStartLoginQR: () => void;
  onStartLoginToken: () => void;

  // Optional: Re-login specific
  mode?: "create" | "relogin";
  botName?: string;
  onRetrySavedToken?: () => void;

  renderStatus: () => ReactNode;
}

export function LoginPanel({
  loginState,
  loginMethod,
  qrCode,
  isSending,
  onLoginMethodChange,
  onTokenChange,
  onStartLoginQR,
  onStartLoginToken,
  tokenInput,
  mode = "create",
  botName,
  onRetrySavedToken,
  renderStatus,
}: LoginPanelProps) {
  const isRelogin = mode === "relogin";

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-md">
        {/* Header */}
        <h1 className="mb-2 text-center text-xl font-bold text-white">
          {isRelogin ? `Đăng nhập lại: ${botName}` : "Thêm Bot Mới"}
        </h1>
        <p className="mb-6 text-center text-gray-400 text-xs font-mono">
          {renderStatus()}
        </p>

        {/* --- STATE 1: LỰA CHỌN PHƯƠNG THỨC (IDLE / ERROR) --- */}
        {(loginState === "IDLE" || loginState === "ERROR") && (
          <div className="flex flex-col gap-3 animate-fade-in">
            {/* [RE-LOGIN ONLY] Option: Saved Token */}
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
                      Thử kết nối lại với credential đã lưu
                    </span>
                  </div>
                </div>
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </button>
            )}

            {/* Tab Switcher: QR vs Token */}
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
                <IconKey className="w-4 h-4" /> Token JSON
              </button>
            </div>

            {/* Content: QR Intro */}
            {loginMethod === "qr" && (
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-center">
                <div className="w-12 h-12 bg-blue-900/30 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconQrCode className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-300 mb-4">
                  Hệ thống sẽ tạo một mã QR mới.
                  <br />
                  Sử dụng ứng dụng Zalo để quét.
                </p>
                <button
                  onClick={onStartLoginQR}
                  disabled={isSending}
                  className="w-full rounded-lg bg-blue-600 py-2.5 px-4 font-bold text-white transition hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {isSending ? (
                    <IconRefresh className="w-4 h-4 animate-spin" />
                  ) : (
                    "Lấy mã QR"
                  )}
                </button>
              </div>
            )}

            {/* Content: Token Input */}
            {loginMethod === "token" && (
              <div className="flex flex-col gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <label
                  htmlFor="token-input"
                  className="text-xs font-bold text-gray-400 uppercase"
                >
                  Dán JSON Token:
                </label>
                <textarea
                  id="token-input"
                  value={tokenInput}
                  onChange={(e) => onTokenChange(e.target.value)}
                  placeholder='{"cookie":{...},"imei":"..."}'
                  rows={4}
                  className="w-full rounded bg-black/40 p-3 font-mono text-xs text-green-400 border border-gray-600 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={onStartLoginToken}
                  disabled={isSending || !tokenInput}
                  className="w-full rounded-lg bg-purple-600 py-2.5 px-4 font-bold text-white transition hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {isSending ? (
                    <IconRefresh className="w-4 h-4 animate-spin" />
                  ) : (
                    "Xác thực & Login"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- STATE 2: LOGGING IN (QR DISPLAY) --- */}
        {loginState === "LOGGING_IN" && loginMethod === "qr" && (
          <div className="flex flex-col items-center gap-4 animate-fade-in py-4">
            {qrCode ? (
              <div className="rounded-xl bg-white p-3 shadow-2xl">
                <img
                  src={qrCode}
                  alt="Zalo QR Code"
                  className="h-auto w-56 object-contain"
                />
              </div>
            ) : (
              <div className="flex h-56 w-56 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-600 bg-gray-800 text-gray-400">
                <IconRefresh className="mb-2 w-8 h-8 animate-spin" />
                <span className="text-xs">Đang khởi tạo session...</span>
              </div>
            )}

            <div className="text-center">
              <p className="text-sm font-bold text-white mb-1">
                Quét mã bằng Zalo
              </p>
              <p className="text-xs text-gray-500">
                Mã sẽ hết hạn sau vài phút
              </p>
            </div>

            {/* Nút Hủy (Chỉ hiện khi đang chờ QR) */}
            <button
              onClick={() => window.location.reload()} // Reload đơn giản để thoát trạng thái pending
              className="text-xs text-red-400 hover:text-red-300 underline mt-2"
            >
              Hủy bỏ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
