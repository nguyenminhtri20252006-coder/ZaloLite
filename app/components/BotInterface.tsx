/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { ThreadInfo, ViewState, UserCacheEntry } from "@/lib/types/zalo.types";
import { ZaloBot, Message } from "@/lib/types/database.types";

// Modules
import { MainMenu } from "./modules/MainMenu";
import { ConversationList } from "./modules/ConversationList";
import ChatFrame from "./modules/ChatFrame";
import { BotManagerPanel } from "./modules/BotManagerPanel";
import { StaffManagerPanel } from "./modules/StaffManagerPanel";
import { ManagementPanel } from "./modules/ManagementPanel";
import { BotListPanel } from "./modules/BotListPanel";

// Actions
import {
  getBotsAction,
  deleteBotAction,
  startBotFromSavedTokenAction,
} from "@/lib/actions/bot.actions";
import { getThreadsFromDBAction } from "@/lib/actions/chat.actions";

// Hooks & Libs
import supabase from "@/lib/supabaseClient";
import { usePresence } from "@/lib/hooks/usePresence";
import { useWorkSession } from "@/lib/hooks/useWorkSession";

type BotInterfaceProps = {
  staffInfo: {
    id: string;
    name: string;
    role: string;
    username: string;
    avatar?: string;
  } | null;
  userCache?: Record<string, UserCacheEntry>;
};

