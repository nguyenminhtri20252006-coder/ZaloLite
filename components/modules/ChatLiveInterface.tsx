/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { ZaloBot } from "@/lib/types/database.types";
import { ConversationList } from "./ConversationList";
import ChatFrame from "./ChatFrame";
import { BotListPanel } from "./BotListPanel";
import { ConversationInfoPanel } from "./ConversationInfoPanel";
import { getBotsAction } from "@/lib/actions/bot.actions";
import {
  getThreadsFromDBAction,
  getSingleThreadAction,
} from "@/lib/actions/chat.actions";
import { usePresence } from "@/hooks/usePresence";
import { useSSE } from "@/context/SSEContext";

// Định nghĩa kiểu dữ liệu Payload từ SSE NotificationService
type SSEMessagePayload = {
  id: string;
  conversation_id: string;
  content: any;
  sent_at: string;
  flags: any;
  sender: {
    id: string;
    type: string;
    name: string;
    avatar: string;
    is_self: boolean;
  };
  context: {
    bot_id: string;
    thread_id: string;
  };
};

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

  // 4. Presence & Realtime
  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "guest",
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: staffInfo?.avatar || "",
  });

  const { subscribe, unsubscribe } = useSSE();

  // [AUTH GUARD EFFECT]
  useEffect(() => {
    if (!staffInfo) {
      console.warn("No Staff Info. Redirecting to login...");
      router.replace("/login");
    }
  }, [staffInfo, router]);

  // [FETCH DATA EFFECTS]
  const fetchBots = async () => {
    if (!staffInfo) return;
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
  }, [staffInfo]);

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

  // [REALTIME HANDLER - SSE REPLACEMENT]
  useEffect(() => {
    // Handler sự kiện tin nhắn mới từ SSE
    const handleNewMessage = async (payload: SSEMessagePayload) => {
      // 1. Chỉ xử lý nếu tin nhắn thuộc về Bot đang active
      if (activeBotId && payload.context?.bot_id !== activeBotId) return;

      console.log("[Realtime] 📩 SSE Message:", payload.id);
      const convUuid = payload.conversation_id;

      // 2. Cập nhật danh sách Threads (Move to Top)
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.uuid === convUuid);

        // Nếu thread đã tồn tại -> Update & Move Top
        if (idx !== -1) {
          const target = prev[idx];
          const updated: ThreadInfo = {
            ...target,
            lastActivity: payload.sent_at,
            // Chuyển format nội dung cho UI preview (rút gọn)
            lastMessage: payload.content,
          };
          const newList = [...prev];
          newList.splice(idx, 1);
          return [updated, ...newList];
        } else {
          // Nếu chưa có -> Cần fetch (vì SSE payload chưa đủ info của Thread như avatar/tên nhóm)
          // Hoặc có thể trigger fetchSingleThread ở đây
          // Tạm thời bỏ qua để đơn giản, hoặc gọi fetchThreads() lại sau 1s
          return prev;
        }
      });
    };

    subscribe("user_stream", "new_message", handleNewMessage);

    return () => {
      unsubscribe("user_stream", "new_message", handleNewMessage);
    };
  }, [activeBotId, subscribe, unsubscribe]);

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

  // [CONDITIONAL RENDER]
  if (!staffInfo) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 text-gray-400">
        Redirecting...
      </div>
    );
  }

  // --- UI RENDER ---
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
