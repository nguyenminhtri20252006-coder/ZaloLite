/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/components/modules/ConversationList.tsx
 * [FIXED] Prevent "Objects are not valid as a React child" error.
 * Ensure renderSnippet always returns a string.
 */
import React, { useMemo } from "react";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconSearch } from "@/app/components/ui/Icons";
import { PresenceState } from "@/lib/hooks/usePresence";

// [FIX] Helper render snippet an toàn tuyệt đối
const renderSnippet = (content: any): string => {
  if (!content) return "Chưa có tin nhắn";

  // Nếu content là string (legacy), trả về luôn
  if (typeof content === "string") return content;

  // Nếu content là object NormalizedContent
  const type = content.type || "unknown";
  const data = content.data || {};

  try {
    switch (type) {
      case "text":
        // Đảm bảo data.text là string, nếu là object thì stringify hoặc lấy fallback
        if (typeof data.text === "object") return JSON.stringify(data.text);
        return String(data.text || "");

      case "image":
        return "[Hình ảnh]";

      case "sticker":
        return "[Sticker]";

      case "voice":
        return "[Tin nhắn thoại]";

      case "video":
        return "[Video]";

      case "file":
        return `[File] ${data.fileName || ""}`;

      case "link": // Case gây lỗi (href, thumb, etc.)
        return `[Link] ${data.title || data.href || ""}`;

      default:
        // Fallback cho các loại tin chưa support hoặc cấu trúc lạ
        // Tuyệt đối không trả về object
        if (data.text) return String(data.text);
        return `[Tin nhắn ${type}]`;
    }
  } catch (e) {
    console.error("Render Snippet Error:", e);
    return "[Lỗi hiển thị]";
  }
};

const formatTime = (isoString: string) => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return ""; // Invalid date check

    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "";
  }
};

export function ConversationList({
  threads,
  selectedThread,
  onSelectThread,
  searchTerm,
  onSearchChange,
  onFetchThreads,
  isLoadingThreads,
  peers = [],
}: {
  threads: ThreadInfo[];
  selectedThread: ThreadInfo | null;
  onSelectThread: (thread: ThreadInfo) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onFetchThreads: () => void;
  isLoadingThreads: boolean;
  peers?: PresenceState[];
}) {
  const filteredThreads = useMemo(() => {
    if (!searchTerm.trim()) return threads;
    const lowerTerm = searchTerm.toLowerCase();
    return threads.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(lowerTerm) ||
        (t.id || "").includes(lowerTerm),
    );
  }, [threads, searchTerm]);

  return (
    <div className="flex h-full flex-col bg-gray-850 border-r border-gray-700">
      {/* Header & Search */}
      <div className="px-4 py-4 border-b border-gray-700 bg-gray-900/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">
            Hội thoại ({filteredThreads.length})
          </h2>
          <button
            onClick={onFetchThreads}
            disabled={isLoadingThreads}
            className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 transition-colors"
            title="Làm mới"
          >
            <svg
              className={`w-4 h-4 ${isLoadingThreads ? "animate-spin" : ""}`}
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
            placeholder="Tìm theo tên hoặc ID..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-800 py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 transition-all focus:bg-gray-700"
          />
          <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredThreads.length === 0 && !isLoadingThreads ? (
          <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
            <span>📭</span>
            <span>Không tìm thấy hội thoại nào.</span>
            <p className="text-xs text-gray-600 mt-2">
              Nếu mới thêm Bot, hãy chạy &quot;Đồng bộ&quot; trong trang quản
              lý.
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isSelected = selectedThread?.uuid === thread.uuid;

            const viewers = peers.filter(
              (p) => p.viewing_thread_id === thread.uuid,
            );
            const typers = viewers.filter((p) => p.is_typing);

            // [SAFEGUARD] Gọi renderSnippet và ép kiểu string
            const snippet = String(renderSnippet(thread.lastMessage));
            const timeStr = formatTime(thread.lastActivity);

            return (
              <button
                key={thread.uuid}
                onClick={() => onSelectThread(thread)}
                className={`flex w-full items-center gap-3 p-3 text-left transition-colors border-l-4 group ${
                  isSelected
                    ? "bg-gray-700/50 border-blue-500"
                    : "border-transparent hover:bg-gray-800"
                }`}
              >
                <div className="relative">
                  <Avatar
                    src={thread.avatar}
                    name={thread.name}
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
                        isSelected ? "text-white" : "text-gray-200"
                      }`}
                    >
                      {thread.name}
                    </h3>
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">
                      {timeStr}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="truncate text-xs text-gray-400 max-w-[80%] h-4 flex items-center">
                      {typers.length > 0 ? (
                        <span className="text-blue-400 italic flex items-center gap-1">
                          <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></span>
                          {typers[0].username} đang soạn...
                        </span>
                      ) : (
                        <span
                          className={
                            thread.lastMessage?.type !== "text" ? "italic" : ""
                          }
                        >
                          {snippet}
                        </span>
                      )}
                    </div>

                    {/* Presence Avatars */}
                    {viewers.length > 0 && (
                      <div className="flex -space-x-1 ml-2">
                        {viewers.map((viewer) => (
                          <div
                            key={viewer.staff_id}
                            className="relative w-4 h-4 rounded-full ring-1 ring-gray-800"
                            title={viewer.full_name}
                          >
                            <div className="w-full h-full bg-purple-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                              {(viewer.username || "?").charAt(0).toUpperCase()}
                            </div>
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
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}
