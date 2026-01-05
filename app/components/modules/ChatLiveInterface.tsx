/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { ZaloBot, Message } from "@/lib/types/database.types";

// Modules
import { ConversationList } from "./ConversationList";
import ChatFrame from "./ChatFrame";
import { BotListPanel } from "./BotListPanel";

// Actions
import { getBotsAction } from "@/lib/actions/bot.actions";
import { getThreadsFromDBAction } from "@/lib/actions/chat.actions";

// Hooks
import supabase from "@/lib/supabaseClient";
import { usePresence } from "@/lib/hooks/usePresence";

type ChatLiveInterfaceProps = {
  staffInfo: {
    id: string;
    name: string;
    role: string;
    username: string;
    avatar?: string;
  } | null;
};

export function ChatLiveInterface({ staffInfo }: ChatLiveInterfaceProps) {
  // [LAYOUT STATE]
  const [botListWidth, setBotListWidth] = useState(240);
  const [convListWidth, setConvListWidth] = useState(320);
  const [resizingTarget, setResizingTarget] = useState<
    "BOT_LIST" | "CONV_LIST" | null
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

  // [PRESENCE]
  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "",
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: staffInfo?.avatar || "",
  });

  // --- 1. FETCH BOTS ---
  const fetchBots = async () => {
    try {
      const data = await getBotsAction();
      setBots(data);

      // Auto-select first logged-in bot if none selected
      if (!activeBotId && data.length > 0) {
        const active =
          data.find((b) => b.status?.state === "LOGGED_IN") || data[0];
        if (active) handleSwitchBot(active.id);
      }
    } catch (e) {
      console.error("Fetch Bots Error:", e);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  // --- 2. FETCH THREADS ---
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
    if (activeBotId) {
      fetchThreads();
      setSelectedThread(null);
      updateStatus({ active_bot_id: activeBotId, viewing_thread_id: null });
    }
  }, [activeBotId]);

  // --- 3. REALTIME HANDLER ---
  useEffect(() => {
    const channel = supabase.channel("realtime-chat-live");

    // A. Bot Status Updates
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
      },
    );

    // B. New Messages -> Reorder Threads
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsgRow = payload.new as Message;
        // Only react if message belongs to a thread we might care about
        if (!newMsgRow || !newMsgRow.conversation_id) return;

        const conversationUUID = newMsgRow.conversation_id;

        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.uuid === conversationUUID);
          if (idx > -1) {
            // Found existing thread -> Move to top + Update snippet
            const updated = {
              ...prev[idx],
              lastActivity: new Date().toISOString(),
              snippet: (newMsgRow.content as any)?.text || "Tin nhắn mới",
            };
            const newList = [...prev];
            newList.splice(idx, 1);
            return [updated, ...newList];
          }
          // If thread not found, we might need to fetch it (or handle via Conversation Sync)
          return prev;
        });
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- 4. HANDLERS ---
  const handleSwitchBot = (botId: string) => {
    setActiveBotId(botId);
  };

  const handleSelectThread = (thread: ThreadInfo) => {
    setSelectedThread(thread);
    updateStatus({ viewing_thread_id: thread.id });
  };

  // --- 5. RESIZE LOGIC ---
  const startResize =
    (target: "BOT_LIST" | "CONV_LIST") => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizingTarget(target);
    };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingTarget || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left; // x relative to container

      // Note: Layout now starts after Sidebar (64px fixed).
      // If MainMenu is in parent layout, we assume x starts from 0 of this component (which is next to sidebar)

      if (resizingTarget === "BOT_LIST") {
        setBotListWidth(Math.max(64, Math.min(x, 400)));
      } else if (resizingTarget === "CONV_LIST") {
        setConvListWidth(Math.max(200, Math.min(x - botListWidth, 600)));
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
  }, [resizingTarget, botListWidth]);

  // --- RENDER ---
  return (
    <div
      className="flex h-full w-full overflow-hidden bg-gray-900"
      ref={containerRef}
    >
      {/* COL 1: BOT LIST */}
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
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors"
          onMouseDown={startResize("BOT_LIST")}
        />
      </div>

      {/* COL 2: CONVERSATION LIST */}
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
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors"
          onMouseDown={startResize("CONV_LIST")}
        />
      </div>

      {/* COL 3: CHAT FRAME */}
      <div className="flex-1 flex min-w-0 relative bg-white dark:bg-gray-900">
        {activeBotId && selectedThread ? (
          <ChatFrame
            botId={activeBotId}
            threadId={selectedThread.id}
            threadName={selectedThread.name}
            threadAvatar={selectedThread.avatar}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 select-none">
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
            <p>Chọn một hội thoại để bắt đầu chat</p>
          </div>
        )}
      </div>
    </div>
  );
}
