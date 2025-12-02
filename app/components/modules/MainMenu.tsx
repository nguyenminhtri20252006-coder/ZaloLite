"use client";

import { ReactNode } from "react";
import { ViewState } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconUser,
  IconLogout,
  IconMenuToggle,
  IconChatBubble,
  IconCog,
  IconUsers,
} from "@/app/components/ui/Icons";
import { staffLogoutAction } from "@/lib/actions/staff.actions";

// Icon Robot (cho Bot Manager)
const IconRobot = ({ className }: { className: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm4.5 7.5a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-2.25a.75.75 0 01.75-.75zm9 0a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-2.25a.75.75 0 01.75-.75zM9 13.5a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-2.25a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-2.25a.75.75 0 01.75-.75z"
      clipRule="evenodd"
    />
    <path d="M12 9a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H12.75a.75.75 0 01-.75-.75V9z" />
  </svg>
);

// Component TabButton
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
    <span
      className={`flex-1 font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${
        isExpanded ? "opacity-100" : "opacity-0 w-0"
      }`}
    >
      {label}
    </span>
  </button>
);

// Component ActionButton
const ActionButton = ({
  icon: Icon,
  label,
  onClick,
  isExpanded,
  isDestructive = false,
}: {
  icon: (props: { className: string }) => ReactNode;
  label: string;
  onClick: () => void;
  isExpanded: boolean;
  isDestructive?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm transition-colors ${
      isDestructive
        ? "text-red-400 hover:bg-red-900/30 hover:text-red-300"
        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
    }`}
    title={label}
  >
    <Icon className="h-6 w-6 flex-shrink-0" />
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
  staffInfo, // Thay thế accountInfo
  isExpanded,
  onToggleMenu,
  currentView,
  onChangeView,
  customWidth,
}: {
  staffInfo: { name: string; role: string; username: string } | null;
  isExpanded: boolean;
  onToggleMenu: () => void;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  customWidth?: number;
}) {
  const handleLogout = async () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
      await staffLogoutAction();
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-gray-900 border-r border-gray-800 py-4 flex-shrink-0 overflow-hidden relative"
      style={{ width: customWidth ? `${customWidth}px` : undefined }}
    >
      {/* 1. Staff Profile */}
      <div
        className={`flex items-center gap-3 px-3 mb-6 ${
          !isExpanded ? "justify-center" : ""
        }`}
      >
        <div className="shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-900/50 border border-blue-700 text-blue-200 font-bold">
            {staffInfo?.username?.substring(0, 2).toUpperCase() || "AD"}
          </div>
        </div>

        <div
          className={`flex-1 overflow-hidden transition-opacity duration-200 ${
            isExpanded ? "opacity-100" : "opacity-0 w-0 hidden"
          }`}
        >
          {staffInfo ? (
            <>
              <h3 className="truncate font-bold text-white text-sm">
                {staffInfo.name}
              </h3>
              <p className="truncate text-xs text-gray-500 font-mono uppercase">
                {staffInfo.role}
              </p>
            </>
          ) : (
            <div className="h-8 w-24 bg-gray-800 rounded animate-pulse" />
          )}
        </div>
      </div>

      {/* 2. Navigation */}
      <div className="flex-1 space-y-2 px-3 overflow-y-auto scrollbar-thin">
        <TabButton
          icon={IconRobot}
          label="Quản lý Bot System"
          isActive={currentView === "manage"}
          onClick={() => onChangeView("manage")}
          isExpanded={isExpanded}
        />

        <TabButton
          icon={IconChatBubble}
          label="Live Chat (CRM)"
          isActive={currentView === "chat"}
          onClick={() => onChangeView("chat")}
          isExpanded={isExpanded}
        />
      </div>

      {/* 3. Footer */}
      <div className="mt-auto px-3 pt-4 border-t border-gray-800 space-y-1">
        <ActionButton
          icon={IconLogout}
          label="Đăng xuất"
          onClick={handleLogout}
          isExpanded={isExpanded}
          isDestructive={true}
        />

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
