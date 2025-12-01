"use client";

/**
 * app/components/modules/ManagementPanel.tsx
 * Giao diện chính cho Tab "Quản lý".
 * CẬP NHẬT (GĐ 3.5): Thêm component con AddFriendPanel.
 */

import { useState, useEffect } from "react"; // SỬA ĐỔI: Thêm useEffect
// SỬA ĐỔI (GĐ 3.6): Import thêm actions và types
import {
  findUserAction,
  sendFriendRequestAction,
  getFriendRecommendationsAction,
  getSentFriendRequestAction,
  acceptFriendRequestAction,
  undoFriendRequestAction,
} from "@/lib/actions/friend.actions";
import { createGroupAction } from "@/lib/actions/group.actions";
import {
  FindUserResponse,
  FriendRecommendationsRecommItem,
  SentFriendRequestInfo,
  ThreadInfo,
  UserCacheEntry,
  GetFriendRecommendationsResponse,
  GetSentFriendRequestResponse,
} from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
// SỬA ĐỔI (GĐ 3.6): Import thêm icons
import {
  IconSearch,
  IconUserPlus,
  IconRefresh,
  IconCheck,
  IconClose,
  IconUsers, // [FIX] Đã thêm import
} from "@/app/components/ui/Icons";
import { UserDatabasePanel } from "./UserDatabasePanel";

// --- CÁC SUB-COMPONENTS (Giữ nguyên logic, chỉ update import) ---

