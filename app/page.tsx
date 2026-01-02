import { getStaffSession } from "@/lib/actions/staff.actions";
import Link from "next/link";
import Image from "next/image";

/**
 * Root Page (/)
 * Landing Page - Giao diện cổng thông tin chung.
 * Không phụ thuộc vào Layout của Dashboard.
 */
export default async function HomePage() {
  const session = await getStaffSession();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4">
      {/* Logo / Header Area */}
      <div className="mb-10 text-center">
        <div className="w-24 h-24 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-6 relative overflow-hidden">
          {/* Placeholder Logo nếu chưa có ảnh */}
          <span className="text-4xl font-bold text-blue-600">Z</span>
          {/* Nếu muốn dùng ảnh thật:
             <Image src="/logo.png" alt="ZaloLite" fill className="object-contain p-2" /> 
             */}
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
          ZaloLite System <span className="text-blue-600">V2.5</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-md mx-auto">
          Hệ thống quản lý Bot & CRM tập trung - Identity Centric Architecture
        </p>
      </div>

      {/* Main Action Area */}
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100">
        {session ? (
          // --- TRẠNG THÁI: ĐÃ ĐĂNG NHẬP ---
          <div className="space-y-6">
            <div className="text-center pb-4 border-b border-gray-100">
              <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">
                Xin chào,
              </p>
              <p className="text-xl font-bold text-gray-800 mt-1">
                {session.full_name}
              </p>
              <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                {session.role === "admin" ? "Administrator" : "Staff Member"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Link
                href="/bot-manager"
                className="group flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200 border border-blue-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 8V4H8" />
                      <rect width="16" height="12" x="4" y="8" rx="2" />
                      <path d="M2 14h2" />
                      <path d="M20 14h2" />
                      <path d="M15 13v2" />
                      <path d="M9 13v2" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-blue-900">Quản lý Bot</p>
                    <p className="text-xs text-blue-600">
                      Kết nối, Đồng bộ & Cấu hình
                    </p>
                  </div>
                </div>
                <span className="text-blue-400 group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>

              {session.role === "admin" && (
                <Link
                  href="/staff-manager"
                  className="group flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-200 border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-500 rounded-lg flex items-center justify-center text-white">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-700">Nhân sự</p>
                      <p className="text-xs text-gray-500">
                        Phân quyền & Tài khoản
                      </p>
                    </div>
                  </div>
                  <span className="text-gray-400 group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </Link>
              )}

              {/* Placeholder Chat Button */}
              <div className="opacity-50 cursor-not-allowed group flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-lg flex items-center justify-center text-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-500">Live Chat</p>
                    <p className="text-xs text-gray-400">Đang phát triển...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // --- TRẠNG THÁI: CHƯA ĐĂNG NHẬP ---
          <div className="text-center space-y-6">
            <div className="py-4">
              <p className="text-gray-600">
                Vui lòng đăng nhập để truy cập vào hệ thống quản trị.
              </p>
            </div>
            <Link
              href="/login"
              className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-200"
            >
              Đăng nhập Hệ thống
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-gray-400 text-xs">
        <p>© 2025 ZaloLite Project. Internal Use Only.</p>
      </div>
    </div>
  );
}
