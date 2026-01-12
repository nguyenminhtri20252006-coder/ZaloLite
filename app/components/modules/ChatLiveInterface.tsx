/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { ZaloBot, Message } from "@/lib/types/database.types";
import { ConversationList } from "./ConversationList";
import ChatFrame from "./ChatFrame";
import { BotListPanel } from "./BotListPanel";
import { ConversationInfoPanel } from "./ConversationInfoPanel";
import { getBotsAction } from "@/lib/actions/bot.actions";
import {
  getThreadsFromDBAction,
  getSingleThreadAction,
} from "@/lib/actions/chat.actions";
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
  const router = useRouter();

  // [HOOKS - ALWAYS CALL FIRST]
  // 1. Layout State
  const [botListWidth, setBotListWidth] = useState(240);
  const [convListWidth, setConvListWidth] = useState(320);
  const [resizingTarget, setResizingTarget] = useState<
    "BOT_LIST" | "CONV_LIST" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 2. Data State
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);

  // 3. UI State
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // 4. Presence Hook (Call unconditionally with fallback values)
  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "guest", // Safe fallback
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: staffInfo?.avatar || "",
  });

  // [AUTH GUARD EFFECT] Check redirect logic
  useEffect(() => {
    if (!staffInfo) {
      console.warn("No Staff Info. Redirecting to login...");
      router.replace("/login");
    }
  }, [staffInfo, router]);

  // [FETCH DATA EFFECTS]
  // 1. Fetch Bots
  const fetchBots = async () => {
    if (!staffInfo) return; // Guard inside function
    try {
      const data = await getBotsAction();
      setBots(data);
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
    if (staffInfo) fetchBots();
  }, [staffInfo]); // Only run if staffInfo exists

  // 2. Fetch Threads
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

  // 3. Realtime Handler
  useEffect(() => {
    if (!activeBotId || !staffInfo) return;

    const channel = supabase.channel(`live-chat-list:${activeBotId}`);

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "zalo_bot_info" },
      (payload) => {
        const updatedBot = payload.new as any;
        setBots((prev) =>
          prev.map((b) =>
            b.bot_info_id === updatedBot.id ? { ...b, ...updatedBot } : b,
          ),
        );
      },
    );

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async (payload) => {
        const newMsgRow = payload.new as Message;
        if (!newMsgRow.conversation_id) return;
        const convUuid = newMsgRow.conversation_id;
        const exists = threads.some((t) => t.uuid === convUuid);

        if (exists) {
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.uuid === convUuid);
            if (idx === -1) return prev;
            const target = prev[idx];
            const updated = {
              ...target,
              lastActivity: new Date().toISOString(),
              lastMessage: newMsgRow.content as any,
            };
            const newList = [...prev];
            newList.splice(idx, 1);
            return [updated, ...newList];
          });
        } else {
          const newThreadInfo = await getSingleThreadAction(
            activeBotId,
            convUuid,
          );
          if (newThreadInfo) {
            setThreads((prev) => [newThreadInfo, ...prev]);
          }
        }
      },
    );

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversations" },
      (payload) => {
        const updatedConv = payload.new;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.uuid === updatedConv.id) {
              return {
                ...t,
                name: updatedConv.name || t.name,
                avatar: updatedConv.avatar || t.avatar,
              };
            }
            return t;
          }),
        );
        if (selectedThread?.uuid === updatedConv.id) {
          setSelectedThread((prev) =>
            prev
              ? {
                  ...prev,
                  name: updatedConv.name || prev.name,
                  avatar: updatedConv.avatar || prev.avatar,
                }
              : null,
          );
        }
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBotId, threads, staffInfo]);

  // [HANDLERS]
  const handleSwitchBot = (botId: string) => {
    setActiveBotId(botId);
  };
  const handleSelectThread = (thread: ThreadInfo) => {
    setSelectedThread(thread);
    updateStatus({ viewing_thread_id: thread.uuid });
  };

  const startResize =
    (target: "BOT_LIST" | "CONV_LIST") => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizingTarget(target);
    };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingTarget || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (resizingTarget === "BOT_LIST")
        setBotListWidth(Math.max(64, Math.min(x, 400)));
      else if (resizingTarget === "CONV_LIST")
        setConvListWidth(Math.max(200, Math.min(x - botListWidth, 600)));
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

  // [CONDITIONAL RENDER - AFTER ALL HOOKS]
  if (!staffInfo) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 text-gray-400">
        Redirecting...
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-gray-900"
      ref={containerRef}
    >
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
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors"
          onMouseDown={startResize("BOT_LIST")}
        />
      </div>

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
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors"
          onMouseDown={startResize("CONV_LIST")}
        />
      </div>

      <div className="flex-1 flex min-w-0 relative bg-white dark:bg-gray-900">
        {activeBotId && selectedThread ? (
          <div className="flex w-full h-full">
            <div className="flex-1 min-w-0">
              <ChatFrame
                botId={activeBotId}
                threadId={selectedThread.uuid}
                displayThreadId={selectedThread.id}
                threadName={selectedThread.name}
                threadAvatar={selectedThread.avatar}
                onToggleDetails={() => setShowDetails(!showDetails)}
              />
            </div>
            {showDetails && (
              <ConversationInfoPanel
                bot={bots.find((b) => b.id === activeBotId) || null}
                thread={selectedThread}
                onClose={() => setShowDetails(false)}
              />
            )}
          </div>
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
