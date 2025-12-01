"use client";

/**
 * app/components/BotInterface.tsx
 * [UX UPGRADE]
 * - Thêm tính năng Resizable Sidebar (Kéo thả).
 * - Cải thiện layout tổng thể.
 */
import { ChangeEvent, useState, useRef, useEffect, useMemo } from "react";
import {
  AccountInfo,
  ThreadInfo,
  ZaloMessage,
  ViewState,
  UserCacheEntry,
} from "@/lib/types/zalo.types";
import { MainMenu } from "@/app/components/modules/MainMenu";
import { ConversationList } from "@/app/components/modules/ConversationList";
import { ChatFrame } from "@/app/components/modules/ChatFrame";
import { DetailsPanel } from "@/app/components/modules/DetailsPanel";
import { ManagementPanel } from "@/app/components/modules/ManagementPanel";

// Định nghĩa Props (Giữ nguyên)
type BotInterfaceProps = {
  accountInfo: AccountInfo | null;
  onCopyToken: () => void;
  isCopying: boolean;
  isExpanded: boolean;
  onToggleMenu: () => void;
  onLogout: () => void;
  onFetchAccountInfo: () => void;
  isLoadingAccountInfo: boolean;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
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
  onToggleEchoBot: (e: ChangeEvent<HTMLInputElement>) => void;
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
  // THÊM MỚI (Lô Cache): Props cho User Cache
  userCache: Record<string, UserCacheEntry>;
  onStartManualScan: () => void;
  isScanningAll: boolean;
  scanStatus: string;
};

