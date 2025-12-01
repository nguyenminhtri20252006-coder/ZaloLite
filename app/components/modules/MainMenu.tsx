/**
 * app/components/modules/MainMenu.tsx
 *
 * Module 1: Menu chính (Sidebar trái)
 */
import { ReactNode } from "react"; // THÊM MỚI
import { AccountInfo, ViewState } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconUser,
  IconRefresh,
  IconLogout,
  IconMenuToggle,
  IconChatBubble,
  IconCog,
} from "@/app/components/ui/Icons";

// THÊM MỚI: Component TabButton
const TabButton = ({
  icon: Icon,
  label,
  isActive,
  onClick,
  isExpanded,
}: {
  icon: (props: { className: string }) => ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isExpanded: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm transition-all duration-200 ${
      isActive
        ? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
    }`}
    title={label}
  >
    <Icon
      className={`h-6 w-6 flex-shrink-0 ${
        isActive ? "text-white" : "text-gray-400"
      }`}
    />
    {/* CSS transition cho opacity để mượt mà hơn khi resize */}
    <span
      className={`flex-1 font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${
        isExpanded ? "opacity-100" : "opacity-0 w-0"
      }`}
    >
      {label}
    </span>
  </button>
);

// THÊM MỚI: Component ActionButton (cho các nút phụ)
const ActionButton = ({
  icon: Icon,
  label,
  onClick,
  isExpanded,
  isLoading = false,
  isDestructive = false,
}: {
  icon: (props: { className: string }) => ReactNode;
  label: string;
  onClick: () => void;
  isExpanded: boolean;
  isLoading?: boolean;
  isDestructive?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={isLoading}
    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm transition-colors disabled:cursor-wait disabled:opacity-50 ${
      isDestructive
        ? "text-red-400 hover:bg-red-900/30 hover:text-red-300"
        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
    }`}
    title={label}
  >
    <Icon
      className={`h-6 w-6 flex-shrink-0 ${isLoading ? "animate-spin" : ""}`}
    />
    <span
      className={`flex-1 whitespace-nowrap overflow-hidden transition-opacity duration-200 ${
        isExpanded ? "opacity-100" : "opacity-0 w-0"
      }`}
    >
      {label}
    </span>
  </button>
);

export function MainMenu({
  accountInfo,
  onCopyToken,
  isCopying,
  isExpanded,
  onToggleMenu,
  onLogout,
  onFetchAccountInfo,
  isLoadingAccountInfo,
  currentView,
  onChangeView,
  // [NEW PROP]
  customWidth,
}: {
  accountInfo: AccountInfo | null;
  onCopyToken: () => void;
  isCopying: boolean;
  isExpanded: boolean;
  onToggleMenu: () => void;
  onLogout: () => void;
  onFetchAccountInfo: () => void;
  isLoadingAccountInfo: boolean;
  // THÊM MỚI
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  customWidth?: number;
}) {
  return (
    <div
      className="flex h-full flex-col bg-gray-900 border-r border-gray-800 py-4 flex-shrink-0 overflow-hidden relative"
      style={{ width: customWidth ? `${customWidth}px` : undefined }} // Dùng inline style cho width
    >
      {/* 1. Profile */}
      <div
        className={`flex items-center gap-3 px-3 mb-6 ${
          !isExpanded ? "justify-center" : ""
        }`}
      >
        <div className="shrink-0">
          {accountInfo ? (
            <Avatar src={accountInfo.avatar} alt={accountInfo.displayName} />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 border border-gray-700">
              <IconUser className="h-6 w-6 text-gray-500" />
            </div>
          )}
        </div>

        <div
          className={`flex-1 overflow-hidden transition-opacity duration-200 ${
            isExpanded ? "opacity-100" : "opacity-0 w-0 hidden"
          }`}
        >
          {accountInfo && (
            <>
              <h3 className="truncate font-bold text-white text-sm">
                {accountInfo.displayName}
              </h3>
              <p className="truncate text-xs text-gray-500 font-mono">
                {accountInfo.userId}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 2. Main Navigation */}
      <div className="flex-1 space-y-2 px-3 overflow-y-auto scrollbar-thin">
        <TabButton
          icon={IconChatBubble}
          label="Trò chuyện"
          isActive={currentView === "chat"}
          onClick={() => onChangeView("chat")}
          isExpanded={isExpanded}
        />
        <TabButton
          icon={IconCog}
          label="Quản lý & Hệ thống"
          isActive={currentView === "manage"}
          onClick={() => onChangeView("manage")}
          isExpanded={isExpanded}
        />
      </div>

      {/* 3. Footer Actions */}
      <div className="mt-auto px-3 pt-4 border-t border-gray-800 space-y-1">
        <ActionButton
          icon={IconRefresh}
          label={isLoadingAccountInfo ? "Đang tải..." : "Reload Info"}
          onClick={onFetchAccountInfo}
          isExpanded={isExpanded}
          isLoading={isLoadingAccountInfo}
        />
        <ActionButton
          icon={(props) => (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={props.className}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.438-3.43-8.161-7.759-8.404a.75.75 0 00-.517.22c-.114.113-.223.238-.323.364M11.25 12.75H9v-2.625M11.25 12.75c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H9v-2.25c0-.621.504-1.125 1.125-1.125z"
              />
            </svg>
          )}
          label={isCopying ? "Đang copy..." : "Copy Token"}
          onClick={onCopyToken}
          isExpanded={isExpanded}
          isLoading={isCopying}
        />

        <div className="my-2 border-t border-gray-800" />

        <ActionButton
          icon={IconLogout}
          label="Đăng xuất"
          onClick={onLogout}
          isExpanded={isExpanded}
          isDestructive={true}
        />

        {/* Toggle Button */}
        <button
          onClick={onToggleMenu}
          className="flex w-full items-center justify-center gap-3 rounded-lg p-3 text-gray-500 hover:text-white hover:bg-gray-800 transition-colors mt-2"
          title={isExpanded ? "Thu gọn" : "Mở rộng"}
        >
          <IconMenuToggle
            className={`h-6 w-6 transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
            }`}
            isExpanded={isExpanded}
          />
        </button>
      </div>
    </div>
  );
}
