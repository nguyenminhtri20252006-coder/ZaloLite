"use client";

import { useActionState, useEffect, useState } from "react";
import { staffLoginAction, LoginState } from "@/lib/actions/staff.actions";
import {
  checkSystemInitialized,
  setupFirstAdminAction,
  SetupState,
} from "@/lib/actions/system.actions";
import { IconClose, IconCheck, IconUserPlus } from "@/app/components/ui/Icons";

const initialLoginState: LoginState = { error: "" };
const initialSetupState: SetupState = { error: "", success: false };

export default function LoginPage() {
  // Login Form Action
  const [loginState, loginAction, isLoginPending] = useActionState(
    staffLoginAction,
    initialLoginState,
  );

  // Setup Form Action
  const [setupState, setupAction, isSetupPending] = useActionState(
    setupFirstAdminAction,
    initialSetupState,
  );

  // Local State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isInitialized, setIsInitialized] = useState(true); // Mặc định true
  const [checkingInit, setCheckingInit] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  // Thêm state thông báo thành công cho form login
  const [loginMessage, setLoginMessage] = useState("");

  // Check Init Status on Mount
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const res = await checkSystemInitialized();
      if (mounted) {
        setIsInitialized(res.initialized);
        setCheckingInit(false);
      }
    };
    check();
    return () => {
      mounted = false;
    };
  }, [setupState?.success]);

  // Fix lỗi "Calling setState synchronously within an effect"
  // Sử dụng setTimeout để đẩy việc cập nhật state ra khỏi luồng render hiện tại (next tick)
  useEffect(() => {
    if (setupState?.success) {
      const timer = setTimeout(() => {
        setShowSetupModal(false);
        setLoginMessage("Khởi tạo Admin thành công! Vui lòng đăng nhập.");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [setupState]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 font-sans text-gray-100 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-24 w-64 h-64 bg-purple-600 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md space-y-8 rounded-xl bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl border border-gray-700 z-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            ZaloLite CRM
          </h1>
          <p className="text-sm text-gray-400">
            Hệ thống quản lý tin nhắn tập trung
          </p>
        </div>

        {/* Login Form */}
        <form action={loginAction} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                Tên đăng nhập
              </label>
              <input
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Nhập username..."
                disabled={isLoginPending}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                Mật khẩu
              </label>
              <input
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="••••••••"
                disabled={isLoginPending}
              />
            </div>
          </div>

          {/* Success Message (from Setup) */}
          {loginMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/50 p-3 text-sm text-green-400 animate-fade-in">
              <IconCheck className="w-5 h-5" />
              <span>{loginMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {loginState?.error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/50 p-3 text-sm text-red-400 animate-shake">
              <span className="text-lg">⚠️</span>
              <span>{loginState.error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoginPending}
            className={`w-full rounded-lg bg-blue-600 py-3 px-4 text-sm font-bold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.98] flex justify-center items-center gap-2
              ${isLoginPending ? "opacity-70 cursor-wait" : ""}
            `}
          >
            {isLoginPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Đang đăng nhập...
              </>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>

        {/* Setup Button (Visible only if not initialized) */}
        {!checkingInit && !isInitialized && (
          <div className="mt-6 pt-6 border-t border-gray-700 text-center animate-fade-in">
            <p className="text-sm text-yellow-400 mb-3">
              Hệ thống chưa có tài khoản quản trị.
            </p>
            <button
              onClick={() => setShowSetupModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 text-sm font-bold hover:bg-yellow-500 hover:text-gray-900 transition-all"
            >
              <IconUserPlus className="w-4 h-4" />
              Thiết lập Admin Ngay
            </button>
          </div>
        )}
      </div>

      {/* --- MODAL SETUP ADMIN --- */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-gray-800 w-full max-w-lg rounded-2xl border border-gray-700 shadow-2xl overflow-hidden animate-scale-up">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Khởi tạo Hệ thống
                </h2>
                <p className="text-blue-100 text-xs mt-1">
                  Tạo tài khoản Quản trị viên (Root Admin)
                </p>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8">
              <form action={setupAction} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">
                    Username (Đăng nhập)
                  </label>
                  <input
                    name="username"
                    required
                    placeholder="VD: admin"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">
                    Họ và Tên
                  </label>
                  <input
                    name="fullName"
                    required
                    placeholder="VD: Quản trị viên"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">
                    Mật khẩu
                  </label>
                  <input
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {setupState?.error && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                    {setupState.error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSetupPending}
                  className="w-full bg-white text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-100 transition-colors shadow-lg mt-2 flex justify-center items-center gap-2"
                >
                  {isSetupPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                      Đang khởi tạo...
                    </>
                  ) : (
                    <>
                      <IconCheck className="w-5 h-5" /> Hoàn tất
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
