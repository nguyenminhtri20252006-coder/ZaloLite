/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/app/components/ui/Avatar";
import { staffLogoutAction } from "@/lib/actions/staff.actions";
import {
  IconMessage,
  IconRobot,
  IconUsers,
  IconChart,
  IconSettings,
  IconLogout,
  IconDatabase,
  IconBack, // Dùng tạm icon mũi tên để biểu thị thu gọn
  IconForward, // Dùng tạm icon mũi tên để biểu thị mở rộng
} from "@/app/components/ui/Icons";

interface MainMenuProps {
  staffInfo: {
    name: string;
    role: string;
    avatar?: string;
  } | null;
  // [CLEANUP] Loại bỏ các props điều khiển từ Server Component để tránh lỗi serialization
  // Tự quản lý state hiển thị bên trong component này
}

export function MainMenu({ staffInfo }: MainMenuProps) {
  const pathname = usePathname();

  // [LOGIC MOVED] State tự quản lý việc đóng mở menu
  const [isExpanded, setIsExpanded] = useState(false);

  // Xác định active menu dựa trên URL
  const isActive = (path: string) => pathname.startsWith(path);

  const menuItems = [
    { id: "chat", label: "Live Chat", icon: IconMessage, path: "/chat_live" },
    {
      id: "manage",
      label: "Quản lý Bot",
      icon: IconRobot,
      path: "/bot-manager",
    },
    { id: "crm", label: "Khách hàng", icon: IconDatabase, path: "/crm" },
    { id: "dashboard", label: "Thống kê", icon: IconChart, path: "/dashboard" },
  ];

  if (staffInfo?.role === "admin") {
    menuItems.push({
      id: "staff",
      label: "Nhân sự",
      icon: IconUsers,
      path: "/staff-manager",
    });
  }

  // Width tính toán dựa trên state nội bộ
  const currentWidth = isExpanded ? 240 : 64;

  return (
    <div
      className="flex flex-col h-full bg-gray-900 text-gray-400 select-none overflow-hidden transition-all duration-300 border-r border-gray-800"
      style={{ width: currentWidth }}
    >
      {/* 1. User Info (Top) */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-3 h-[70px] bg-gray-900/50">
        <div className="relative group cursor-pointer shrink-0">
          <Avatar
            src={staffInfo?.avatar || ""}
            alt={staffInfo?.name || "U"}
            size="md"
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900"></div>
        </div>

        {isExpanded && (
          <div className="flex-1 min-w-0 overflow-hidden animate-fade-in delay-100">
            <h3 className="font-bold text-white truncate text-sm">
              {staffInfo?.name}
            </h3>
            <p className="text-xs text-gray-500 truncate capitalize">
              {staffInfo?.role}
            </p>
          </div>
        )}
      </div>

      {/* 2. Menu Items */}
      <div className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.id}
              href={item.path}
              className={`flex items-center px-4 py-3 mx-2 rounded-lg transition-all group relative
                ${
                  active
                    ? "bg-blue-600/10 text-blue-400"
                    : "hover:bg-gray-800 hover:text-white"
                }
              `}
              title={item.label}
            >
              <item.icon
                className={`w-6 h-6 shrink-0 ${
                  active ? "text-blue-400" : "group-hover:text-white"
                }`}
              />

              {isExpanded && (
                <span className="ml-3 font-medium text-sm truncate animate-fade-in">
                  {item.label}
                </span>
              )}

              {/* Active Indicator Bar */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r"></div>
              )}
            </Link>
          );
        })}
      </div>

      {/* 3. Footer Actions */}
      <div className="p-4 border-t border-gray-800 flex flex-col gap-2 bg-gray-900/50">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors w-full group text-gray-500"
          title={isExpanded ? "Thu gọn" : "Mở rộng"}
        >
          {isExpanded ? (
            <IconBack className="w-5 h-5 shrink-0" />
          ) : (
            <IconForward className="w-5 h-5 shrink-0" />
          )}
          {isExpanded && (
            <span className="ml-3 text-sm font-medium">Thu gọn</span>
          )}
        </button>

        <form action={staffLogoutAction}>
          <button
            type="submit"
            className="flex items-center px-2 py-2 rounded-lg hover:bg-red-900/20 hover:text-red-400 transition-colors w-full group text-gray-500"
            title="Đăng xuất"
          >
            <IconLogout className="w-5 h-5 shrink-0" />
            {isExpanded && (
              <span className="ml-3 text-sm font-medium">Đăng xuất</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
