"use client";

import { useState, useRef, useEffect } from "react";
// Import tương đối chuẩn xác
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
  getThreadsAction,
  getMessagesAction,
  sendMessageAction,
} from "../../lib/actions/chat.actions";
import { IconCog } from "./ui/Icons";
import supabase from "../../lib/supabaseClient";

type BotInterfaceProps = {
  // [UPDATED] Thêm trường id vào type
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

  // Dummy states
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
        const active = data.find((b) => b.status?.state === "LOGGED_IN");
        if (active) setActiveBotIdForChat(active.id);
      }
    } catch (e) {
      console.error("Fetch Bots Failed:", e);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  // --- 2. SUPABASE REALTIME SUBSCRIPTION (BOT STATUS) ---
  useEffect(() => {
    console.log("[Realtime] Subscribing to zalo_bots changes...");

    const channel = supabase
      .channel("bot-status-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "zalo_bots" },
        (payload) => {
          const updatedBot = payload.new as ZaloBot;
          console.log("[Realtime] Bot Update:", updatedBot);

          // Update List Bot Local
          setBots((prev) =>
            prev.map((b) => (b.id === updatedBot.id ? updatedBot : b)),
          );

          // Xử lý QR Code & Status riêng cho Bot đang active
          if (updatedBot.id === activeQrBotId) {
            const statusData = updatedBot.status as any;
            if (statusData?.qr_code) {
              setQrCodeData(statusData.qr_code);
            }
            if (
              statusData?.state === "LOGGED_IN" ||
              statusData?.state === "ERROR"
            ) {
              setActiveQrBotId(null);
              setQrCodeData(null);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeQrBotId]);

  // Handle INSERT Bot
  useEffect(() => {
    const channel = supabase
      .channel("bot-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "zalo_bots" },
        (payload) => {
          const newBot = payload.new as ZaloBot;
          setBots((prev) => [newBot, ...prev]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- 3. DATA FETCHING (THREADS) ---
  useEffect(() => {
    const fetchThreads = async () => {
      if (!activeBotIdForChat) return;
      setIsLoadingThreads(true);
      try {
        const data = await getThreadsAction(activeBotIdForChat);
        setThreads(data);
      } catch (e) {
        console.error("Fetch Threads Error:", e);
      } finally {
        setIsLoadingThreads(false);
      }
    };
    fetchThreads();
    setSelectedThread(null);
    setMessages([]);
  }, [activeBotIdForChat]);

  // --- 4. FETCH MESSAGES & REALTIME CHAT ---

  // A. Load lịch sử tin nhắn khi chọn hội thoại
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeBotIdForChat || !selectedThread) return;
      try {
        const history = await getMessagesAction(
          activeBotIdForChat,
          selectedThread.id,
        );
        // Typescript should be happy now as `history` has cliMsgId
        setMessages(history as ZaloMessage[]);
      } catch (e) {
        console.error("Load messages failed:", e);
      }
    };
    fetchMessages();
  }, [activeBotIdForChat, selectedThread]);

  // B. Lắng nghe tin nhắn mới từ DB (Realtime)
  useEffect(() => {
    if (!activeBotIdForChat || !selectedThread) return;

    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          console.log("[Realtime] New Message Inserted:", payload.new);
          // Khi có tin nhắn mới, reload lại list message của thread hiện tại
          // (Cách này đơn giản và đảm bảo dữ liệu đồng bộ nhất với DB pipeline)
          try {
            const history = await getMessagesAction(
              activeBotIdForChat,
              selectedThread.id,
            );
            setMessages(history as ZaloMessage[]);
          } catch (e) {
            console.error("Sync realtime message failed:", e);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBotIdForChat, selectedThread]);

  // --- HANDLERS ---
  const handleSwitchBot = (botId: string) => setActiveBotIdForChat(botId);

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
        {/* VIEW: LOGIN */}
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

        {/* VIEW: CHAT */}
        {currentView === "chat" && (
          <>
            <div
              className="flex-shrink-0 h-full relative border-r border-gray-700 bg-gray-800 z-40"
              style={{ width: convListWidth }}
            >
              <ConversationList
                threads={filteredThreads}
                selectedThread={selectedThread}
                onSelectThread={setSelectedThread}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onFetchThreads={() =>
                  activeBotIdForChat &&
                  getThreadsAction(activeBotIdForChat).then(setThreads)
                }
                isLoadingThreads={isLoadingThreads}
                bots={bots}
                activeBotId={activeBotIdForChat}
                onSwitchBot={handleSwitchBot}
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
                onSendMessage={async (content) => {
                  if (activeBotIdForChat && selectedThread && staffInfo) {
                    // Check staffInfo
                    // console.log("Send:", content);
                    setIsSendingMessage(true);
                    try {
                      // [UPDATED] Truyền staffInfo.id vào action
                      const res = await sendMessageAction(
                        staffInfo.id, // <-- NEW param
                        activeBotIdForChat,
                        content,
                        selectedThread.id,
                        selectedThread.type,
                      );

                      if (!res.success) {
                        alert("Gửi tin nhắn thất bại: " + res.error);
                      }
                      // Thành công thì không cần làm gì, Realtime sẽ tự update tin nhắn mới vào list
                    } catch (err: any) {
                      alert("Lỗi hệ thống: " + err.message);
                    } finally {
                      setIsSendingMessage(false);
                    }
                  }
                }}
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

        {/* VIEW: SETTING */}
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
