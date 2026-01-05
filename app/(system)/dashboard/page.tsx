import { redirect } from "next/navigation";

export default function DashboardPage() {
  // Hiện tại Dashboard chưa có Widget thống kê
  // Redirect tạm về trang Chat Live để nhân viên làm việc
  redirect("/chat_live");
}
