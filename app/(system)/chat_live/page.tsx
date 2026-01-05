import { getStaffSession } from "@/lib/actions/staff.actions";
import { ChatLiveInterface } from "@/app/components/modules/ChatLiveInterface"; // New Component

export default async function ChatLivePage() {
  const session = await getStaffSession();

  // Pass staff info for presence/logging
  const staffInfo = session
    ? {
        id: session.id,
        name: session.full_name,
        role: session.role,
        username: session.username,
        avatar: session.avatar || undefined,
      }
    : null;

  return <ChatLiveInterface staffInfo={staffInfo} />;
}
