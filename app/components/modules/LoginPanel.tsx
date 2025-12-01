/**
 * app/components/modules/LoginPanel.tsx
 *
 * Module 0: Panel Đăng nhập
 */
import { ReactNode } from "react";
import { LoginState } from "@/lib/types/zalo.types";

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
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-8 shadow-xl">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">
          Bot ZCA
        </h1>
        <p className="mb-6 text-center text-gray-400">
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
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-300 hover:bg-gray-600"
                }`}
              >
                Dùng Session Token
              </button>
            </div>

            {loginMethod === "qr" && (
              <button
                onClick={onStartLoginQR}
                disabled={isSending}
                className="w-full rounded-lg bg-blue-600 py-3 px-4 font-bold text-white transition duration-200 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
              >
                Bắt đầu Đăng nhập bằng QR
              </button>
            )}

            {loginMethod === "token" && (
              <div className="flex flex-col gap-3">
                <label
                  htmlFor="token-input"
                  className="text-sm font-medium text-gray-300"
                >
                  Dán Session Token (JSON)
                </label>
                <textarea
                  id="token-input"
                  value={tokenInput}
                  onChange={(e) => onTokenChange(e.target.value)}
                  placeholder='{"cookie":{...},"imei":"...","userAgent":"..."}'
                  rows={4}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={onStartLoginToken}
                  disabled={isSending || !tokenInput}
                  className="w-full rounded-lg bg-green-600 py-3 px-4 font-bold text-white transition duration-200 hover:bg-green-700 disabled:cursor-wait disabled:opacity-50"
                >
                  {isSending ? "Đang xác thực..." : "Đăng nhập bằng Token"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* B. Trạng thái ĐANG ĐĂNG NHẬP */}
        {loginState === "LOGGING_IN" && (
          <div className="flex flex-col items-center gap-4">
            {qrCode && loginMethod === "qr" ? (
              <div className="mt-4 rounded-lg bg-white p-4">
                <img src={qrCode} alt="Zalo QR Code" className="h-auto w-64" />
                <p className="mt-2 text-center text-black">
                  Quét mã này bằng Zalo
                </p>
              </div>
            ) : (
              <div className="h-64 w-64 animate-pulse rounded-lg bg-gray-700" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
