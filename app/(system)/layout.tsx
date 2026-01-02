import { getStaffSession } from "@/lib/actions/staff.actions";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 1. Kiểm tra Session Staff (Stateless)
  const session = await getStaffSession();

  if (!session) {
    // Chưa đăng nhập hoặc token hết hạn -> Đá về login
    redirect("/login");
  }

  // 2. Render Layout
  // Lưu ý: Sidebar (MainMenu) hiện tại đang nằm bên trong BotInterface (Client Component)
  // để hỗ trợ tính năng Resizable. Do đó Layout này chỉ đóng vai trò container.
  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* Nếu muốn Sidebar cố định cho cả /bot-manager và /dashboard, 
        chúng ta có thể nhấc MainMenu ra đây. 
        Tuy nhiên, để giữ tính năng Resizable của BotInterface, ta để children tự quản lý layout.
      */}
      <main className="flex-1 relative h-full w-full">{children}</main>
    </div>
  );
}
