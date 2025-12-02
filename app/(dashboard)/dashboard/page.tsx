import { BotInterface } from "@/app/components/BotInterface";
import { getStaffSession } from "@/lib/actions/staff.actions";

export default async function DashboardPage() {
  // Lấy thông tin Staff từ Session (Server-side)
  const session = await getStaffSession();

  // Chuyển đổi session thành format UI cần
  const staffInfo = session
    ? {
        name: session.full_name,
        role: session.role,
        username: session.username,
      }
    : null;

  return (
    <BotInterface
      staffInfo={staffInfo}
      // Các props rỗng/mặc định (sẽ được implement logic fetch sau ở Giai đoạn 5)
      filteredThreads={[]}
      selectedThread={null}
      onSelectThread={() => {}}
      searchTerm=""
      onSearchChange={() => {}}
      onFetchThreads={() => {}}
      isLoadingThreads={false}
      thread={null}
      messages={[]}
      onSendMessage={async () => {}}
      isEchoBotEnabled={false}
      onToggleEchoBot={() => {}}
      onSendVocabulary={async () => {}}
      isSendingMessage={false}
      isSendingVocab={false}
      threadForDetails={null}
      isDetailsPanelOpen={false}
      onToggleDetails={() => {}}
      onRefreshThreads={() => {}}
      onClearSelectedThread={() => {}}
      threads={[]}
      errorMessage={null}
      onClearError={() => {}}
      onSetError={() => {}}
      userCache={{}}
      onStartManualScan={() => {}}
      isScanningAll={false}
      scanStatus=""
    />
  );
}
