"use client";

import { useState, useEffect } from "react";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconClose,
  IconLogout,
  IconUserMinus,
  IconUsers,
} from "@/app/components/ui/Icons";
import {
  getGroupMembersAction,
  leaveGroupAction,
  removeFriendAction,
} from "@/lib/actions/thread.actions";

export function DetailsPanel({
  botId, // [NEW] Cần botId để thực thi hành động
  thread,
  onClose,
  onRefreshThreads,
  onClearSelectedThread,
  customWidth,
}: {
  botId: string | null;
  thread: ThreadInfo | null;
  onClose: () => void;
  onRefreshThreads: () => void;
  onClearSelectedThread: () => void;
  threads: ThreadInfo[];
  customWidth?: number;
}) {
  const [members, setMembers] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Load thành viên nếu là Group
  useEffect(() => {
    if (botId && thread?.type === 1) {
      setIsLoadingMembers(true);
      getGroupMembersAction(botId, thread.id)
        .then((data) => setMembers(data))
        .catch((e) => console.error(e))
        .finally(() => setIsLoadingMembers(false));
    } else {
      setMembers([]);
    }
  }, [botId, thread]);

  if (!thread || !botId) return null;

  // --- Actions ---
  const handleLeaveGroup = async () => {
    if (!confirm(`Rời khỏi nhóm "${thread.name}"?`)) return;
    setIsActionLoading(true);
    const res = await leaveGroupAction(botId, thread.id);
    if (res.success) {
      onClearSelectedThread();
      onRefreshThreads();
      onClose();
    } else {
      alert("Lỗi: " + res.error);
    }
    setIsActionLoading(false);
  };

  const handleRemoveFriend = async () => {
    if (!confirm(`Hủy kết bạn với "${thread.name}"?`)) return;
    setIsActionLoading(true);
    const res = await removeFriendAction(botId, thread.id);
    if (res.success) {
      onClearSelectedThread();
      onRefreshThreads();
      onClose();
    } else {
      alert("Lỗi: " + res.error);
    }
    setIsActionLoading(false);
  };

  return (
    <div
      className="flex h-full flex-col border-l border-gray-700 bg-gray-800 shadow-xl z-20 flex-shrink-0"
      style={{ width: customWidth ? `${customWidth}px` : "320px" }}
    >
      {/* Header */}
      <header className="flex h-[72px] items-center justify-between border-b border-gray-700 p-4">
        <h2 className="text-lg font-bold text-white">Chi tiết</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <IconClose className="h-6 w-6" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Info Card */}
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 mb-4">
            <Avatar
              src={thread.avatar}
              alt={thread.name}
              isGroup={thread.type === 1}
            />
          </div>
          <h3 className="text-xl font-bold text-center text-white">
            {thread.name}
          </h3>
          <p className="text-sm text-gray-400 mt-1">ID: {thread.id}</p>
        </div>

        {/* Members List (Group Only) */}
        {thread.type === 1 && (
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
            <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
              <IconUsers className="w-4 h-4" /> Thành viên (
              {members.length || "..."})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {isLoadingMembers ? (
                <p className="text-xs text-gray-500 text-center">Đang tải...</p>
              ) : (
                members.map((mem: any) => (
                  <div key={mem.userId} className="flex items-center gap-2">
                    <img
                      src={mem.avatar}
                      className="w-6 h-6 rounded-full"
                      alt=""
                    />
                    <span className="text-xs text-gray-300 truncate flex-1">
                      {mem.displayName}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="border-t border-gray-700 pt-4">
          {thread.type === 1 ? (
            <button
              onClick={handleLeaveGroup}
              disabled={isActionLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-900/20 border border-red-800 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/40 transition-colors"
            >
              <IconLogout className="h-4 w-4" />
              {isActionLoading ? "Đang xử lý..." : "Rời nhóm"}
            </button>
          ) : (
            <button
              onClick={handleRemoveFriend}
              disabled={isActionLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-900/20 border border-red-800 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/40 transition-colors"
            >
              <IconUserMinus className="h-4 w-4" />
              {isActionLoading ? "Đang xử lý..." : "Hủy kết bạn"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
