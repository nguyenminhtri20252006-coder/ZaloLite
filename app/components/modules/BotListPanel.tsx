"use client";

import { ZaloBot } from "@/lib/types/database.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconRefresh, IconUserPlus } from "@/app/components/ui/Icons";

/**
 * Cột 2: Danh sách Bot
 * - Hỗ trợ Resizable (Width động)
 * - Tự động chuyển Compact Mode nếu width nhỏ
 */
export function BotListPanel({
  bots,
  selectedBotId,
  onSelectBot,
  onRefresh,
  width,
}: {
  bots: ZaloBot[];
  selectedBotId: string | null;
  onSelectBot: (botId: string) => void;
  onRefresh: () => void;
  width: number;
}) {
  // Ngưỡng chuyển sang chế độ icon thu gọn
  const isCompact = width < 100;

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden relative">
      {/* Header */}
      <div
        className={`flex items-center border-b border-gray-800 h-[60px] flex-shrink-0 transition-all
          ${isCompact ? "justify-center px-0" : "justify-between px-4"}
        `}
      >
        {!isCompact && (
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 truncate">
              Tài khoản ({bots.length})
            </h2>
          </div>
        )}

        <button
          onClick={onRefresh}
          className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors"
          title="Làm mới danh sách"
        >
          <IconRefresh className="w-4 h-4" />
        </button>
      </div>

      {/* Bot List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-1 scrollbar-thin">
        {bots.map((bot) => {
          const isSelected = selectedBotId === bot.id;
          const isOnline = bot.status?.state === "LOGGED_IN";
          const isError = bot.status?.state === "ERROR";

          return (
            <button
              key={bot.id}
              onClick={() => onSelectBot(bot.id)}
              className={`group flex items-center w-full transition-all relative
                ${isCompact ? "justify-center py-3 px-0" : "px-3 py-3 gap-3"}
                ${
                  isSelected
                    ? "bg-gray-800 border-l-2 border-blue-500"
                    : "hover:bg-gray-800 border-l-2 border-transparent"
                }
              `}
              title={bot.name}
            >
              {/* Avatar Container */}
              <div className="relative flex-shrink-0">
                <Avatar src={bot.avatar || ""} alt={bot.name} />

                {/* Status Dot */}
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900 flex items-center justify-center
                  ${
                    isOnline
                      ? "bg-green-500"
                      : isError
                      ? "bg-red-500"
                      : "bg-gray-500"
                  }
                `}
                >
                  {/* Có thể thêm icon nhỏ vào dot nếu cần */}
                </div>
              </div>

              {/* Text Info (Chỉ hiện khi Expanded) */}
              {!isCompact && (
                <div className="flex-1 overflow-hidden text-left min-w-0">
                  <div
                    className={`text-sm font-medium truncate ${
                      isSelected
                        ? "text-white"
                        : "text-gray-300 group-hover:text-white"
                    }`}
                  >
                    {bot.name}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono truncate flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isOnline ? "bg-green-500" : "bg-gray-600"
                      }`}
                    ></span>
                    {isOnline ? "Online" : bot.status?.state || "Offline"}
                  </div>
                </div>
              )}
            </button>
          );
        })}

        {/* Empty State */}
        {bots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600 gap-2">
            <IconUserPlus className="w-6 h-6 opacity-50" />
            {!isCompact && <span className="text-xs">Chưa có bot</span>}
          </div>
        )}
      </div>
    </div>
  );
}
