"use client";

import { useState } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconRefresh,
  IconUserPlus,
  IconCog,
  IconClose,
} from "@/app/components/ui/Icons";

/**
 * Giao diện Quản lý Đăng nhập (Layout Master-Detail)
 */
export function BotLoginManager({
  bots,
  isLoading,
  onRefresh,
  onCreateBot,
  onDeleteBot,
  onStartLoginQR,
  activeQrBotId,
  qrCodeData,
}: {
  bots: ZaloBot[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateBot: (name: string) => void;
  onDeleteBot: (id: string) => void;
  onStartLoginQR: (id: string) => void;
  activeQrBotId: string | null;
  qrCodeData: string | null;
}) {
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newBotName, setNewBotName] = useState("");

  const selectedBot = bots.find((b) => b.id === selectedBotId);

  const handleCreateSubmit = () => {
    if (!newBotName.trim()) return;
    onCreateBot(newBotName);
    setNewBotName("");
    setIsCreating(false);
  };

  return (
    <div className="flex h-full w-full bg-gray-900 text-gray-100">
      {/* 1. SIDEBAR DANH SÁCH BOT (Master) */}
      <div className="w-80 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-bold text-lg">Tài khoản Bot</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white"
            title="Thêm Bot"
          >
            <IconUserPlus className="w-5 h-5" />
          </button>
        </div>

        {/* Form tạo nhanh */}
        {isCreating && (
          <div className="p-3 bg-gray-800 border-b border-gray-700 animate-fade-in">
            <input
              autoFocus
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm mb-2 text-white focus:border-blue-500 outline-none"
              placeholder="Tên bot mới..."
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubmit()}
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setIsCreating(false)}
                className="text-gray-400 hover:text-white"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateSubmit}
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                Tạo
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {bots.map((bot) => (
            <button
              key={bot.id}
              onClick={() => setSelectedBotId(bot.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                selectedBotId === bot.id
                  ? "bg-gray-800 border border-blue-500/50 shadow-md"
                  : "hover:bg-gray-800/50 border border-transparent"
              }`}
            >
              <div className="relative">
                <Avatar src={bot.avatar || ""} alt={bot.name} />
                <div
                  className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${
                    bot.status?.state === "LOGGED_IN"
                      ? "bg-green-500"
                      : bot.status?.state === "ERROR"
                      ? "bg-red-500"
                      : "bg-gray-500"
                  }`}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate text-sm">{bot.name}</div>
                <div className="text-xs text-gray-500 truncate font-mono">
                  {bot.status?.state || "UNKNOWN"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. MAIN CONTENT (Detail) */}
      <div className="flex-1 bg-gray-800 relative">
        {selectedBot ? (
          <div className="h-full flex flex-col p-8 max-w-3xl mx-auto">
            {/* Header Detail */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-600">
                  <img
                    src={selectedBot.avatar || ""}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={(e) =>
                      ((e.target as HTMLImageElement).src =
                        "https://via.placeholder.com/64")
                    }
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {selectedBot.name}
                  </h1>
                  <p className="text-gray-400 text-sm font-mono">
                    ID: {selectedBot.global_id}
                  </p>
                  <span
                    className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      selectedBot.status?.state === "LOGGED_IN"
                        ? "bg-green-900 text-green-300"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {selectedBot.status?.state}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm("Xóa bot này?")) onDeleteBot(selectedBot.id);
                }}
                className="text-red-400 hover:bg-red-900/30 p-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <IconClose className="w-4 h-4" /> Xóa Bot
              </button>
            </div>

            {/* Login Methods Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Cột 1: QR Login */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 flex flex-col items-center justify-center min-h-[300px]">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-2xl">📱</span> Quét mã QR
                </h3>

                {selectedBot.status?.state === "LOGGED_IN" ? (
                  <div className="text-center">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-10 h-10 text-green-500"
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
                    </div>
                    <p className="text-green-400 font-medium">
                      Đã kết nối thành công
                    </p>
                    <button
                      onClick={() => onStartLoginQR(selectedBot.id)}
                      className="mt-4 text-sm text-gray-500 hover:text-white underline"
                    >
                      Đăng nhập lại?
                    </button>
                  </div>
                ) : (
                  <>
                    {activeQrBotId === selectedBot.id && qrCodeData ? (
                      <div className="bg-white p-3 rounded-lg shadow-lg animate-fade-in-up">
                        <img
                          src={qrCodeData}
                          alt="QR"
                          className="w-48 h-48 object-contain"
                        />
                      </div>
                    ) : activeQrBotId === selectedBot.id ? (
                      <div className="flex flex-col items-center gap-3 text-purple-400">
                        <IconRefresh className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Đang tạo mã QR...</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-48 h-48 bg-gray-800 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center mb-4">
                          <p className="text-gray-600 text-xs">
                            QR Code sẽ hiện ở đây
                          </p>
                        </div>
                        <button
                          onClick={() => onStartLoginQR(selectedBot.id)}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg transition-transform active:scale-95"
                        >
                          Lấy mã đăng nhập
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Cột 2: Credentials Login (Placeholder for Manual Token) */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 opacity-60 pointer-events-none grayscale">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <span className="text-2xl">🍪</span> Token / Cookie
                  </h3>
                  <span className="text-[10px] bg-yellow-900 text-yellow-500 px-2 py-1 rounded">
                    Coming Soon
                  </span>
                </div>
                <textarea
                  className="w-full h-32 bg-gray-800 border border-gray-600 rounded-lg p-3 text-xs font-mono mb-3"
                  placeholder='Paste JSON credentials here: {"imei": "...", "cookie": {...}}'
                  disabled
                />
                <button
                  disabled
                  className="w-full py-2 bg-gray-700 text-gray-400 rounded-lg text-sm font-bold"
                >
                  Khôi phục phiên
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <IconCog className="w-16 h-16 opacity-10 mb-4" />
            <p>Chọn một Bot từ danh sách bên trái để quản lý.</p>
          </div>
        )}
      </div>
    </div>
  );
}
