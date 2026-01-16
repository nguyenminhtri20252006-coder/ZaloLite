"use client";

import { ZaloBot } from "@/lib/types/database.types";
import { Avatar } from "@/components/ui/Avatar";
import { IconRefresh, IconUserPlus } from "@/components/ui/Icons";
import { Zap } from "lucide-react"; // Import Zap icon

/**
 * Cột 2: Danh sách Bot
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
  const isCompact = width < 100;

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-1 scrollbar-thin">
        {bots.map((bot) => {
          const isSelected = selectedBotId === bot.id;
          // Determine status visual
          const isLoggedIn = bot.status?.state === "LOGGED_IN";
          const isActiveRealtime = bot.is_realtime_active;
          const isError = bot.status?.state === "ERROR";
          const isQrWaiting = bot.status?.state === "QR_WAITING";

          let statusColor = "bg-gray-500";
          const statusBorder = "border-gray-900";

          if (isLoggedIn) {
            if (isActiveRealtime) {
              statusColor = "bg-green-500"; // Active & Realtime
            } else {
              statusColor = "bg-yellow-500"; // Logged In but No Realtime
            }
          } else if (isError) {
            statusColor = "bg-red-500";
          } else if (isQrWaiting) {
            statusColor = "bg-blue-500";
          }

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
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${statusBorder} flex items-center justify-center ${statusColor}`}
                >
                  {/* Icon for Realtime Active */}
                  {isLoggedIn && isActiveRealtime && (
                    <Zap className="w-2 h-2 text-white fill-white" />
                  )}
                </div>
              </div>

              {/* Text Info */}
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
                      className={`w-1.5 h-1.5 rounded-full ${statusColor}`}
                    ></span>
                    {isLoggedIn
                      ? isActiveRealtime
                        ? "Online (Realtime)"
                        : "Online (Silent)"
                      : bot.status?.state || "Offline"}
                  </div>
                </div>
              )}
            </button>
          );
        })}

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
