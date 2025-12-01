"use client";

/**
 * app/components/modules/AdvancedGroupManager.tsx
 *
 * (GĐ 3.9) Component con cho ManagementPanel.
 * Cung cấp UI để quản lý Nhóm Nâng cao (Link mời, Chờ duyệt).
 * Yêu cầu 'selectedThread' (một nhóm) từ BotInterface.
 */

import {
  ThreadInfo,
  GetGroupLinkDetailResponse,
  GetPendingGroupMembersResponse,
  // SỬA LỖI: Thêm GroupMemberProfile
  GroupMemberProfile,
} from "@/lib/types/zalo.types";
import {
  IconCheck,
  IconClock,
  IconClose,
  IconCog,
  IconLink,
  IconRefresh,
  IconUserMinus,
  IconUserPlus,
} from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  disableGroupLinkAction,
  enableGroupLinkAction,
  getGroupLinkDetailAction,
  getPendingGroupMembersAction,
  reviewPendingMemberRequestAction,
  getGroupInfoAction,
  getGroupMembersInfoAction,
  removeUserFromGroupAction,
  addUserToGroupAction,
} from "@/lib/actions/group.actions";
const IconLockClosed = ({ className }: { className: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3A5.25 5.25 0 0012 1.5zm-3.75 5.25a3.75 3.75 0 017.5 0v3h-7.5v-3z"
      clipRule="evenodd"
    />
  </svg>
);

// Component hiển thị lỗi Quyền
const PermissionDeniedMessage = ({ message }: { message: string }) => (
  <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-700 bg-yellow-900/50 p-3 text-sm text-yellow-300">
    <IconLockClosed className="h-5 w-5 flex-shrink-0" />
    <span className="flex-1">{message}</span>
  </div>
);

// --- Component 1: Quản lý Link mời ---
function ManageLinkPanel({ thread }: { thread: ThreadInfo }) {
  const [linkDetail, setLinkDetail] =
    useState<GetGroupLinkDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLinkDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await getGroupLinkDetailAction(thread.id);
      setLinkDetail(detail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setIsLoading(false);
    }
  }, [thread.id]);

  useEffect(() => {
    fetchLinkDetail();
  }, [fetchLinkDetail]);

  const handleToggleLink = async (enable: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (enable) {
        const detail = await enableGroupLinkAction(thread.id);
        setLinkDetail(detail);
      } else {
        await disableGroupLinkAction(thread.id);
        setLinkDetail((prev) =>
          prev ? { ...prev, enabled: 0, link: undefined } : null,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg bg-gray-900/50 p-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-200">
        <IconLink className="h-5 w-5" />
        Quản lý Link mời
      </h3>
      {isLoading && !linkDetail && (
        <p className="mt-2 text-sm text-gray-400">Đang tải...</p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {linkDetail && (
        <div className="mt-3 space-y-3">
          {linkDetail.enabled === 1 && linkDetail.link ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Link đang BẬT:
              </label>
              <input
                type="text"
                readOnly
                value={linkDetail.link}
                className="w-full select-all rounded-md border border-gray-600 bg-gray-800 p-2 font-mono text-xs text-green-300 focus:outline-none"
              />
              <button
                onClick={() => handleToggleLink(false)}
                disabled={isLoading}
                className="mt-2 w-full rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isLoading ? "Đang tắt..." : "Tắt Link"}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400">Link mời đang TẮT.</p>
              <button
                onClick={() => handleToggleLink(true)}
                disabled={isLoading}
                className="mt-2 w-full rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isLoading ? "Đang bật..." : "Bật Link"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Component 2: Quản lý Chờ duyệt ---
function ManagePendingPanel({ thread }: { thread: ThreadInfo }) {
  const [pending, setPending] = useState<GetPendingGroupMembersResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);

  const fetchPendingMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPermissionStatus(null); // Reset
    try {
      const data = await getPendingGroupMembersAction(thread.id);

      // [Logic Mới] Kiểm tra status trả về
      if (data.status === "PERMISSION_DENIED") {
        setPermissionStatus("PERMISSION_DENIED");
        setPending(null);
      } else if (data.status === "FEATURE_DISABLED") {
        setPermissionStatus("FEATURE_DISABLED");
        setPending(null);
      } else {
        setPending(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setIsLoading(false);
    }
  }, [thread.id]);

  useEffect(() => {
    fetchPendingMembers();
  }, [fetchPendingMembers]);

  // [UX IMPROVEMENT] Nếu không có quyền (PERMISSION_DENIED), ẩn hoàn toàn section này đi
  if (permissionStatus === "PERMISSION_DENIED") {
    return null;
  }

  const handleReview = async (memberId: string, isApprove: boolean) => {
    setIsProcessing((prev) => ({ ...prev, [memberId]: true }));
    try {
      await reviewPendingMemberRequestAction(
        { members: [memberId], isApprove },
        thread.id,
      );
      // Tải lại danh sách sau khi duyệt
      fetchPendingMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi duyệt thành viên");
    } finally {
      setIsProcessing((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  return (
    <div className="rounded-lg bg-gray-900/50 p-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-200">
        <IconClock className="h-5 w-5" />
        Thành viên chờ duyệt
      </h3>

      {/* Hiển thị thông báo dựa trên Status */}
      {permissionStatus === "FEATURE_DISABLED" ? (
        <div className="mt-2 p-2 text-sm text-gray-400 bg-gray-800/50 rounded border border-gray-700">
          Chức năng duyệt thành viên chưa được bật.
        </div>
      ) : (
        <>
          {/* Gói toàn bộ UI cũ vào trong <> ... </> */}
          <button
            onClick={fetchPendingMembers}
            disabled={isLoading}
            className="my-2 flex items-center justify-center gap-2 rounded-md bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-500 disabled:opacity-50"
          >
            <IconRefresh
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Làm mới
          </button>

          {isLoading && !pending && (
            <p className="mt-2 text-sm text-gray-400">Đang tải...</p>
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

          {pending && (
            <div className="mt-2 space-y-2">
              {!pending.users || pending.users.length === 0 ? (
                <p className="text-sm text-gray-400">Không có ai chờ duyệt.</p>
              ) : (
                pending.users.map((user) => (
                  <div
                    key={user.uid}
                    className="flex items-center gap-2 rounded-md bg-gray-800 p-2"
                  >
                    <img
                      src={user.avatar}
                      alt={user.dpn}
                      className="h-8 w-8 rounded-full"
                    />
                    <span className="flex-1 truncate text-sm text-gray-300">
                      {user.dpn}
                    </span>
                    <button
                      onClick={() => handleReview(user.uid, false)}
                      disabled={isProcessing[user.uid]}
                      title="Từ chối"
                      className="rounded-full bg-red-600 p-1 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleReview(user.uid, true)}
                      disabled={isProcessing[user.uid]}
                      title="Chấp nhận"
                      className="rounded-full bg-green-600 p-1 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <IconCheck className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ManageMembersPanel({
  thread,
  friendsList,
}: {
  thread: ThreadInfo;
  friendsList: ThreadInfo[];
}) {
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessingAdd, setIsProcessingAdd] = useState<
    Record<string, boolean>
  >({});
  const [isProcessingRemove, setIsProcessingRemove] = useState<
    Record<string, boolean>
  >({});

  const fetchGroupMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const groupInfo = await getGroupInfoAction(thread.id);
      const groupData = groupInfo.gridInfoMap?.[thread.id];
      if (!groupData?.memVerList) return;
      const memberProfiles = await getGroupMembersInfoAction(
        groupData.memVerList,
      );
      setMembers(Object.values(memberProfiles.profiles));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi tải thành viên");
    } finally {
      setIsLoading(false);
    }
  }, [thread.id]);

  useEffect(() => {
    fetchGroupMembers();
  }, [fetchGroupMembers]);

  // Lọc danh sách bạn bè (chưa có trong nhóm)
  const friendsToAdd = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return friendsList.filter(
      (f) =>
        f.type === 0 &&
        !memberIds.has(f.id) &&
        f.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [members, friendsList, searchTerm]);

  // Hành động: Thêm
  const handleAddMember = async (userId: string) => {
    setIsProcessingAdd((prev) => ({ ...prev, [userId]: true }));
    setError(null);
    try {
      await addUserToGroupAction([userId], thread.id);
      // Tải lại danh sách
      fetchGroupMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi thêm thành viên");
    } finally {
      setIsProcessingAdd((prev) => ({ ...prev, [userId]: false }));
    }
  };

  // Hành động: Xóa
  const handleRemoveMember = async (userId: string) => {
    setIsProcessingRemove((prev) => ({ ...prev, [userId]: true }));
    setError(null);
    try {
      await removeUserFromGroupAction([userId], thread.id);
      // Tải lại danh sách
      fetchGroupMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi xóa thành viên");
    } finally {
      setIsProcessingRemove((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="rounded-lg bg-gray-900/50 p-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-200">
        <IconUserPlus className="h-5 w-5" />
        Quản lý thành viên
      </h3>
      <button
        onClick={fetchGroupMembers}
        disabled={isLoading}
        className="my-2 flex items-center justify-center gap-2 rounded-md bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-500 disabled:opacity-50"
      >
        <IconRefresh className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        Làm mới
      </button>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {/* Phần 1: Thêm bạn vào nhóm */}
      <div className="mt-2">
        <h4 className="mb-2 text-sm font-medium text-gray-300">
          Thêm bạn bè vào nhóm
        </h4>
        <input
          type="text"
          placeholder="Tìm kiếm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-md border border-gray-600 bg-gray-800 p-2 text-sm text-white focus:outline-none"
        />
        <div className="mt-2 h-32 max-h-32 space-y-2 overflow-y-auto">
          {isLoading && <p className="text-sm text-gray-400">Đang tải...</p>}
          {!isLoading && friendsToAdd.length === 0 && (
            <p className="text-sm text-gray-500">
              {searchTerm ? "Không tìm thấy" : "Tất cả bạn bè đã ở trong nhóm."}
            </p>
          )}
          {friendsToAdd.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center gap-2 rounded-md bg-gray-800 p-2"
            >
              <Avatar src={friend.avatar} alt={friend.name} />
              <span className="flex-1 truncate text-sm text-gray-300">
                {friend.name}
              </span>
              <button
                onClick={() => handleAddMember(friend.id)}
                disabled={isProcessingAdd[friend.id]}
                className="rounded-md bg-blue-600 p-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isProcessingAdd[friend.id] ? "..." : "Thêm"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Phần 2: Thành viên hiện tại */}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-medium text-gray-300">
          Thành viên hiện tại ({members.length})
        </h4>
        <div className="h-32 max-h-32 space-y-2 overflow-y-auto">
          {isLoading && <p className="text-sm text-gray-400">Đang tải...</p>}
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2 rounded-md bg-gray-800 p-2"
            >
              <img
                src={member.avatar}
                alt={member.displayName}
                className="h-8 w-8 rounded-full"
              />
              <span className="flex-1 truncate text-sm text-gray-300">
                {member.displayName}
              </span>
              <button
                onClick={() => handleRemoveMember(member.id)}
                disabled={isProcessingRemove[member.id]}
                className="rounded-md bg-red-600 p-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isProcessingRemove[member.id] ? "..." : "Xóa"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Component Chính ---
export function AdvancedGroupManager({
  selectedThread,
  threads,
}: {
  selectedThread: ThreadInfo | null;
  threads: ThreadInfo[];
}) {
  return (
    <div className="rounded-lg bg-gray-800 p-4 shadow-lg">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-white">
        <IconCog className="h-6 w-6" />
        Quản lý Nhóm (Nâng cao)
      </h2>
      {!selectedThread || selectedThread.type !== 1 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-700">
          <p className="text-center text-gray-500">
            Vui lòng chọn một <span className="font-bold">Nhóm</span>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md bg-gray-700 p-3">
            <Avatar
              src={selectedThread.avatar}
              alt={selectedThread.name}
              isGroup
            />
            <div>
              <p className="text-xs text-gray-400">Đang quản lý:</p>
              <h3 className="font-semibold text-white">
                {selectedThread.name}
              </h3>
            </div>
          </div>
          <ManageLinkPanel thread={selectedThread} />
          <ManagePendingPanel thread={selectedThread} />
          <ManageMembersPanel thread={selectedThread} friendsList={threads} />
        </div>
      )}
    </div>
  );
}
