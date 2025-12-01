/**
 * app/(dashboard)/layout.tsx
 * Layout bảo vệ: Chỉ cho phép truy cập nếu đã đăng nhập.
 */
import { getCurrentSessionToken } from "@/lib/actions/system-auth.actions";
import { redirect } from "next/navigation";
import { MainMenu } from "@/app/components/modules/MainMenu"; // Giả sử bạn muốn dùng lại menu cũ hoặc tạo mới

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Kiểm tra Session
  const token = await getCurrentSessionToken();

  if (!token) {
    // Chưa đăng nhập -> Đá về login
    redirect("/login");
  }

  // 2. (Optional) Gọi API check xem token còn hạn không/lấy info user
  // const user = await getUserFromToken(token);
  // if (!user) redirect("/login");

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100">
      {/* Sidebar Menu (Placeholder - Bạn có thể thay bằng MainMenu xịn sau) */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 hidden md:block">
        <div className="p-4 font-bold text-xl border-b border-gray-700">
          Parent Online
        </div>
        <nav className="p-2 space-y-1">
          <a
            href="/dashboard"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Dashboard
          </a>
          <a
            href="/bot-manager"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Quản lý Bot
          </a>
          <form action="/api/auth/logout" method="POST" className="mt-4">
            {/* Hoặc dùng client component logout button */}
            <button className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-900/20 rounded">
              Đăng xuất
            </button>
          </form>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">{children}</main>
    </div>
  );
}
