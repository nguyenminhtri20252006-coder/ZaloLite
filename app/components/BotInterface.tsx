"use client";

import { useState, useRef, useEffect } from "react";
import {
  ThreadInfo,
  ZaloMessage,
  ViewState,
  UserCacheEntry,
} from "@/lib/types/zalo.types";
import { ZaloBot } from "@/lib/types/database.types"; // Import type Bot
import { MainMenu } from "@/app/components/modules/MainMenu";
import { ConversationList } from "@/app/components/modules/ConversationList";
import { ChatFrame } from "@/app/components/modules/ChatFrame";
import { DetailsPanel } from "@/app/components/modules/DetailsPanel";
import { BotLoginManager } from "@/app/components/modules/BotLoginManager"; // Import Component Mới
import {
  getBotsAction,
  createBotAction,
  deleteBotAction,
  startBotLoginAction,
} from "@/lib/actions/bot.actions";
import { getThreadsAction } from "@/lib/actions/chat.actions";
import { ZALO_EVENTS } from "@/lib/event-emitter";
import { IconCog } from "@/app/components/ui/Icons";

type BotInterfaceProps = {
  staffInfo: { name: string; role: string; username: string } | null;
  filteredThreads: ThreadInfo[];
  selectedThread: ThreadInfo | null;
  onSelectThread: (thread: ThreadInfo) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onFetchThreads: () => void;
  isLoadingThreads: boolean;
  thread: ThreadInfo | null;
  messages: ZaloMessage[];
  onSendMessage: (content: string) => Promise<void>;
  isEchoBotEnabled: boolean;
  onToggleEchoBot: (e: any) => void;
  onSendVocabulary: (topic: string, type: 0 | 1) => Promise<void>;
  isSendingMessage: boolean;
  isSendingVocab: boolean;
  threadForDetails: ThreadInfo | null;
  isDetailsPanelOpen: boolean;
  onToggleDetails: () => void;
  onRefreshThreads: () => void;
  onClearSelectedThread: () => void;
  threads: ThreadInfo[];
  errorMessage: string | null;
  onClearError: () => void;
  onSetError: (message: string | null) => void;
  userCache: Record<string, UserCacheEntry>;
  onStartManualScan: () => void;
  isScanningAll: boolean;
  scanStatus: string;
};

export function BotInterface({
  staffInfo,
  onSendMessage,
  isEchoBotEnabled,
  onToggleEchoBot,
  onSendVocabulary,
  isSendingMessage,
  isSendingVocab,
  threadForDetails,
  isDetailsPanelOpen,
  onToggleDetails,
  onSetError,
  userCache,
}: BotInterfaceProps) {
  // --- GLOBAL STATE ---
  const [currentView, setCurrentView] = useState<ViewState>("chat");
  const [bots, setBots] = useState<ZaloBot[]>([]);

  // --- CHAT STATE ---
  const [activeBotIdForChat, setActiveBotIdForChat] = useState<string | null>(
    null,
  );
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);

  // State Login Flow
  const [activeQrBotId, setActiveQrBotId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // --- RESIZE STATE ---
  const [menuWidth, setMenuWidth] = useState(240); // Menu trái
  const [convListWidth, setConvListWidth] = useState(300); // List hội thoại
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [resizingTarget, setResizingTarget] = useState<
    "MENU" | "CONV_LIST" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- SSE & DATA FETCHING ---
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchBots = async () => {
    try {
      const data = await getBotsAction();
      setBots(data);
      // Nếu chưa chọn bot chat nào, auto chọn bot đầu tiên active
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
    // Setup SSE (Realtime Status)
    const es = new EventSource("/api/zalo-events");
    es.addEventListener(ZALO_EVENTS.QR_GENERATED, (e) => {
      const p = JSON.parse(e.data);
      if (p.botId === activeQrBotId) setQrCodeData(p.qrCode);
      updateBotStatusLocal(p.botId, "QR_WAITING");
    });
    es.addEventListener(ZALO_EVENTS.STATUS_UPDATE, (e) => {
      const p = JSON.parse(e.data);
      updateBotStatusLocal(p.botId, p.status.state, p.status.error_message);
      if (p.status.state === "LOGGED_IN") fetchBots();
    });
    return () => es.close();
  }, [activeQrBotId]);

  const updateBotStatusLocal = (botId: string, state: any, error?: string) => {
    setBots((prev) =>
      prev.map((b) =>
        b.id === botId
          ? { ...b, status: { ...b.status, state, error_message: error } }
          : b,
      ),
    );
  };

  // --- DATA FETCHING (THREADS) ---
  const fetchThreads = async (botId: string) => {
    if (!botId) return;
    setIsLoadingThreads(true);
    try {
      const data = await getThreadsAction(botId);
      setThreads(data);
    } catch (e) {
      console.error("Fetch Threads Error:", e);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  // Trigger fetch when switching bot in chat
  useEffect(() => {
    if (activeBotIdForChat) {
      fetchThreads(activeBotIdForChat);
      setSelectedThread(null); // Clear selected thread when switching bot
    }
  }, [activeBotIdForChat]);

  // --- HANDLERS ---
  const handleSwitchBot = (botId: string) => setActiveBotIdForChat(botId);
  const handleCreateBot = async (name: string) => {
    await createBotAction(name);
    fetchBots();
  };
  const handleDeleteBot = async (id: string) => {
    await deleteBotAction(id);
    fetchBots();
  };
  const handleStartLogin = async (id: string) => {
    setActiveQrBotId(id);
    setQrCodeData(null);
    updateBotStatusLocal(id, "QR_WAITING");
    try {
      await startBotLoginAction(id);
    } catch (e) {
      alert(e);
    }
  };

  // --- RESIZE HANDLERS ---
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

  // Filter threads
  const filteredThreads = threads.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-gray-900 font-sans text-gray-100"
      ref={containerRef}
    >
      {/* COLUMN 1: MAIN MENU (Resizable) */}
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
            onCreateBot={handleCreateBot}
            onDeleteBot={handleDeleteBot}
            onStartLoginQR={handleStartLogin}
            activeQrBotId={activeQrBotId}
            qrCodeData={qrCodeData}
          />
        )}

        {/* VIEW: CHAT */}
        {currentView === "chat" && (
          <>
            {/* Sidebar Conversation List (Resizable) */}
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
                  activeBotIdForChat && fetchThreads(activeBotIdForChat)
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

            {/* COLUMN 3: CHAT FRAME (Fluid) */}
            <div className="flex-1 flex min-w-0">
              <ChatFrame
                thread={selectedThread}
                messages={[]} // TODO: Cần logic fetch message theo botId & threadId
                onSendMessage={async (content) => {
                  if (activeBotIdForChat && selectedThread) {
                    // Gọi action send message mới với botId
                    // await sendMessageAction(activeBotIdForChat, content, selectedThread.id, selectedThread.type);
                  }
                }}
                onToggleDetails={onToggleDetails}
                isEchoBotEnabled={isEchoBotEnabled}
                onToggleEchoBot={onToggleEchoBot}
                onSendVocabulary={onSendVocabulary}
                isSendingMessage={isSendingMessage}
                isSendingVocab={isSendingVocab}
                onSetError={onSetError}
                userCache={userCache}
              />

              {/* Details Sidebar (Optional) */}
              {isDetailsPanelOpen && (
                <DetailsPanel
                  botId={activeBotIdForChat}
                  thread={selectedThread}
                  onClose={onToggleDetails}
                  onRefreshThreads={() =>
                    activeBotIdForChat && fetchThreads(activeBotIdForChat)
                  }
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