export default function BotInterface({
  staffInfo,
  userCache = {},
}: BotInterfaceProps) {
  // [SYSTEM] Session Tracking
  useWorkSession();

  // [LAYOUT STATE]
  const [currentView, setCurrentView] = useState<ViewState>("chat");
  const [menuWidth, setMenuWidth] = useState(64);
  const [botListWidth, setBotListWidth] = useState(240);
  const [convListWidth, setConvListWidth] = useState(320);
  const [resizingTarget, setResizingTarget] = useState<
    "MENU" | "BOT_LIST" | "CONV_LIST" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // [DATA STATE]
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);

  // [UI STATE]
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // [QR & LOGIN STATE]
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // [PRESENCE]
  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "",
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: staffInfo?.avatar || "",
  });

  // --- 1. FETCH INITIAL DATA ---
  const fetchBots = async () => {
    try {
      const data = await getBotsAction();
      setBots(data as any);

      if (activeBotId && !data.find((b: any) => b.id === activeBotId)) {
        setActiveBotId(null);
      }
      if (!activeBotId && data.length > 0) {
        const active =
          data.find((b: any) => b.status?.state === "LOGGED_IN") || data[0];
        if (active) handleSwitchBot(active.id);
      }
    } catch (e) {
      console.error("Fetch Bots Error:", e);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchThreads = async () => {
    if (!activeBotId) return;
    setIsLoadingThreads(true);
    try {
      const data = await getThreadsFromDBAction(activeBotId);
      setThreads(data);
    } catch (e) {
      console.error("Fetch Threads Error:", e);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  useEffect(() => {
    if (currentView === "chat") {
      fetchThreads();
      setSelectedThread(null);
      updateStatus({ viewing_thread_id: null });
    }
  }, [activeBotId, currentView]);

  // --- 2. REALTIME HANDLER ---
  const threadsRef = useRef<ThreadInfo[]>([]);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    const channel = supabase.channel("realtime-global-supervisor");

    // A. Bot Status
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "zalo_bot_info" },
      (payload) => {
        const updatedBot = payload.new as ZaloBot;
        setBots((prev) => {
          if (!prev.some((b) => b.id === updatedBot.id)) return prev;
          return prev.map((b) =>
            b.id === updatedBot.id ? { ...b, ...updatedBot } : b,
          );
        });

        if (updatedBot.id === activeQrBotId) {
          if (updatedBot.status?.qr_code)
            setQrCodeData(updatedBot.status.qr_code);
          if (updatedBot.status?.state === "LOGGED_IN") {
            setActiveQrBotId(null);
            setQrCodeData(null);
            if (activeBotId === updatedBot.id) fetchThreads();
          }
        }
      },
    );

    // B. New Message -> Reorder Threads
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsgRow = payload.new as Message;
        if (!newMsgRow || !newMsgRow.conversation_id) return;

        const conversationUUID = newMsgRow.conversation_id;

        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.uuid === conversationUUID);
          if (idx > -1) {
            const updated = {
              ...prev[idx],
              lastActivity: new Date().toISOString(),
            };
            const newList = [...prev];
            newList.splice(idx, 1);
            return [updated, ...newList];
          }
          return prev;
        });
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBotId, activeQrBotId]);

  // --- 3. HANDLERS ---

  const handleSwitchBot = (botId: string) => {
    setActiveBotId(botId);
    updateStatus({ active_bot_id: botId });
  };

  const handleSelectThread = (thread: ThreadInfo) => {
    setSelectedThread(thread);
    updateStatus({ viewing_thread_id: thread.id });
  };

  // --- 4. LAYOUT RESIZING LOGIC ---
  const startResize =
    (target: "MENU" | "BOT_LIST" | "CONV_LIST") => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizingTarget(target);
    };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingTarget || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (resizingTarget === "MENU") {
        setMenuWidth(Math.max(64, Math.min(x, 300)));
      } else if (resizingTarget === "BOT_LIST") {
        setBotListWidth(Math.max(64, Math.min(x - menuWidth, 400)));
      } else if (resizingTarget === "CONV_LIST") {
        setConvListWidth(
          Math.max(200, Math.min(x - menuWidth - botListWidth, 600)),
        );
      }
    };
    const handleUp = () => setResizingTarget(null);
    if (resizingTarget) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizingTarget, menuWidth, botListWidth]);

  // --- RENDER ---
  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-gray-900 text-gray-100 font-sans"
      ref={containerRef}
    >
      {/* 1. MAIN MENU */}
      <div
        className="relative flex-shrink-0 flex flex-col bg-gray-900 z-50 shadow-xl border-r border-gray-800"
        style={{ width: menuWidth }}
      >
        <MainMenu
          staffInfo={staffInfo}
          isExpanded={menuWidth > 100}
          onToggleMenu={() => setMenuWidth(menuWidth > 100 ? 64 : 240)}
          currentView={currentView}
          onChangeView={setCurrentView}
          customWidth={menuWidth}
        />
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50"
          onMouseDown={startResize("MENU")}
        />
      </div>

      {/* VIEW SWITCHER */}
      {currentView === "chat" ? (
        <>
          {/* Cột 2: Danh sách Bot (Chỉ hiện khi Chat) */}
          <div
            className="relative flex-shrink-0 flex flex-col bg-gray-900 z-40 border-r border-gray-800"
            style={{ width: botListWidth }}
          >
            <BotListPanel
              bots={bots}
              selectedBotId={activeBotId}
              onSelectBot={handleSwitchBot}
              onRefresh={fetchBots}
              width={botListWidth}
            />
            <div
              className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50"
              onMouseDown={startResize("BOT_LIST")}
            />
          </div>

          {/* Cột 3: Hội thoại */}
          <div
            className="relative flex-shrink-0 h-full border-r border-gray-700 bg-gray-850 z-30"
            style={{ width: convListWidth }}
          >
            <ConversationList
              threads={threads}
              selectedThread={selectedThread}
              onSelectThread={handleSelectThread}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onFetchThreads={fetchThreads}
              isLoadingThreads={isLoadingThreads}
              peers={peers}
            />
            <div
              className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50"
              onMouseDown={startResize("CONV_LIST")}
            />
          </div>

          {/* Cột 4: Chat Frame */}
          <div className="flex-1 flex min-w-0 relative bg-white dark:bg-gray-900">
            {activeBotId && selectedThread ? (
              <ChatFrame
                botId={activeBotId}
                threadId={selectedThread.id}
                threadName={selectedThread.name}
                threadAvatar={selectedThread.avatar}
              />
            ) : (
              // Empty State
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-12 h-12 text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <p>Chọn một hội thoại để bắt đầu</p>
              </div>
            )}

            {/* [REMOVED] ConversationInfoPanel (CRM) */}
          </div>
        </>
      ) : currentView === "manage" ? (
        // VIEW: QUẢN LÝ BOT
        <BotManagerPanel
          bots={bots}
          isLoading={false}
          onRefresh={fetchBots}
          onDeleteBot={async (id) => {
            await deleteBotAction(id);
            fetchBots();
          }}
          onStartLogin={async (id) => {
            setActiveQrBotId(id);
            await startBotFromSavedTokenAction(id);
          }}
          activeQrBotId={activeQrBotId}
          setActiveQrBotId={setActiveQrBotId}
          qrCodeData={qrCodeData}
          userRole={staffInfo?.role || "staff"}
        />
      ) : currentView === "staff" && staffInfo?.role === "admin" ? (
        // VIEW: QUẢN LÝ NHÂN VIÊN
        <StaffManagerPanel />
      ) : (
        // VIEW: CÔNG CỤ KHÁC (Manual Scan, etc.)
        <ManagementPanel
          botId={activeBotId}
          selectedThread={selectedThread}
          threads={threads}
          onRefreshThreads={fetchThreads}
          userCache={userCache}
          onStartManualScan={() => {}}
          isScanningAll={false}
          scanStatus="Idle"
        />
      )}
    </div>
  );
}
