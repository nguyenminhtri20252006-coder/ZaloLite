import { BotInterface } from "@/app/components/BotInterface";
import { getStaffSession } from "@/lib/actions/staff.actions";

export default async function DashboardPage() {
  // Lấy thông tin Staff từ Session (Server-side)
  const session = await getStaffSession();

  // Chuyển đổi session thành format UI cần
  const staffInfo = session
    ? {
        id: session.id, // [NEW] Thêm ID
        name: session.full_name,
        role: session.role,
        username: session.username,
      }
    : null;

  return <BotInterface staffInfo={staffInfo} userCache={{}} />;
}