export function BotInterface({
  // Tách props ra
  accountInfo,
  onCopyToken,
  isCopying,
  isExpanded,
  onToggleMenu,
  onLogout,
  onFetchAccountInfo,
  isLoadingAccountInfo,
  // THÊM MỚI: Props cho Tabs (View)
  currentView,
  onChangeView,
  // Props cho Module 2
  filteredThreads,
  selectedThread,
  onSelectThread,
  searchTerm,
  onSearchChange,
  onFetchThreads,
  isLoadingThreads,
  thread,
  messages,
  onSendMessage,
  isEchoBotEnabled,
  onToggleEchoBot,
  onSendVocabulary,
  isSendingMessage,
  isSendingVocab,
  threadForDetails,
  isDetailsPanelOpen,
  onToggleDetails,
  onRefreshThreads,
  onClearSelectedThread,
  threads,
  errorMessage,
  onClearError,
  onSetError,
  userCache,
  onStartManualScan,
  isScanningAll,
  scanStatus,
}: BotInterfaceProps) {
  // --- RESIZABLE LOGIC ---

  // State độ rộng
  const [menuWidth, setMenuWidth] = useState(260); // Menu trái
  const [detailsWidth, setDetailsWidth] = useState(400); // Details phải (Mặc định 320px)

  // State điều khiển kéo thả: null | 'MENU' | 'DETAILS'
  const [resizingTarget, setResizingTarget] = useState<
    "MENU" | "DETAILS" | null
  >(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Derived State cho Menu trái
  const actualMenuWidth = isExpanded ? menuWidth : 64;

  // Handlers bắt đầu kéo
  const startResizingMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingTarget("MENU");
  };

  const startResizingDetails = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingTarget("DETAILS");
  };

  const stopResizing = () => {
    setResizingTarget(null);
  };

  const resize = (e: MouseEvent) => {
    if (!resizingTarget || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();

    if (resizingTarget === "MENU") {
      // Logic kéo Menu Trái (Tăng khi kéo sang phải)
      const newWidth = e.clientX - containerRect.left;
      if (newWidth > 60 && newWidth < 500) {
        setMenuWidth(newWidth);
        // Tự động toggle trạng thái mở rộng
        if (newWidth < 100 && isExpanded) onToggleMenu();
        else if (newWidth > 100 && !isExpanded) onToggleMenu();
      }
    } else if (resizingTarget === "DETAILS") {
      // Logic kéo Details Phải (Tăng khi kéo sang trái)
      // Width = RightEdge - MouseX
      const newWidth = containerRect.right - e.clientX;
      // Giới hạn min 250px, max 600px
      if (newWidth > 250 && newWidth < 600) {
        setDetailsWidth(newWidth);
      }
    }
  };

  useEffect(() => {
    if (resizingTarget) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resizingTarget, isExpanded]);

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-gray-900 font-sans text-gray-100"
      ref={containerRef}
    >
      {/* --- MODULE 1: LEFT SIDEBAR (RESIZABLE) --- */}
      <div className="flex h-full flex-shrink-0 relative group z-30">
        <MainMenu
          accountInfo={accountInfo}
          onCopyToken={onCopyToken}
          isCopying={isCopying}
          isExpanded={isExpanded}
          onToggleMenu={onToggleMenu}
          onLogout={onLogout}
          onFetchAccountInfo={onFetchAccountInfo}
          isLoadingAccountInfo={isLoadingAccountInfo}
          currentView={currentView}
          onChangeView={onChangeView}
          customWidth={actualMenuWidth}
        />
        {/* Drag Handle Left */}
        <div
          className={`w-1.5 h-full cursor-col-resize absolute right-[-3px] top-0 z-[100] transition-colors duration-200 
            ${
              resizingTarget === "MENU"
                ? "bg-blue-500"
                : "bg-transparent hover:bg-blue-500/50"
            }`}
          onMouseDown={startResizingMenu}
          title="Kéo để chỉnh kích thước Menu"
        />
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex flex-1 overflow-hidden bg-gray-800 relative">
        {currentView === "chat" ? (
          <>
            {/* Module 2: Conversation List (Fixed width for now, or flexible if needed) */}
            <ConversationList
              threads={filteredThreads}
              selectedThread={selectedThread}
              onSelectThread={onSelectThread}
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              onFetchThreads={onFetchThreads}
              isLoadingThreads={isLoadingThreads}
            />

            {/* Module 3: Main Chat Frame */}
            <ChatFrame
              thread={selectedThread}
              messages={messages}
              onSendMessage={onSendMessage}
              onToggleDetails={onToggleDetails}
              isEchoBotEnabled={isEchoBotEnabled}
              onToggleEchoBot={onToggleEchoBot}
              onSendVocabulary={onSendVocabulary}
              isSendingMessage={isSendingMessage}
              isSendingVocab={isSendingVocab}
              onSetError={onSetError}
              userCache={userCache}
            />

            {/* Module 4: Details Panel (Conditional) */}
            {isDetailsPanelOpen && (
              <div className="flex h-full flex-shrink-0 relative z-20">
                {/* Drag Handle Right (Nằm bên trái của panel này) */}
                <div
                  className={`w-1.5 h-full cursor-col-resize absolute left-[-3px] top-0 z-[100] transition-colors duration-200 
                    ${
                      resizingTarget === "DETAILS"
                        ? "bg-blue-500"
                        : "bg-transparent hover:bg-blue-500/50"
                    }`}
                  onMouseDown={startResizingDetails}
                  title="Kéo để chỉnh kích thước Panel Chi tiết"
                />

                <DetailsPanel
                  thread={threadForDetails}
                  onClose={() => onToggleDetails()}
                  onRefreshThreads={onRefreshThreads}
                  onClearSelectedThread={onClearSelectedThread}
                  threads={threads}
                  customWidth={detailsWidth} // [NEW]
                />
              </div>
            )}
          </>
        ) : (
          // Chế độ Quản lý
          <div className="flex-1 h-full overflow-hidden">
            <ManagementPanel
              selectedThread={selectedThread}
              threads={threads}
              onRefreshThreads={onRefreshThreads}
              userCache={userCache}
              onStartManualScan={onStartManualScan}
              isScanningAll={isScanningAll}
              scanStatus={scanStatus}
            />
          </div>
        )}

        {/* Hiển thị lỗi (nếu có) */}
        {errorMessage && (
          <div className="absolute bottom-4 right-4 z-50 max-w-sm rounded-lg bg-red-900/90 border border-red-700 p-4 text-red-100 shadow-2xl animate-fade-in-up backdrop-blur-sm">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1">
                <strong className="block font-bold mb-1 text-red-300">
                  Lỗi:
                </strong>
                <span className="text-sm">{errorMessage}</span>
              </div>
              <button
                onClick={onClearError}
                className="flex-shrink-0 -mt-1 -mr-1 p-1 hover:bg-red-800 rounded-full"
              >
                &times;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
