/**
 * app/components/modules/LoginPanel.tsx
 * Module 0: Panel Đăng nhập (Presentation Component)
 * [UPDATED] Tinh chỉnh UI để khớp với theme mới.
 */
import { ReactNode } from "react";
import { LoginState } from "@/lib/types/zalo.types";
import { IconRefresh } from "@/app/components/ui/Icons";

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
  renderStatus,
}: {
  loginState: LoginState;
  loginMethod: "qr" | "token";
  qrCode: string | null;
  isSending: boolean;
  onLoginMethodChange: (method: "qr" | "token") => void;
  onTokenChange: (token: string) => void;
  onStartLoginQR: () => void;
  onStartLoginToken: () => void;
  tokenInput: string;
  renderStatus: () => ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">
          Thêm Bot Mới
        </h1>
        <p className="mb-6 text-center text-gray-400 text-sm">
          Trạng thái: {renderStatus()}
        </p>

        {/* A. Trạng thái CHƯA ĐĂNG NHẬP (Idle hoặc Lỗi) */}
        {(loginState === "IDLE" || loginState === "ERROR") && (
          <div className="flex flex-col gap-4">
            <div className="flex rounded-lg bg-gray-700 p-1">
              <button
                onClick={() => onLoginMethodChange("qr")}
                className={`w-1/2 rounded-md py-2 text-sm font-medium transition-colors ${
                  loginMethod === "qr"
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-300 hover:bg-gray-600"
                }`}
              >
                Quét Mã QR
              </button>
              <button
                onClick={() => onLoginMethodChange("token")}
                className={`w-1/2 rounded-md py-2 text-sm font-medium transition-colors ${
                  loginMethod === "token"
                    ? "bg-purple-600 text-white shadow"
                    : "text-gray-300 hover:bg-gray-600"
                }`}
              >
                Dùng Token
              </button>
            </div>

            {loginMethod === "qr" && (
              <button
                onClick={onStartLoginQR}
                disabled={isSending}
                className="w-full rounded-lg bg-blue-600 py-3 px-4 font-bold text-white transition duration-200 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSending && <IconRefresh className="w-4 h-4 animate-spin" />}
                Bắt đầu Đăng nhập bằng QR
              </button>
            )}

            {loginMethod === "token" && (
              <div className="flex flex-col gap-3">
                <label
                  htmlFor="token-input"
                  className="text-xs font-medium text-gray-400"
                >
                  Dán Session Token (JSON)
                </label>
                <textarea
                  id="token-input"
                  value={tokenInput}
                  onChange={(e) => onTokenChange(e.target.value)}
                  placeholder='{"cookie":{...},"imei":"...","userAgent":"..."}'
                  rows={6}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 p-3 font-mono text-xs text-green-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={onStartLoginToken}
                  disabled={isSending || !tokenInput}
                  className="w-full rounded-lg bg-purple-600 py-3 px-4 font-bold text-white transition duration-200 hover:bg-purple-700 disabled:cursor-wait disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSending ? (
                    <>
                      <IconRefresh className="w-4 h-4 animate-spin" /> Đang xác
                      thực...
                    </>
                  ) : (
                    "Đăng nhập ngay"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* B. Trạng thái ĐANG ĐĂNG NHẬP (Hiển thị QR) */}
        {loginState === "LOGGING_IN" && loginMethod === "qr" && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            {qrCode ? (
              <div className="mt-4 rounded-xl bg-white p-4 shadow-lg">
                <img
                  src={qrCode}
                  alt="Zalo QR Code"
                  className="h-auto w-64 object-contain"
                />
                <p className="mt-3 text-center text-sm font-medium text-black animate-pulse">
                  Quét mã này bằng Zalo
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-gray-400 mt-8">
                <IconRefresh className="w-12 h-12 animate-spin mb-4" />
                <p>Đang khởi tạo mã QR...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
