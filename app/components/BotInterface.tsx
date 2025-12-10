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
import { ManagementPanel } from "./modules/ManagementPanel";
import { BotListPanel } from "./modules/BotListPanel";
import { getBotsAction } from "../../lib/actions/bot.actions";
import {
  getThreadsFromDBAction,
  getMessagesAction,
  sendMessageAction,
} from "../../lib/actions/chat.actions";
import supabase from "../../lib/supabaseClient";
import { usePresence } from "../../lib/hooks/usePresence";

// Helper: Convert DB Message -> UI ZaloMessage (Append Mode)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convertDbMessageToUi = (dbMsg: any): ZaloMessage => {
  // [IMPORTANT] Sử dụng raw_content để lấy thông tin threadId chính xác
  const rawData = dbMsg.raw_content?.data || {};
  const threadId = dbMsg.raw_content?.threadId || "";

  return {
    type: 0, // Có thể lấy từ raw_content.type nếu cần
    threadId: threadId,
    isSelf: dbMsg.sender_type === "staff_on_bot",
    data: {
      msgId: dbMsg.zalo_msg_id,
      cliMsgId: dbMsg.zalo_msg_id,
      content: dbMsg.content, // Content này đã được parse chuẩn bởi MessageParser mới
      ts: new Date(dbMsg.sent_at).getTime().toString(),
      uidFrom: dbMsg.sender_id,
      dName: rawData.dName || "",
      msgType: dbMsg.msg_type === "text" ? "webchat" : `chat.${dbMsg.msg_type}`,
      // Có thể thêm quote, mentions từ raw_content nếu cần hiển thị ngay lập tức
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
  // --- LAYOUT STATE (4 Cột Resizable) ---
  const [currentView, setCurrentView] = useState<ViewState>("chat");

  // Default Widths
  const [menuWidth, setMenuWidth] = useState(64); // Cột 1
  const [botListWidth, setBotListWidth] = useState(240); // Cột 2
  const [convListWidth, setConvListWidth] = useState(320); // Cột 3

  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [resizingTarget, setResizingTarget] = useState<
    "MENU" | "BOT_LIST" | "CONV_LIST" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- DATA STATE ---
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);

  // UI States
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Login/QR State
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // --- PRESENCE ---
  const { peers, updateStatus } = usePresence({
    staffId: staffInfo?.id || "",
    username: staffInfo?.username || "Guest",
    fullName: staffInfo?.name || "Guest",
    role: staffInfo?.role || "staff",
    avatar: "",
  });

  // --- 1. INITIAL DATA FETCH ---
  const fetchBots = async () => {
    try {
      const data = await getBotsAction();
      setBots(data);
      // Auto-select logic
      if (!activeBotId && data.length > 0) {
        // Ưu tiên bot đang đăng nhập, nếu không thì bot đầu tiên
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    fetchThreads();
    setSelectedThread(null);
    setMessages([]);
    updateStatus({ viewing_thread_id: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBotId]);

  // --- 2. REALTIME ENGINE (DB Push -> Client Append) ---
  useEffect(() => {
    // Kênh này nhận dữ liệu từ bảng messages
    // RLS của Supabase đã tự động lọc các dòng mà staff này được phép xem
    const channel = supabase.channel("realtime-messages");

    // A. Lắng nghe thay đổi trạng thái Bot (Login/QR)
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "zalo_bots" },
      (payload) => {
        const updatedBot = payload.new as ZaloBot;
        setBots((prev) =>
          prev.map((b) => (b.id === updatedBot.id ? updatedBot : b)),
        );

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

    // B. Lắng nghe Tin nhắn mới (APPEND MODE)
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsgRow = payload.new;

        // [FIX LOGIC LỌC]
        // 1. Chỉ xử lý nếu tin nhắn thuộc về Bot đang active
        // (Mặc dù RLS đã lọc, nhưng RLS cho phép xem tất cả bot mà staff quản lý.
        // Ở Client ta chỉ muốn hiện tin nhắn của bot đang hiển thị)
        const botIds = newMsgRow.bot_ids as string[];
        if (!activeBotId || !botIds || !botIds.includes(activeBotId)) {
          return;
        }

        // 2. Chuyển đổi dữ liệu
        const uiMsg = convertDbMessageToUi(newMsgRow);

        // 3. Append vào Chat Frame nếu đang mở đúng Thread
        // Sử dụng Functional Update để đảm bảo lấy state mới nhất
        setMessages((prev) => {
          // Lấy threadId từ state selectedThread hiện tại (thông qua closure hoặc ref, nhưng ở đây dùng logic check payload)
          // Cách tốt nhất: Check xem uiMsg.threadId có khớp với selectedThread.id không?
          // Nhưng chúng ta không truy cập được selectedThread mới nhất trong callback này nếu không thêm vào dependency.
          // Tuy nhiên thêm selectedThread vào dependency sẽ làm subscription bị reset liên tục.

          // WORKAROUND: Ta sẽ luôn cập nhật state messages, nhưng ở tầng render ChatFrame chỉ render nếu ID khớp.
          // KHÔNG ĐƯỢC, vì messages là list của 1 thread cụ thể.

          // GIẢI PHÁP: Sử dụng globalZaloEmitter hoặc Ref để check ID hiện tại.
          // Ở đây để đơn giản và hiệu quả, ta dùng Ref cho selectedThreadId
          if (selectedThreadRef.current === uiMsg.threadId) {
            // Check trùng lặp
            if (prev.some((m) => m.data.msgId === uiMsg.data.msgId))
              return prev;
            return [...prev, uiMsg];
          }
          return prev;
        });

        // 4. Cập nhật Thread List (Last Activity)
        // Nếu có tin mới, thread đó nên nhảy lên đầu.
        // Logic này phức tạp hơn chút, tạm thời fetchThreads lại (Debounced) hoặc update state threads thủ công.
        if (activeBotId) {
          // Optimal: Move thread to top locally
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.id === uiMsg.threadId);
            if (idx > -1) {
              const updatedThread = {
                ...prev[idx],
                lastActivity: new Date().toISOString(),
              };
              const newThreads = [...prev];
              newThreads.splice(idx, 1);
              return [updatedThread, ...newThreads];
            }
            return prev; // Nếu là thread mới chưa có trong list thì cần fetch lại
          });
        }
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBotId, activeQrBotId]);
  // Lưu ý: Không đưa selectedThread vào deps để tránh reconnect socket liên tục.
  // Ta sẽ dùng Ref để truy cập selectedThread bên trong callback.

  // Ref để tracking selected thread ID cho Realtime callback
  const selectedThreadRef = useRef<string | null>(null);
  useEffect(() => {
    selectedThreadRef.current = selectedThread?.id || null;
  }, [selectedThread]);

  // --- HANDLERS ---
  const handleSwitchBot = (botId: string) => {
    setActiveBotId(botId);
    updateStatus({ active_bot_id: botId });
  };

  const handleSelectThread = async (thread: ThreadInfo) => {
    setSelectedThread(thread);
    updateStatus({ viewing_thread_id: thread.id });
    if (activeBotId) {
      // Clear messages cũ ngay lập tức để tránh hiện nhầm
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
        // Không cần tự append tin nhắn vào list vì Realtime sẽ trả về event INSERT từ DB
        // Điều này đảm bảo tính nhất quán (Consistency)
      } catch (e) {
        alert("Gửi lỗi: " + e);
      } finally {
        updateStatus({ is_typing: false });
      }
    }
  };

  // --- RESIZE LOGIC (Cho cả 3 thanh) ---
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
        // Bot List width = x - menuWidth
        const newW = Math.max(64, Math.min(x - menuWidth, 400));
        setBotListWidth(newW);
      } else if (resizingTarget === "CONV_LIST") {
        // Conv List width = x - menuWidth - botListWidth
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

      {/* 2. BOT LIST PANEL (NEW) */}
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

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden min-w-0 bg-gray-800">
        {currentView === "chat" ? (
          <>
            {/* 3. CONVERSATION LIST */}
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

            {/* 4. CHAT FRAME */}
            <div className="flex-1 flex min-w-0 relative">
              <ChatFrame
                thread={selectedThread}
                messages={messages}
                onSendMessage={handleSendMessage}
                onToggleDetails={() =>
                  setIsDetailsPanelOpen(!isDetailsPanelOpen)
                }
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
          <BotLoginManager
            bots={bots}
            isLoading={false}
            onRefresh={fetchBots}
            activeQrBotId={activeQrBotId}
            qrCodeData={qrCodeData}
            onSetActiveQrBotId={setActiveQrBotId}
          />
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
    </div>
  );
}
