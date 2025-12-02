/**
 * app/components/modules/ConversationList.tsx
 * [UPDATED] Thêm Bot Selector Dropdown.
 */
import { ThreadInfo, UserCacheEntry } from "@/lib/types/zalo.types";
import { ZaloBot } from "@/lib/types/database.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconSearch } from "@/app/components/ui/Icons";
import { BotSelector } from "./BotSelector";

export function ConversationList({
  threads,
  selectedThread,
  onSelectThread,
  searchTerm,
  onSearchChange,
  onFetchThreads,
  isLoadingThreads,
  // Props mới cho Multi-bot
  bots,
  activeBotId,
  onSwitchBot,
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
}) {
  return (
    <div className="flex h-full flex-col border-r border-gray-700 bg-gray-800">
      {/* 1. Bot Selector (Dropdown) */}
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
          <div className="p-4 text-center text-gray-500 text-sm">
            Chưa có hội thoại nào.
          </div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => onSelectThread(thread)}
              className={`flex w-full items-center gap-3 p-3 text-left transition-colors border-l-4 ${
                selectedThread?.id === thread.id
                  ? "bg-gray-700/50 border-blue-500"
                  : "border-transparent hover:bg-gray-700/30"
              }`}
            >
              <Avatar
                src={thread.avatar}
                alt={thread.name}
                isGroup={thread.type === 1}
              />
              <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-center mb-0.5">
                  <h3 className="truncate font-medium text-white text-sm">
                    {thread.name}
                  </h3>
                  {/* Có thể thêm time ở đây */}
                </div>
                <p className="truncate text-xs text-gray-400 flex items-center gap-1">
                  {thread.type === 1 && (
                    <span className="bg-gray-700 px-1 rounded text-[10px]">
                      GROUP
                    </span>
                  )}
                  <span>Tin nhắn mới...</span>
                </p>
              </div>
            </button>
          ))
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
