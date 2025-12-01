/**
 * app/components/modules/ConversationList.tsx
 *
 * Module 2: Cột danh sách hội thoại
 */
import { ThreadInfo } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconSearch } from "@/app/components/ui/Icons";

export function ConversationList({
  threads,
  selectedThread,
  onSelectThread,
  searchTerm,
  onSearchChange,
  onFetchThreads,
  isLoadingThreads,
}: {
  threads: ThreadInfo[];
  selectedThread: ThreadInfo | null;
  onSelectThread: (thread: ThreadInfo) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onFetchThreads: () => void;
  isLoadingThreads: boolean;
}) {
  return (
    <div className="flex h-full w-80 flex-col border-r border-gray-700 bg-gray-800">
      {/* Header và Thanh tìm kiếm */}
      <div className="p-4">
        <h2 className="mb-4 text-2xl font-bold text-white">Chats</h2>
        <div className="relative">
          <input
            type="text"
            placeholder="Tìm kiếm bạn bè, nhóm..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <IconSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Nút Tải lại */}
      <button
        type="button"
        onClick={onFetchThreads}
        disabled={isLoadingThreads}
        className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg bg-gray-600 p-2 text-sm text-white transition duration-200 hover:bg-gray-500 disabled:cursor-wait disabled:opacity-50"
      >
        {isLoadingThreads ? (
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        )}
        {isLoadingThreads ? "Đang tải..." : "Tải lại danh sách"}
      </button>

      {/* Danh sách Hội thoại */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 && !isLoadingThreads && (
          <p className="p-4 text-center text-gray-500">
            Không tìm thấy hội thoại.
          </p>
        )}
        {threads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread)}
            className={`flex w-full items-center gap-3 p-4 text-left transition-colors ${
              selectedThread?.id === thread.id
                ? "bg-blue-800"
                : "hover:bg-gray-700"
            }`}
          >
            <Avatar
              src={thread.avatar}
              alt={thread.name}
              isGroup={thread.type === 1}
            />
            <div className="flex-1 overflow-hidden">
              <h3 className="truncate font-semibold text-white">
                {thread.name}
              </h3>
              <p className="truncate text-sm text-gray-400">
                {thread.type === 1 ? "Nhóm" : "Bạn bè"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
