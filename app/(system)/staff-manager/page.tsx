import { getStaffSession } from "@/lib/actions/staff.actions";
import { StaffManagerPanel } from "@/components/modules/StaffManagerPanel";
import { redirect } from "next/navigation";

export default async function StaffManagerPage() {
  const session = await getStaffSession();

  // Security Check: Chỉ Admin mới được vào
  if (!session || session.role !== "admin") {
    redirect("/chat_live"); // Đá về trang chat nếu không phải admin
  }

  return (
    <div className="h-full w-full bg-gray-900 text-gray-100 p-6 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6 text-white border-b border-gray-800 pb-4">
        Quản lý Nhân sự
      </h1>
      <StaffManagerPanel />
    </div>
  );
}
