"use client";

import { ZaloBot } from "@/lib/types/database.types";
import { useState, useRef, useEffect } from "react";

/**
 * Dropdown chọn Bot để xem hội thoại
 */
export function BotSelector({
  bots,
  selectedBotId,
  onSelectBot,
}: {
  bots: ZaloBot[];
  selectedBotId: string | null;
  onSelectBot: (botId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedBot = bots.find((b) => b.id === selectedBotId);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative mb-4 px-4 pt-4" ref={dropdownRef}>
      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
        Tài khoản đang hoạt động
      </label>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-gray-700 hover:bg-gray-600 text-white rounded-lg p-3 transition-all border border-gray-600 focus:ring-2 focus:ring-blue-500"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {selectedBot ? (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <span className="truncate font-medium text-sm">
                {selectedBot.name}
              </span>
            </>
          ) : (
            <span className="text-gray-400 text-sm">-- Chọn Bot --</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-4 right-4 top-full mt-2 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto">
          {bots.length === 0 ? (
            <div className="p-3 text-xs text-gray-500 text-center">
              Chưa có bot nào
            </div>
          ) : (
            bots.map((bot) => (
              <button
                key={bot.id}
                onClick={() => {
                  onSelectBot(bot.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-700 flex items-center gap-3 transition-colors ${
                  selectedBotId === bot.id
                    ? "bg-blue-900/30 text-blue-200"
                    : "text-gray-300"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    bot.status?.state === "LOGGED_IN"
                      ? "bg-green-500"
                      : "bg-gray-500"
                  }`}
                />
                <div className="flex-1 truncate">
                  <div className="font-medium">{bot.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {bot.global_id}
                  </div>
                </div>
                {selectedBotId === bot.id && (
                  <svg
                    className="w-4 h-4 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
