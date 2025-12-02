"use client";

/**
 * app/(auth)/login/page.tsx
 * Trang đăng nhập quản trị viên (Stateless Session).
 * Sử dụng Server Action: staffLoginAction.
 */

import { useActionState } from "react";
import { staffLoginAction, LoginState } from "@/lib/actions/staff.actions";
import { useState } from "react";

// Initial State cho form action
const initialState: LoginState = {
  error: "",
};

export default function LoginPage() {
  // Hook của React 19 để xử lý Server Action state
  const [state, formAction, isPending] = useActionState(
    staffLoginAction,
    initialState,
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 font-sans text-gray-100">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-gray-800 p-8 shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            ZaloLite CRM
          </h1>
          <p className="text-sm text-gray-400">Đăng nhập hệ thống quản trị</p>
        </div>

        {/* Login Form */}
        <form action={formAction} className="mt-8 space-y-6">
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Tên đăng nhập
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="relative block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-3 text-white placeholder-gray-400 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-colors"
                placeholder="admin"
                disabled={isPending}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Mật khẩu
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-3 text-white placeholder-gray-400 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-colors"
                placeholder="••••••••"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Error Message */}
          {state?.error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-200 animate-pulse">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 flex-shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{state.error}</span>
            </div>
          )}

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={isPending}
              className={`group relative flex w-full justify-center items-center gap-2 rounded-lg border border-transparent bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-all 
                ${
                  isPending
                    ? "cursor-wait opacity-70"
                    : "hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]"
                }
              `}
            >
              {isPending ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Đang xác thực...
                </>
              ) : (
                "Đăng nhập"
              )}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Chưa có tài khoản? Vui lòng liên hệ quản trị viên để được cấp quyền
            truy cập.
          </p>
        </div>
      </div>
    </div>
  );
}