function AddFriendPanel() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [friendRequestMessage, setFriendRequestMessage] = useState("");
  const [foundUser, setFoundUser] = useState<FindUserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSearchUser = async () => {
    if (!phoneNumber) {
      setError("Vui lòng nhập số điện thoại.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setFoundUser(null);
    setFriendRequestMessage("");
    try {
      const result = await findUserAction(phoneNumber);
      if (!result || !result.uid) {
        throw new Error("Không tìm thấy người dùng với số điện thoại này.");
      }
      setFoundUser(result);
    } catch (err: unknown) {
      // [FIX] Xử lý lỗi 'unknown' thay vì 'any'
      const msg =
        err instanceof Error ? err.message : "Lỗi tìm kiếm không xác định";
      setError(`Lỗi tìm kiếm: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!foundUser || !friendRequestMessage) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await sendFriendRequestAction(friendRequestMessage, foundUser.uid);
      setSuccess(`Đã gửi lời mời kết bạn đến ${foundUser.display_name}.`);
      setFoundUser(null);
      setPhoneNumber("");
      setFriendRequestMessage("");
    } catch (err: unknown) {
      // [FIX] Xử lý lỗi 'unknown'
      const msg = err instanceof Error ? err.message : "Lỗi gửi lời mời";
      setError(`Lỗi gửi lời mời: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg bg-gray-800 p-4 shadow-lg h-full border border-gray-700">
      <h2 className="mb-3 text-xl font-semibold text-white">
        Kết bạn (Qua SĐT)
      </h2>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Nhập SĐT người dùng..."
            className="flex-1 rounded-lg border border-gray-600 bg-gray-700 py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSearchUser}
            disabled={isLoading || !phoneNumber}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-4 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <IconSearch className="h-5 w-5" />
          </button>
        </div>

        {isLoading && !foundUser && (
          <p className="text-sm text-yellow-400">Đang tìm kiếm...</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">{success}</p>}
        {foundUser && (
          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
            <div className="flex items-center gap-3">
              <Avatar src={foundUser.avatar} alt={foundUser.display_name} />
              <div className="flex-1">
                <h3 className="font-semibold text-white">
                  {foundUser.display_name}
                </h3>
                <p className="font-mono text-xs text-gray-400">
                  {foundUser.uid}
                </p>
              </div>
            </div>
            <textarea
              value={friendRequestMessage}
              onChange={(e) => setFriendRequestMessage(e.target.value)}
              placeholder="Lời nhắn kết bạn..."
              rows={2}
              className="mt-3 w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendRequest}
              disabled={isLoading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <IconUserPlus className="h-5 w-5" />
              {isLoading ? "Đang gửi..." : "Gửi lời mời"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
/**
 * THÊM MỚI (GĐ 3.6): Component con Quản lý Lời mời
 */
function FriendRequestManager() {
  const [tab, setTab] = useState<"recommended" | "sent">("recommended");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State giữ data
  const [recommendations, setRecommendations] = useState<
    FriendRecommendationsRecommItem[]
  >([]);
  const [sentRequests, setSentRequests] = useState<SentFriendRequestInfo[]>([]);
  // State loading cho từng item
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const handleFetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [recommResult, sentResult] = await Promise.all([
        getFriendRecommendationsAction(),
        getSentFriendRequestAction(),
      ]);

      // Ép kiểu an toàn hoặc kiểm tra dữ liệu
      if (recommResult && Array.isArray(recommResult.recommItems)) {
        setRecommendations(recommResult.recommItems);
      }

      // sentResult có thể là object { userId: info }, cần chuyển thành mảng
      if (sentResult) {
        setSentRequests(Object.values(sentResult));
      }
    } catch (err: unknown) {
      // [FIX] Xử lý lỗi 'unknown'
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setError(`Lỗi tải danh sách: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleFetchData();
  }, []);

  const handleAcceptRequest = async (userId: string) => {
    if (loadingActionId) return;
    setLoadingActionId(userId);
    try {
      await acceptFriendRequestAction(userId);
      handleFetchData();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleUndoRequest = async (userId: string) => {
    if (loadingActionId) return;
    setLoadingActionId(userId);
    try {
      await undoFriendRequestAction(userId);
      // Tải lại data sau khi thành công
      handleFetchData();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div className="rounded-lg bg-gray-800 p-4 shadow-lg h-full border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-white">Quản lý Lời mời</h2>
        <button
          onClick={handleFetchData}
          disabled={isLoading}
          className="text-gray-400 hover:text-white"
        >
          <IconRefresh
            className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* --- Tabs --- */}
      <div className="mb-3 flex rounded-lg bg-gray-700 p-1">
        <button
          onClick={() => setTab("recommended")}
          className={`w-1/2 rounded-md py-2 text-xs font-medium transition-colors ${
            tab === "recommended"
              ? "bg-blue-600 text-white"
              : "text-gray-300 hover:bg-gray-600"
          }`}
        >
          Gợi ý ({recommendations.length})
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`w-1/2 rounded-md py-2 text-xs font-medium transition-colors ${
            tab === "sent"
              ? "bg-blue-600 text-white"
              : "text-gray-300 hover:bg-gray-600"
          }`}
        >
          Đã gửi ({sentRequests.length})
        </button>
      </div>

      {error && (
        <p className="text-center text-xs text-red-400 mb-2">{error}</p>
      )}

      <div className="flex flex-col gap-2 overflow-y-auto h-64 pr-1">
        {tab === "recommended" ? (
          recommendations.length === 0 ? (
            <p className="text-center text-xs text-gray-500 mt-4">
              Không có gợi ý kết bạn.
            </p>
          ) : (
            recommendations.map((item) => (
              <div
                key={item.dataInfo.userId}
                className="flex items-center gap-2 rounded-lg bg-gray-700/50 p-2"
              >
                <Avatar
                  src={item.dataInfo.avatar}
                  alt={item.dataInfo.displayName}
                />
                <div className="flex-1 overflow-hidden">
                  <h4 className="truncate text-sm font-medium text-white">
                    {item.dataInfo.displayName}
                  </h4>
                  <p className="truncate text-xs text-gray-400">
                    {item.dataInfo.recommInfo.message}
                  </p>
                </div>
                <button
                  onClick={() => handleAcceptRequest(item.dataInfo.userId)}
                  disabled={!!loadingActionId}
                  className="rounded-lg bg-green-600 p-1.5 text-white hover:bg-green-700"
                >
                  <IconCheck className="h-4 w-4" />
                </button>
              </div>
            ))
          )
        ) : sentRequests.length === 0 ? (
          <p className="text-center text-xs text-gray-500 mt-4">
            Chưa gửi lời mời nào.
          </p>
        ) : (
          sentRequests.map((req) => (
            <div
              key={req.userId}
              className="flex items-center gap-2 rounded-lg bg-gray-700/50 p-2"
            >
              <Avatar src={req.avatar} alt={req.displayName} />
              <div className="flex-1 overflow-hidden">
                <h4 className="truncate text-sm font-medium text-white">
                  {req.displayName}
                </h4>
                <p className="truncate text-xs text-gray-400 italic">
                  &quote{req.fReqInfo.message}&quote
                </p>
              </div>
              <button
                onClick={() => handleUndoRequest(req.userId)}
                disabled={!!loadingActionId}
                className="rounded-lg bg-gray-600 p-1.5 text-white hover:bg-gray-500"
                title="Thu hồi"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
/**
 * THÊM MỚI (GĐ 3.7): Component con Tạo Nhóm
 */
function CreateGroupPanel({
  friendsList,
  onGroupCreated,
}: {
  friendsList: ThreadInfo[];
  onGroupCreated: () => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleToggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!groupName || selectedMemberIds.length === 0) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await createGroupAction({
        name: groupName,
        members: selectedMemberIds,
      });
      setSuccess(`Tạo nhóm "${groupName}" thành công!`);
      setGroupName("");
      setSelectedMemberIds([]);
      onGroupCreated();
    } catch (err: unknown) {
      // [FIX] Xử lý lỗi 'unknown'
      const msg = err instanceof Error ? err.message : "Lỗi tạo nhóm";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg bg-gray-800 p-4 shadow-lg h-full border border-gray-700">
      <h2 className="mb-3 text-xl font-semibold text-white">Tạo nhóm mới</h2>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Tên nhóm
          </label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Ví dụ: Nhóm gia đình..."
            className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Thành viên ({selectedMemberIds.length})
          </label>
          <div className="h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 p-2">
            {friendsList.length === 0 ? (
              <p className="text-center text-xs text-gray-500 pt-4">
                Chưa có dữ liệu bạn bè.
              </p>
            ) : (
              friendsList.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => handleToggleMember(friend.id)}
                  className={`flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors ${
                    selectedMemberIds.includes(friend.id)
                      ? "bg-blue-900/50 border border-blue-700"
                      : "hover:bg-gray-700"
                  }`}
                >
                  <Avatar src={friend.avatar} alt={friend.name} />
                  <span className="flex-1 truncate text-sm text-white">
                    {friend.name}
                  </span>
                  {selectedMemberIds.includes(friend.id) && (
                    <IconCheck className="h-4 w-4 text-blue-400" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Nút Tạo nhóm */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !groupName || selectedMemberIds.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <IconUsers className="h-5 w-5" />
          {isLoading ? "Đang tạo..." : "Tạo nhóm"}
        </button>

        {/* Kết quả */}
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        {success && (
          <p className="text-center text-sm text-green-400">{success}</p>
        )}
      </div>
    </div>
  );
}

// SỬA ĐỔI (GĐ 3.7): Nhận props và lọc danh sách bạn bè
export function ManagementPanel({
  selectedThread,
  threads,
  onRefreshThreads,
  // THÊM MỚI (Lô 4): Props cho User Cache
  userCache,
  onStartManualScan,
  isScanningAll,
  scanStatus,
}: {
  selectedThread: ThreadInfo | null;
  threads: ThreadInfo[];
  onRefreshThreads: () => void;
  // THÊM MỚI (Lô 4)
  userCache: Record<string, UserCacheEntry>;
  onStartManualScan: () => void;
  isScanningAll: boolean;
  scanStatus: string;
}) {
  // State quản lý Tab
  const [activeTab, setActiveTab] = useState<"general" | "users">("general");
  const friendsList = threads.filter((t) => t.type === 0);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="p-6 pb-0 border-b border-gray-800 bg-gray-900">
        <h1 className="mb-4 text-3xl font-bold text-white">
          Trung tâm Quản lý
        </h1>
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("general")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "general"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Chung (Kết bạn/Nhóm)
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "users"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Cơ sở dữ liệu Users
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-850">
        {activeTab === "general" ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 h-full">
            <AddFriendPanel />
            <FriendRequestManager />
            <CreateGroupPanel
              friendsList={friendsList}
              onGroupCreated={onRefreshThreads}
            />
            {/* AdvancedGroupManager đã được chuyển sang DetailsPanel theo yêu cầu */}
          </div>
        ) : (
          <div className="h-full">
            {/* Tab Users: Chỉ hiển thị UserDatabasePanel full height */}
            <UserDatabasePanel
              userCache={userCache}
              threads={threads}
              onStartManualScan={onStartManualScan}
              isScanningAll={isScanningAll}
              scanStatus={scanStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
