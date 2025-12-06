/**
 * app/components/modules/ConversationList.tsx
 * [UPDATED] Tích hợp Presence: Hiển thị Avatar Staff đang xem hội thoại & Trạng thái Typing.
 */
import { ThreadInfo } from "@/lib/types/zalo.types";
import { ZaloBot } from "@/lib/types/database.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconSearch } from "@/app/components/ui/Icons";
import { BotSelector } from "./BotSelector";
import { PresenceState } from "@/lib/hooks/usePresence"; // Import Type

// Helper format thời gian
const formatTime = (isoString?: string) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Nếu trong ngày: hiển thị giờ:phút
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // Khác ngày: hiển thị ngày/tháng
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
};

export function ConversationList({
  threads,
  selectedThread,
  onSelectThread,
  searchTerm,
  onSearchChange,
  onFetchThreads,
  isLoadingThreads,
  bots,
  activeBotId,
  onSwitchBot,
  // [NEW] Nhận danh sách đồng nghiệp từ BotInterface
  peers = [],
}: {
  threads: ThreadInfo[];
  selectedThread: ThreadInfo | null;
  onSelectThread: (thread: ThreadInfo) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onFetchThreads: () => void;
  isLoadingThreads: boolean;
  bots: ZaloBot[];
  activeBotId: string | null;
  onSwitchBot: (botId: string) => void;
  peers?: PresenceState[];
}) {
  return (
    <div className="flex h-full flex-col border-r border-gray-700 bg-gray-800">
      {/* 1. Bot Selector */}
      <BotSelector
        bots={bots}
        selectedBotId={activeBotId}
        onSelectBot={onSwitchBot}
      />

      {/* 2. Header & Search */}
      <div className="px-4 pb-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-white">Hội thoại</h2>
          <button
            onClick={onFetchThreads}
            disabled={isLoadingThreads || !activeBotId}
            className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 transition-colors"
            title="Làm mới danh sách"
          >
            <svg
              className={`w-5 h-5 ${isLoadingThreads ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-900/50 py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          />
          <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        </div>
      </div>

      {/* 3. Thread List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!activeBotId ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500 px-6 text-center">
            <p className="text-sm">
              Vui lòng chọn một tài khoản Bot để xem tin nhắn.
            </p>
          </div>
        ) : threads.length === 0 && !isLoadingThreads ? (
          <div className="p-4 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
            <span>📭 Chưa có hội thoại nào.</span>
            <span className="text-xs opacity-70">
              Hãy đồng bộ dữ liệu hoặc nhắn tin mới.
            </span>
          </div>
        ) : (
          threads.map((thread) => {
            // [LOGIC PRESENCE] Lọc ra những ai đang xem thread này
            const viewers = peers.filter(
              (p) => p.viewing_thread_id === thread.id,
            );
            // Kiểm tra xem có ai đang gõ trong thread này không
            const typers = viewers.filter((p) => p.is_typing);

            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread)}
                className={`flex w-full items-center gap-3 p-3 text-left transition-colors border-l-4 group ${
                  selectedThread?.id === thread.id
                    ? "bg-gray-700/50 border-blue-500"
                    : "border-transparent hover:bg-gray-700/30"
                }`}
              >
                <div className="relative">
                  <Avatar
                    src={thread.avatar}
                    alt={thread.name}
                    isGroup={thread.type === 1}
                  />
                  {thread.type === 1 && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-700 rounded-full p-[2px]">
                      <div
                        className="bg-blue-500 w-2.5 h-2.5 rounded-full"
                        title="Group"
                      />
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3
                      className={`truncate font-medium text-sm pr-2 ${
                        selectedThread?.id === thread.id
                          ? "text-white"
                          : "text-gray-200"
                      }`}
                    >
                      {thread.name}
                    </h3>
                    {/* Time Stamp from DB */}
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">
                      {formatTime(thread.lastActivity)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="truncate text-xs text-gray-400 max-w-[80%] h-4 flex items-center">
                      {/* Hiển thị Typing Indicator hoặc Placeholder */}
                      {typers.length > 0 ? (
                        <span className="text-blue-400 italic animate-pulse flex items-center gap-1">
                          <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></span>
                          {typers[0].username} đang soạn tin...
                        </span>
                      ) : (
                        <span className="opacity-50">
                          Nhấn để xem tin nhắn...
                        </span>
                      )}
                    </div>

                    {/* [UI PRESENCE] Avatar nhỏ của staff đang xem */}
                    {viewers.length > 0 && (
                      <div className="flex -space-x-1 ml-2">
                        {viewers.map((viewer) => (
                          <div
                            key={viewer.staff_id}
                            className="relative w-4 h-4 rounded-full ring-1 ring-gray-800"
                            title={`${viewer.username} đang xem`}
                          >
                            {viewer.avatar ? (
                              <img
                                src={viewer.avatar}
                                className="w-full h-full rounded-full object-cover"
                                alt=""
                              />
                            ) : (
                              <div className="w-full h-full bg-purple-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold cursor-help">
                                {viewer.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}

        {isLoadingThreads && (
          <div className="p-4 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}
