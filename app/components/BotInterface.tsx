"use client";

import { useState, useRef, useEffect } from "react";
import {
  ThreadInfo,
  ViewState,
  UserCacheEntry,
  ZaloMessage,
} from "../../lib/types/zalo.types";
import { ZaloBot } from "../../lib/types/database.types";
import { MainMenu } from "./modules/MainMenu";
import { ConversationList } from "./modules/ConversationList";
import { ChatFrame } from "./modules/ChatFrame";
import { DetailsPanel } from "./modules/DetailsPanel";
import { BotLoginManager } from "./modules/BotLoginManager";
import { getBotsAction } from "../../lib/actions/bot.actions";
import {
  getThreadsFromDBAction, // Dùng action mới từ DB
  getMessagesAction,
  sendMessageAction,
} from "../../lib/actions/chat.actions";
import { IconCog } from "./ui/Icons";
import supabase from "../../lib/supabaseClient";
import { usePresence } from "../../lib/hooks/usePresence"; // [NEW] Import Hook

type BotInterfaceProps = {
  staffInfo: {
    id: string;
    name: string;
    role: string;
    username: string;
  } | null;
  userCache?: Record<string, UserCacheEntry>;
};

export function BotInterface({ staffInfo, userCache = {} }: BotInterfaceProps) {
  // --- GLOBAL STATE ---
  const [currentView, setCurrentView] = useState<ViewState>("chat");
  const [bots, setBots] = useState<ZaloBot[]>([]);

  // --- PRESENCE HOOK (NEW) ---
  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "",
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: "", // Placeholder, có thể update sau nếu DB có avatar
  });

  // --- CHAT STATE ---
  const [activeBotIdForChat, setActiveBotIdForChat] = useState<string | null>(
    null,
  );
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  // State Login Flow
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  const [isEchoBotEnabled, setIsEchoBotEnabled] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // --- RESIZE STATE ---
  const [menuWidth, setMenuWidth] = useState(240);
  const [convListWidth, setConvListWidth] = useState(300);
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [resizingTarget, setResizingTarget] = useState<
    "MENU" | "CONV_LIST" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 1. INITIAL FETCH ---
  const fetchBots = async () => {
    try {
      const data = await getBotsAction();
      setBots(data);
      if (!activeBotIdForChat && data.length > 0) {
        // Auto select bot đang online
        const active = data.find((b) => b.status?.state === "LOGGED_IN");
        if (active) {
          setActiveBotIdForChat(active.id);
          // [PRESENCE] Báo cáo bot đang hoạt động
          updateStatus({ active_bot_id: active.id });
        }
      }
    } catch (e) {
      console.error("Fetch Bots Failed:", e);
    }
  };

  useEffect(() => {
    fetchBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 2. FETCH THREADS (DATABASE MODE) ---
  const fetchThreads = async () => {
    if (!activeBotIdForChat) return;
    setIsLoadingThreads(true);
    try {
      const data = await getThreadsFromDBAction(activeBotIdForChat);
      setThreads(data);
    } catch (e) {
      console.error("Fetch Threads Error:", e);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    setSelectedThread(null);
    setMessages([]);
    // [PRESENCE] Reset trạng thái xem thread khi đổi bot
    updateStatus({ viewing_thread_id: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBotIdForChat]);

  // --- 3. SUPABASE REALTIME (UPDATED) ---
  useEffect(() => {
    const channel = supabase
      .channel("global-changes")
      // A. Lắng nghe trạng thái Bot
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zalo_bots" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updatedBot = payload.new as ZaloBot;
            setBots((prev) =>
              prev.map((b) => (b.id === updatedBot.id ? updatedBot : b)),
            );

            // Handle QR Logic
            if (updatedBot.id === activeQrBotId) {
              const statusData = updatedBot.status;
              if (statusData?.qr_code) setQrCodeData(statusData.qr_code);
              if (
                statusData?.state === "LOGGED_IN" ||
                statusData?.state === "ERROR"
              ) {
                setActiveQrBotId(null);
                setQrCodeData(null);
                if (statusData?.state === "LOGGED_IN") fetchThreads();
              }
            }
          }
        },
      )
      // B. Lắng nghe thay đổi Conversation (Last Activity)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => {
          if (activeBotIdForChat) fetchThreads();
        },
      )
      // C. Lắng nghe tin nhắn mới -> Update Chat Frame
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async () => {
          if (activeBotIdForChat && selectedThread) {
            // [OPTIMIZATION] Debounce hoặc check ID trước khi reload
            setTimeout(async () => {
              try {
                const history = await getMessagesAction(
                  activeBotIdForChat,
                  selectedThread.id,
                );
                setMessages(history as ZaloMessage[]);
              } catch (e) {
                console.error(e);
              }
            }, 500);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBotIdForChat, selectedThread, activeQrBotId]);

  // --- HANDLERS (PRESENCE INTEGRATED) ---

  const handleSwitchBot = (botId: string) => {
    setActiveBotIdForChat(botId);
    // [PRESENCE] Cập nhật bot đang xem
    updateStatus({ active_bot_id: botId });
  };

  const handleSelectThread = (thread: ThreadInfo) => {
    setSelectedThread(thread);
    // [PRESENCE] Cập nhật thread đang xem
    updateStatus({ viewing_thread_id: thread.id });

    // Fetch messages
    if (activeBotIdForChat) {
      getMessagesAction(activeBotIdForChat, thread.id)
        .then((msgs) => setMessages(msgs as ZaloMessage[]))
        .catch((e) => console.error(e));
    }
  };

  const handleSendMessage = async (content: string) => {
    if (activeBotIdForChat && selectedThread && staffInfo) {
      setIsSendingMessage(true);
      // [PRESENCE] Bật trạng thái Typing
      updateStatus({ is_typing: true });

      try {
        const res = await sendMessageAction(
          staffInfo.id,
          activeBotIdForChat,
          content,
          selectedThread.id,
          selectedThread.type,
        );
        if (!res.success) {
          alert("Gửi tin nhắn thất bại: " + res.error);
        }
      } catch (err: unknown) {
        alert("Lỗi hệ thống: " + String(err));
      } finally {
        setIsSendingMessage(false);
        // [PRESENCE] Tắt trạng thái Typing
        updateStatus({ is_typing: false });
      }
    }
  };

  // --- RESIZE LOGIC ---
  const startResizing = (t: "MENU" | "CONV_LIST") => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingTarget(t);
  };
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingTarget || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (resizingTarget === "MENU") {
        const w = e.clientX - rect.left;
        if (w > 60 && w < 400) setMenuWidth(w);
      } else if (resizingTarget === "CONV_LIST") {
        const menuW = isMenuExpanded ? menuWidth : 64;
        const w = e.clientX - rect.left - menuW;
        if (w > 200 && w < 500) setConvListWidth(w);
      }
    };
    const handleMouseUp = () => setResizingTarget(null);
    if (resizingTarget) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingTarget, isMenuExpanded, menuWidth]);

  const filteredThreads = threads.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-gray-900 font-sans text-gray-100"
      ref={containerRef}
    >
      {/* COLUMN 1: MAIN MENU */}
      <div
        className="flex h-full flex-shrink-0 relative z-50 shadow-xl bg-gray-900"
        style={{ width: isMenuExpanded ? menuWidth : 64 }}
      >
        <MainMenu
          staffInfo={staffInfo}
          isExpanded={isMenuExpanded}
          onToggleMenu={() => setIsMenuExpanded(!isMenuExpanded)}
          currentView={currentView}
          onChangeView={setCurrentView}
          customWidth={isMenuExpanded ? menuWidth : 64}
        />
        <div
          className="w-1 h-full cursor-col-resize absolute right-0 top-0 hover:bg-blue-500/50 transition-colors z-[60]"
          onMouseDown={startResizing("MENU")}
        />
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden relative bg-gray-800">
        {currentView === "manage" && (
          <BotLoginManager
            bots={bots}
            isLoading={false}
            onRefresh={fetchBots}
            activeQrBotId={activeQrBotId}
            qrCodeData={qrCodeData}
            onSetActiveQrBotId={setActiveQrBotId}
          />
        )}

        {currentView === "chat" && (
          <>
            <div
              className="flex-shrink-0 h-full relative border-r border-gray-700 bg-gray-800 z-40"
              style={{ width: convListWidth }}
            >
              <ConversationList
                threads={filteredThreads}
                selectedThread={selectedThread}
                onSelectThread={handleSelectThread} // Sử dụng handler đã bọc updateStatus
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onFetchThreads={fetchThreads}
                isLoadingThreads={isLoadingThreads}
                bots={bots}
                activeBotId={activeBotIdForChat}
                onSwitchBot={handleSwitchBot} // Sử dụng handler đã bọc updateStatus
                peers={peers} // [NEW] Truyền danh sách đồng nghiệp
              />
              <div
                className="w-1 h-full cursor-col-resize absolute right-0 top-0 hover:bg-blue-500/50 transition-colors z-[50]"
                onMouseDown={startResizing("CONV_LIST")}
              />
            </div>

            <div className="flex-1 flex min-w-0">
              <ChatFrame
                thread={selectedThread}
                messages={messages}
                onSendMessage={handleSendMessage} // Sử dụng handler đã bọc updateStatus
                onToggleDetails={() =>
                  setIsDetailsPanelOpen(!isDetailsPanelOpen)
                }
                isEchoBotEnabled={isEchoBotEnabled}
                onToggleEchoBot={() => setIsEchoBotEnabled(!isEchoBotEnabled)}
                isSendingMessage={isSendingMessage}
                onSetError={(msg) => console.error(msg)}
                userCache={userCache}
              />

              {isDetailsPanelOpen && (
                <DetailsPanel
                  botId={activeBotIdForChat}
                  thread={selectedThread}
                  onClose={() => setIsDetailsPanelOpen(false)}
                  onRefreshThreads={() => {}}
                  onClearSelectedThread={() => setSelectedThread(null)}
                  threads={threads}
                />
              )}
            </div>
          </>
        )}

        {currentView === "setting" && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-900">
            <IconCog className="w-20 h-20 mb-4 opacity-20" />
            <h2 className="text-xl font-bold text-gray-400">
              Cài đặt Hệ thống
            </h2>
            <p>Tính năng đang phát triển...</p>
          </div>
        )}
      </div>
    </div>
  );
}
