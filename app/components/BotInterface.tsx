/**
 * app/components/BotInterface.tsx
 * [FIXED REALTIME]
 * - Sử dụng 'uuid' từ danh sách threads để map tin nhắn Realtime về đúng 'Global Hash ID'.
 */

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
import { BotManagerPanel } from "./modules/BotManagerPanel";
import { StaffManagerPanel } from "./modules/StaffManagerPanel";
import { ManagementPanel } from "./modules/ManagementPanel";
import { BotListPanel } from "./modules/BotListPanel";
import {
  getBotsAction,
  deleteBotAction,
  startBotLoginAction,
} from "../../lib/actions/bot.actions";
import {
  getThreadsFromDBAction,
  getMessagesAction,
  sendMessageAction,
} from "../../lib/actions/chat.actions";
import supabase from "../../lib/supabaseClient";
import { usePresence } from "../../lib/hooks/usePresence";
import { useWorkSession } from "../../lib/hooks/useWorkSession"; // [NEW IMPORT]

// Helper: Convert DB Message -> UI ZaloMessage (Append Mode)
const convertDbMessageToUi = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbMsg: any,
  targetThreadId?: string,
): ZaloMessage => {
  const rawData = dbMsg.raw_content?.data || {};
  // Nếu không truyền targetThreadId (Hash), fallback về raw (Numeric) - nhưng sẽ lệch UI
  const threadId = targetThreadId || dbMsg.raw_content?.threadId || "";

  return {
    type: 0,
    threadId: threadId,
    isSelf: dbMsg.sender_type === "staff_on_bot",
    data: {
      msgId: dbMsg.zalo_msg_id,
      cliMsgId: dbMsg.zalo_msg_id,
      content: dbMsg.content,
      ts: new Date(dbMsg.sent_at).getTime().toString(),
      uidFrom: dbMsg.sender_id,
      dName: rawData.dName || "",
      msgType: dbMsg.msg_type === "text" ? "webchat" : `chat.${dbMsg.msg_type}`,
    },
  };
};

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
  // [NEW] Kích hoạt tracking session
  useWorkSession();

  const [currentView, setCurrentView] = useState<ViewState>("chat");

  // Layout Widths
  const [menuWidth, setMenuWidth] = useState(64);
  const [botListWidth, setBotListWidth] = useState(240);
  const [convListWidth, setConvListWidth] = useState(320);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [resizingTarget, setResizingTarget] = useState<
    "MENU" | "BOT_LIST" | "CONV_LIST" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Data State
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // QR State (Global)
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "",
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: "",
  });

  const fetchBots = async () => {
    try {
      const data = await getBotsAction();
      setBots(data);
      // Nếu bot đang chọn không còn trong danh sách (do mất quyền), reset
      if (activeBotId && !data.find((b) => b.id === activeBotId)) {
        setActiveBotId(null);
      }
      if (!activeBotId && data.length > 0) {
        const active =
          data.find((b) => b.status?.state === "LOGGED_IN") || data[0];
        if (active) handleSwitchBot(active.id);
      }
    } catch (e) {
      console.error(e);
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
      console.error(e);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  useEffect(() => {
    if (currentView === "chat") {
      fetchThreads();
      setSelectedThread(null);
      setMessages([]);
      updateStatus({ viewing_thread_id: null });
    }
  }, [activeBotId, currentView]);

  // Realtime Logic (Giữ nguyên)
  const threadsRef = useRef<ThreadInfo[]>([]);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const selectedThreadRef = useRef<ThreadInfo | null>(null);
  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  // --- REALTIME ENGINE ---
  useEffect(() => {
    const channel = supabase.channel("realtime-messages");

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "zalo_bots" },
      (payload) => {
        const updatedBot = payload.new as ZaloBot;
        // Chỉ update nếu bot này có trong danh sách được phép xem
        setBots((prev) => {
          if (!prev.some((b) => b.id === updatedBot.id)) return prev;
          return prev.map((b) => (b.id === updatedBot.id ? updatedBot : b));
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

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsgRow = payload.new;
        const botIds = newMsgRow.bot_ids as string[];
        // UUID của hội thoại trong DB
        const conversationUUID = newMsgRow.conversation_id;

        // 1. Filter: Chỉ xử lý nếu tin nhắn thuộc Bot đang active
        if (!activeBotId || !botIds || !botIds.includes(activeBotId)) return;

        // 2. Logic cập nhật UI Chat Frame (QUAN TRỌNG)
        // Thay vì so sánh threadId (Zalo ID), ta so sánh UUID của DB
        if (
          selectedThreadRef.current &&
          selectedThreadRef.current.uuid === conversationUUID
        ) {
          console.log(
            `[Realtime] 🎯 Msg for SELECTED thread (UUID match): ${conversationUUID}`,
          );

          // Convert message, truyền ID Hash của thread đang chọn để đảm bảo UI khớp
          const uiMsg = convertDbMessageToUi(
            newMsgRow,
            selectedThreadRef.current.id,
          );

          setMessages((prev) => {
            if (prev.some((m) => m.data.msgId === uiMsg.data.msgId))
              return prev;
            return [...prev, uiMsg];
          });
        }

        // 3. Logic cập nhật Sidebar (Thread List)
        // Tìm xem thread này đã có trong list chưa (bằng UUID)
        const existingThreadIndex = threadsRef.current.findIndex(
          (t) => t.uuid === conversationUUID,
        );

        if (existingThreadIndex > -1) {
          // Case A: Thread đã có trong list -> Đẩy lên đầu & Update time
          console.log(`[Realtime] 🔄 Updating existing thread list...`);
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
        } else {
          // Case B: Thread mới (chưa có trong list) -> Fetch lại
          console.log(
            `[Realtime] 🆕 New thread detected (UUID: ${conversationUUID}), fetching list...`,
          );
          fetchThreads();
        }
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBotId, activeQrBotId]);

  const handleSwitchBot = (botId: string) => {
    setActiveBotId(botId);
    updateStatus({ active_bot_id: botId });
  };
  const handleSelectThread = async (thread: ThreadInfo) => {
    setSelectedThread(thread);
    updateStatus({ viewing_thread_id: thread.id });
    if (activeBotId) {
      setMessages([]);
      try {
        const msgs = await getMessagesAction(activeBotId, thread.id);
        setMessages(msgs as ZaloMessage[]);
      } catch (e) {
        console.error(e);
      }
    }
  };
  const handleSendMessage = async (content: string) => {
    if (activeBotId && selectedThread && staffInfo) {
      updateStatus({ is_typing: true });
      try {
        await sendMessageAction(
          staffInfo.id,
          activeBotId,
          content,
          selectedThread.id,
          selectedThread.type,
        );
      } catch (e) {
        alert("Gửi lỗi: " + e);
      } finally {
        updateStatus({ is_typing: false });
      }
    }
  };

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
        const newW = Math.max(64, Math.min(x, 300));
        setMenuWidth(newW);
        setIsMenuExpanded(newW > 100);
      } else if (resizingTarget === "BOT_LIST") {
        const newW = Math.max(64, Math.min(x - menuWidth, 400));
        setBotListWidth(newW);
      } else if (resizingTarget === "CONV_LIST") {
        const newW = Math.max(200, Math.min(x - menuWidth - botListWidth, 600));
        setConvListWidth(newW);
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
        className="relative flex-shrink-0 flex flex-col bg-gray-900 z-50 shadow-xl"
        style={{ width: menuWidth }}
      >
        <MainMenu
          staffInfo={staffInfo}
          isExpanded={isMenuExpanded}
          onToggleMenu={() => {
            const target = isMenuExpanded ? 64 : 240;
            setMenuWidth(target);
            setIsMenuExpanded(!isMenuExpanded);
          }}
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
          <div className="flex-1 flex min-w-0 relative">
            <ChatFrame
              thread={selectedThread}
              messages={messages}
              onSendMessage={handleSendMessage}
              onToggleDetails={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)}
              isEchoBotEnabled={false}
              onToggleEchoBot={() => {}}
              isSendingMessage={false}
              onSetError={(msg) => console.error(msg)}
              userCache={userCache}
            />
            {isDetailsPanelOpen && (
              <DetailsPanel
                botId={activeBotId}
                thread={selectedThread}
                onClose={() => setIsDetailsPanelOpen(false)}
                onRefreshThreads={fetchThreads}
                onClearSelectedThread={() => setSelectedThread(null)}
                threads={threads}
              />
            )}
          </div>
        </>
      ) : currentView === "manage" ? (
        <BotManagerPanel
          bots={bots}
          isLoading={false}
          onRefresh={fetchBots}
          onDeleteBot={async (id) => {
            await deleteBotAction(id);
            fetchBots();
          }}
          onStartLogin={async (id: string) => {
            setActiveQrBotId(id);
            await startBotLoginAction(id);
          }}
          activeQrBotId={activeQrBotId}
          qrCodeData={qrCodeData}
          userRole={staffInfo?.role || "staff"}
        />
      ) : currentView === "staff" && staffInfo?.role === "admin" ? (
        <StaffManagerPanel />
      ) : (
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
