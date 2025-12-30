"use client";

import { useState, useRef, useEffect } from "react";
import {
  ThreadInfo,
  ViewState,
  UserCacheEntry,
  ZaloMessage,
} from "../../lib/types/zalo.types";
import { ZaloBot, Message } from "../../lib/types/database.types";
import { MainMenu } from "./modules/MainMenu";
import { ConversationList } from "./modules/ConversationList";
import { ChatFrame } from "./modules/ChatFrame";
// [NEW IMPORT]
import { ConversationInfoPanel } from "./modules/ConversationInfoPanel";
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
import { useWorkSession } from "../../lib/hooks/useWorkSession";

// Helper: Convert DB Message -> UI ZaloMessage (Append Mode)
const convertDbMessageToUi = (
  dbMsg: Message,
  targetThreadId?: string,
  // [NEW PARAMS] Context Data để enrich
  botsList: ZaloBot[] = [],
  userCache: Record<string, UserCacheEntry> = {},
  currentStaff: { id: string; name: string; avatar?: string } | null = null,
  currentThread: ThreadInfo | null = null, // [NEW PARAM]
): ZaloMessage => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = (dbMsg.raw_content as any)?.data || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threadId = targetThreadId || (dbMsg.raw_content as any)?.threadId || "";

  // 1. Resolve Bot Info
  const botInfo = dbMsg.bot_send_id
    ? botsList.find((b) => b.id === dbMsg.bot_send_id)
    : null;

  // 2. Resolve Customer Info (from Cache)
  // Logic: Nếu sender là customer, uidFrom là customer_send_id hoặc fallback zalo_msg_id (legacy)
  const customerId = dbMsg.customer_send_id || dbMsg.zalo_msg_id;
  // [AVATAR LOGIC UPDATE]
  let customerName = "Khách hàng";
  let customerAvatar = "";

  // 1. Tìm trong cache
  const cached = userCache[customerId];
  if (cached) {
    customerName = cached.name;
    customerAvatar = cached.avatar;
  }

  // 2. Fallback: Nếu không có cache, VÀ đây là tin nhắn khách hàng trong hội thoại 1-1
  // -> Lấy Avatar của chính hội thoại đó (vì hội thoại 1-1 thì avt hội thoại = avt khách)
  if (
    !customerAvatar &&
    dbMsg.sender_type === "customer" &&
    currentThread &&
    currentThread.type === 0
  ) {
    customerAvatar = currentThread.avatar;
    customerName = currentThread.name;
  }
  let staffInfo: { name: string; avatar?: string | null } | null = null;

  if (dbMsg.staff_id) {
    if (currentStaff && dbMsg.staff_id === currentStaff.id) {
      staffInfo = {
        name: currentStaff.name,
        avatar: currentStaff.avatar,
      };
    }
    // TODO: Nếu muốn hiện avatar đồng nghiệp realtime, cần fetchStaffById hoặc dùng cache peers từ usePresence
  }

  const extendedInfo = {
    senderType: dbMsg.sender_type,
    botSendId: dbMsg.bot_send_id,
    staffInfo: staffInfo,
    botInfo: botInfo ? { name: botInfo.name, avatar: botInfo.avatar } : null,
    customerInfo: { name: customerName, avatar: customerAvatar }, // Luôn trả về object
  };

  return {
    type: 0,
    threadId: threadId,
    // [LOGIC FIX] isSelf chỉ đúng tương đối, UI ChatFrame sẽ tính lại dựa trên currentBotId
    isSelf: dbMsg.sender_type === "staff" || dbMsg.sender_type === "bot",
    data: {
      msgId: dbMsg.zalo_msg_id,
      cliMsgId: dbMsg.zalo_msg_id,
      content: dbMsg.content,
      ts: new Date(dbMsg.sent_at).getTime().toString(),
      uidFrom:
        dbMsg.sender_type === "customer" ? customerId : dbMsg.bot_send_id || "",
      dName: rawData.dName || "",
      msgType: dbMsg.msg_type === "text" ? "webchat" : `chat.${dbMsg.msg_type}`,
      ...extendedInfo,
    },
  };
};

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

export function BotInterface({ staffInfo, userCache = {} }: BotInterfaceProps) {
  // [NEW] Kích hoạt tracking session
  useWorkSession();
  const [currentView, setCurrentView] = useState<ViewState>("chat");

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

  // [STATE] Conversation Info Panel (CRM)
  const [showConversationInfo, setShowConversationInfo] = useState(false);

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
    avatar: staffInfo?.avatar || "",
  });

  // [REF] Refs để truy cập state mới nhất trong useEffect closure
  const botsRef = useRef<ZaloBot[]>([]);
  useEffect(() => {
    botsRef.current = bots;
  }, [bots]);

  const userCacheRef = useRef<Record<string, UserCacheEntry>>({});
  useEffect(() => {
    userCacheRef.current = userCache;
  }, [userCache]);

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
        const newMsgRow = payload.new as Message;
        if (!newMsgRow || !newMsgRow.conversation_id) return;

        const conversationUUID = newMsgRow.conversation_id;
        const existingThreadIndex = threadsRef.current.findIndex(
          (t) => t.uuid === conversationUUID,
        );

        if (existingThreadIndex > -1) {
          // Update Sidebar
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

          // Update Chat Frame
          if (
            selectedThreadRef.current &&
            selectedThreadRef.current.uuid === conversationUUID
          ) {
            // [LOGIC FIX] Pass refs to enrich data
            const uiMsg = convertDbMessageToUi(
              newMsgRow,
              selectedThreadRef.current.id,
              botsRef.current,
              userCacheRef.current,
              staffInfo,
              selectedThreadRef.current,
            );
            setMessages((prev) => {
              if (prev.some((m) => m.data.msgId === uiMsg.data.msgId))
                return prev;
              return [...prev, uiMsg];
            });
          }
        } else {
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
  const handleLoadMore = (oldMsgs: ZaloMessage[]) => {
    setMessages((prev) => [...oldMsgs, ...prev]);
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
        className="relative flex-shrink-0 flex flex-col bg-gray-900 z-50 shadow-xl"
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
          <div className="flex-1 flex min-w-0 relative">
            <ChatFrame
              thread={selectedThread}
              messages={messages}
              onSendMessage={handleSendMessage}
              onToggleDetails={() =>
                setShowConversationInfo(!showConversationInfo)
              }
              isEchoBotEnabled={false}
              onToggleEchoBot={() => {}}
              isSendingMessage={false}
              onSetError={(msg) => console.error(msg)}
              userCache={userCache}
              currentBotId={activeBotId}
              onLoadMore={handleLoadMore}
            />

            {/* PANEL THÔNG TIN HỘI THOẠI (CRM) */}
            {showConversationInfo && selectedThread && (
              <ConversationInfoPanel
                bot={bots.find((b) => b.id === activeBotId) || null}
                thread={selectedThread}
                onClose={() => setShowConversationInfo(false)}
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
          onStartLogin={async (id) => {
            setActiveQrBotId(id);
            await startBotLoginAction(id);
          }}
          activeQrBotId={activeQrBotId}
          setActiveQrBotId={setActiveQrBotId} // [FIXED] Đã truyền hàm setter
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
