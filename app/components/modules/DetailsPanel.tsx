/**
 * app/components/modules/DetailsPanel.tsx
 *
 * Module 4: Cột chi tiết hội thoại (Sidebar phải)
 */
import { useState } from "react";
import { ThreadInfo, UserProfile } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
// THÊM MỚI: Icons và Actions
import {
  IconClose,
  IconUserMinus,
  IconLogout,
  IconInfo,
  IconCog,
} from "@/app/components/ui/Icons";
import {
  removeFriendAction,
  getUserInfoAction,
} from "@/lib/actions/friend.actions";
import { leaveGroupAction } from "@/lib/actions/group.actions";
// Import Group Manager
import { AdvancedGroupManager } from "./AdvancedGroupManager";
// IMPORT MỚI
import {
  getRawUserInfoAction,
  getRawGroupInfoAction,
} from "@/lib/actions/debug.actions";
import { JsonViewerModal } from "@/app/components/ui/JsonViewerModal";

export function DetailsPanel({
  thread,
  onClose,
  onRefreshThreads,
  onClearSelectedThread,
  // Cần danh sách thread đầy đủ để truyền vào GroupManager (cho tính năng add member)
  threads,
  // [NEW PROP]
  customWidth,
}: {
  thread: ThreadInfo | null;
  onClose: () => void;
  // THÊM MỚI (GĐ 3.4)
  onRefreshThreads: () => void;
  onClearSelectedThread: () => void;
  threads: ThreadInfo[];
  customWidth?: number;
}) {
  // THÊM MỚI (GĐ 3.4): State cho các nút hành động
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // State cho Inspect
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inspectData, setInspectData] = useState<any>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  if (!thread) return null;

  // --- THÊM MỚI (GĐ 3.4): Hàm xử lý hành động ---

  const handleRemoveFriend = async () => {
    if (!thread || thread.type !== 0 || isActionLoading) return;
    if (
      !window.confirm(`Bạn có chắc chắn muốn HỦY KẾT BẠN với "${thread.name}"?`)
    )
      return;

    setIsActionLoading(true);
    setActionError(null);
    try {
      await removeFriendAction(thread.id);
      // Thành công: Đóng panel và làm mới danh sách
      onClearSelectedThread();
      onRefreshThreads();
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : "Lỗi không xác định",
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!thread || thread.type !== 1 || isActionLoading) return;
    if (
      !window.confirm(`Bạn có chắc chắn muốn RỜI KHỎI NHÓM "${thread.name}"?`)
    )
      return;

    setIsActionLoading(true);
    setActionError(null);
    try {
      await leaveGroupAction(thread.id);
      // Thành công: Đóng panel và làm mới danh sách
      onClearSelectedThread();
      onRefreshThreads();
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : "Lỗi không xác định",
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handler Inspect User
  const handleInspect = async () => {
    if (isInspecting) return;
    setIsInspecting(true);
    setActionError(null);

    try {
      let data;
      if (thread.type === 1) {
        // Inspect Group
        data = await getRawGroupInfoAction(thread.id);
      } else {
        // Inspect User (Friend or Stranger)
        data = await getRawUserInfoAction(thread.id);
      }
      setInspectData(data);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Lỗi Inspect");
    } finally {
      setIsInspecting(false);
    }
  };

  return (
    <>
      {/* Modal JSON Viewer */}
      {inspectData && (
        <JsonViewerModal
          title={`${thread.name} (${thread.id})`}
          data={inspectData}
          onClose={() => setInspectData(null)}
        />
      )}

      <div
        className="flex h-full flex-col border-l border-gray-700 bg-gray-800 shadow-xl z-20 flex-shrink-0 transition-all duration-75"
        // [UX UPGRADE] Sử dụng style inline cho width, fallback về w-80 (320px) nếu không có props
        style={{ width: customWidth ? `${customWidth}px` : "20rem" }}
      >
        <header className="flex h-[72px] items-center justify-between border-b border-gray-700 p-4">
          <h2 className="text-lg font-bold text-white truncate">Chi tiết</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <IconClose className="h-6 w-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 1. Thông tin Cơ bản */}
          <div className="flex flex-col items-center">
            <Avatar
              src={thread.avatar}
              alt={thread.name}
              isGroup={thread.type === 1}
            />
            <h3 className="mt-4 text-xl font-bold text-center break-words w-full">
              {thread.name}
            </h3>
            <p className="text-sm text-gray-400">
              {thread.type === 1 ? "Nhóm" : "Bạn bè"}
            </p>

            <div className="mt-2 w-full px-2">
              <input
                type="text"
                readOnly
                value={thread.id}
                className="w-full select-all rounded-md border border-gray-600 bg-gray-700 p-1.5 text-center font-mono text-xs text-gray-300 focus:outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
          </div>

          {/* 2. Inspector (Updated: Dùng Modal, hỗ trợ cả Group) */}
          <div className="rounded-lg bg-gray-900/50 p-3 border border-gray-700">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                <IconInfo className="h-4 w-4" /> Raw Data
              </h4>
              <button
                onClick={handleInspect}
                disabled={isInspecting}
                className="text-xs bg-blue-600 px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 font-mono"
              >
                {isInspecting ? "Loading..." : "{ JSON }"}
              </button>
            </div>
            {/* Xóa phần hiển thị JSON thô cũ (text-xs font-mono...) để dùng Modal */}
          </div>

          {/* 3. Advanced Group Manager (Chỉ hiện nếu là Group) */}
          {thread.type === 1 && (
            <div className="border-t border-gray-700 pt-4">
              <AdvancedGroupManager selectedThread={thread} threads={threads} />
            </div>
          )}

          {/* 4. Actions Cơ bản */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="mb-3 font-semibold text-gray-300">Vùng Nguy Hiểm</h4>

            {thread.type === 1 ? (
              <button
                onClick={handleLeaveGroup}
                disabled={isActionLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-900/50 border border-red-700 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900 disabled:opacity-50"
              >
                <IconLogout className="h-5 w-5" />
                {isActionLoading ? "..." : "Rời nhóm"}
              </button>
            ) : (
              <button
                onClick={handleRemoveFriend}
                disabled={isActionLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-900/50 border border-red-700 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900 disabled:opacity-50"
              >
                <IconUserMinus className="h-5 w-5" />
                {isActionLoading ? "..." : "Hủy kết bạn"}
              </button>
            )}
            {actionError && (
              <p className="mt-2 text-center text-xs text-red-400">
                {actionError}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
