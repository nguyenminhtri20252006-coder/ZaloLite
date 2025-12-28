"use client";

/**
 * app/components/modules/ManagementPanel.tsx
 * Giao diện chính cho Tab "Quản lý".
 * [UPDATED] Bổ sung quản lý Lời mời nhận được (Incoming Requests).
 */

import { useState, useEffect } from "react";
import {
  findUserAction,
  sendFriendRequestAction,
  getFriendRecommendationsAction,
  getSentFriendRequestAction,
  getIncomingFriendRequestAction, // [NEW] Import action lấy lời mời nhận được
  handleFriendAction,
} from "@/lib/actions/friend.actions";
import { createGroupAction } from "@/lib/actions/group.actions";
import {
  FindUserResponse,
  FriendRecommendationsRecommItem,
  ThreadInfo,
  UserCacheEntry,
  ZaloUserResult, // Sử dụng Type chuẩn hóa
} from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconSearch,
  IconUserPlus,
  IconRefresh,
  IconCheck,
  IconClose,
  IconUsers,
} from "@/app/components/ui/Icons";
import { UserDatabasePanel } from "./UserDatabasePanel";

// --- SUB-COMPONENT: Add Friend Panel ---

function AddFriendPanel({ botId }: { botId: string }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [friendRequestMessage, setFriendRequestMessage] =
    useState("Kết bạn nhé!");
  const [foundUser, setFoundUser] = useState<ZaloUserResult | null>(null);
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

    try {
      const result = await findUserAction(botId, phoneNumber);

      if (!result.success || !result.data) {
        throw new Error(
          result.error || "Không tìm thấy người dùng với số điện thoại này.",
        );
      }
      setFoundUser(result.data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Lỗi tìm kiếm không xác định";
      setError(`Lỗi tìm kiếm: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!foundUser) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const targetId = foundUser.userId;
      const res = await sendFriendRequestAction(
        botId,
        targetId,
        friendRequestMessage,
      );

      if (res.success) {
        setSuccess(`Đã gửi lời mời kết bạn đến ${foundUser.displayName}.`);
        setFoundUser(null);
        setPhoneNumber("");
        setFriendRequestMessage("Kết bạn nhé!");
      } else {
        throw new Error(res.error);
      }
    } catch (err: unknown) {
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
              <Avatar
                src={foundUser.avatar}
                alt={foundUser.displayName || "User"}
              />
              <div className="flex-1">
                <h3 className="font-semibold text-white">
                  {foundUser.displayName}
                </h3>
                <p className="font-mono text-xs text-gray-400">
                  {foundUser.userId}
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

// --- SUB-COMPONENT: Friend Request Manager ---

function FriendRequestManager({ botId }: { botId: string }) {
  // [UPDATE] Thêm tab 'incoming'
  const [tab, setTab] = useState<"recommended" | "sent" | "incoming">(
    "recommended",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<
    FriendRecommendationsRecommItem[]
  >([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);

  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const handleFetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [recommResult, sentResult, incomingResult] = await Promise.all([
        getFriendRecommendationsAction(botId),
        getSentFriendRequestAction(botId),
        getIncomingFriendRequestAction(botId), // [NEW] Fetch incoming
      ]);

      if (
        recommResult.success &&
        recommResult.data &&
        Array.isArray(recommResult.data.recommItems)
      ) {
        setRecommendations(recommResult.data.recommItems);
      }

      if (sentResult.success && sentResult.data) {
        const data = sentResult.data;
        if (Array.isArray(data)) {
          setSentRequests(data);
        } else if (typeof data === "object") {
          setSentRequests(Object.values(data));
        }
      }

      // [NEW] Handle incoming requests
      if (incomingResult.success && incomingResult.data) {
        const data = incomingResult.data;
        if (Array.isArray(data)) {
          setIncomingRequests(data);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setError(`Lỗi tải danh sách: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (botId) handleFetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  // Handle Accept/Reject for Incoming
  const handleIncomingAction = async (
    userId: string,
    action: "accept" | "reject",
  ) => {
    if (loadingActionId) return;
    setLoadingActionId(userId);
    try {
      await handleFriendAction(botId, userId, action);
      handleFetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActionId(null);
    }
  };

  // Handle Recommended
  const handleAddRecommend = async (userId: string) => {
    if (loadingActionId) return;
    setLoadingActionId(userId);
    try {
      await sendFriendRequestAction(botId, userId, "Chào bạn!");
      handleFetchData(); // Refresh list (maybe remove item)
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActionId(null);
    }
  };

  // Handle Sent (Undo)
  const handleUndoRequest = async (userId: string) => {
    if (loadingActionId) return;
    setLoadingActionId(userId);
    try {
      await handleFriendAction(botId, userId, "undo");
      handleFetchData();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div className="rounded-lg bg-gray-800 p-4 shadow-lg h-full border border-gray-700 flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
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
      <div className="mb-3 flex rounded-lg bg-gray-700 p-1 shrink-0">
        <button
          onClick={() => setTab("recommended")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
            tab === "recommended"
              ? "bg-blue-600 text-white"
              : "text-gray-300 hover:bg-gray-600"
          }`}
        >
          Gợi ý ({recommendations.length})
        </button>
        <button
          onClick={() => setTab("incoming")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
            tab === "incoming"
              ? "bg-green-600 text-white"
              : "text-gray-300 hover:bg-gray-600"
          }`}
        >
          Nhận ({incomingRequests.length})
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
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

      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[300px]">
        {/* --- RECOMMENDED LIST --- */}
        {tab === "recommended" && (
          <>
            {recommendations.length === 0 ? (
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
                    onClick={() => handleAddRecommend(item.dataInfo.userId)}
                    disabled={!!loadingActionId}
                    className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
                    title="Kết bạn"
                  >
                    <IconUserPlus className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {/* --- INCOMING LIST --- */}
        {tab === "incoming" && (
          <>
            {incomingRequests.length === 0 ? (
              <p className="text-center text-xs text-gray-500 mt-4">
                Không có lời mời nào.
              </p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              incomingRequests.map((req: any) => (
                <div
                  key={req.userId || req.uid || req.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-700/50 p-2"
                >
                  <Avatar src={req.avatar} alt={req.displayName || req.name} />
                  <div className="flex-1 overflow-hidden">
                    <h4 className="truncate text-sm font-medium text-white">
                      {req.displayName || req.name || "Unknown"}
                    </h4>
                    <p className="truncate text-xs text-gray-400 italic">
                      &quot;{req.msg || req.message}&quot;
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        handleIncomingAction(req.userId || req.uid, "accept")
                      }
                      disabled={!!loadingActionId}
                      className="rounded-lg bg-green-600 p-1.5 text-white hover:bg-green-700 disabled:opacity-50"
                      title="Chấp nhận"
                    >
                      <IconCheck className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        handleIncomingAction(req.userId || req.uid, "reject")
                      }
                      disabled={!!loadingActionId}
                      className="rounded-lg bg-gray-600 p-1.5 text-white hover:bg-gray-500 disabled:opacity-50"
                      title="Từ chối"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* --- SENT LIST --- */}
        {tab === "sent" && (
          <>
            {sentRequests.length === 0 ? (
              <p className="text-center text-xs text-gray-500 mt-4">
                Chưa gửi lời mời nào.
              </p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              sentRequests.map((req: any) => (
                <div
                  key={req.userId || req.uid}
                  className="flex items-center gap-2 rounded-lg bg-gray-700/50 p-2"
                >
                  <Avatar src={req.avatar} alt={req.displayName} />
                  <div className="flex-1 overflow-hidden">
                    <h4 className="truncate text-sm font-medium text-white">
                      {req.displayName || req.name}
                    </h4>
                    <p className="truncate text-xs text-gray-400 italic">
                      &quot;{req.fReqInfo?.message || ""}&quot;
                    </p>
                  </div>
                  <button
                    onClick={() => handleUndoRequest(req.userId || req.uid)}
                    disabled={!!loadingActionId}
                    className="rounded-lg bg-gray-600 p-1.5 text-white hover:bg-gray-500 disabled:opacity-50"
                    title="Thu hồi"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: Create Group Panel ---

function CreateGroupPanel({
  botId,
  friendsList,
  onGroupCreated,
}: {
  botId: string;
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
      const res = await createGroupAction(botId, {
        name: groupName,
        members: selectedMemberIds,
      });

      if (res.success) {
        setSuccess(`Tạo nhóm "${groupName}" thành công!`);
        setGroupName("");
        setSelectedMemberIds([]);
        onGroupCreated();
      } else {
        throw new Error(res.error);
      }
    } catch (err: unknown) {
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

// --- MAIN COMPONENT ---

export function ManagementPanel({
  botId,
  selectedThread,
  threads,
  onRefreshThreads,
  userCache,
  onStartManualScan,
  isScanningAll,
  scanStatus,
}: {
  botId: string | null;
  selectedThread: ThreadInfo | null;
  threads: ThreadInfo[];
  onRefreshThreads: () => void;
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
            {botId ? (
              <>
                <AddFriendPanel botId={botId} />
                <FriendRequestManager botId={botId} />
                <CreateGroupPanel
                  botId={botId}
                  friendsList={friendsList}
                  onGroupCreated={onRefreshThreads}
                />
              </>
            ) : (
              <div className="col-span-3 flex items-center justify-center h-full text-gray-500">
                Vui lòng chọn một Bot để sử dụng các tính năng quản lý.
              </div>
            )}
          </div>
        ) : (
          <div className="h-full">
            <UserDatabasePanel
              botId={botId}
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
