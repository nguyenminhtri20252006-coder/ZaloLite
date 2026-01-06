/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState, useEffect, useTransition } from "react";
import { UserX, Ban, Check, X, RefreshCw, UserPlus } from "lucide-react";
import { ZaloUserProfile, ZaloUserResult } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconSearch,
  IconUserPlus,
  IconRefresh,
  IconCheck,
  IconClose,
  IconUsers,
  IconClock,
} from "@/app/components/ui/Icons";
// Actions
import {
  getBotProfileAction,
  updateActiveStatusAction,
  getBlockListAction,
} from "@/lib/actions/profile.actions";
import {
  getFriendListAction,
  findUserAction,
  sendFriendRequestAction,
  handleFriendAction,
  getSentFriendRequestAction,
  getIncomingFriendRequestAction,
  getFriendRecommendationsAction,
} from "@/lib/actions/friend.actions";
import {
  getAllGroupsAction,
  joinGroupByLinkAction,
  getGroupInvitesAction,
  handleGroupInviteAction,
  createGroupAction,
} from "@/lib/actions/group.actions";

interface BotDetailTabsProps {
  botId: string;
}

const AvatarWrapper = ({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) => (
  <div
    className={`relative overflow-hidden rounded-full shrink-0 flex items-center justify-center bg-gray-700 ${className}`}
  >
    <Avatar src={src || ""} alt={alt} />
  </div>
);

export function BotDetailTabs({ botId }: BotDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<
    "profile" | "friends" | "groups" | "privacy"
  >("profile");
  const [isPending, startTransition] = useTransition();

  // --- DATA STATE ---
  const [profile, setProfile] = useState<ZaloUserProfile | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupInvites, setGroupInvites] = useState<any[]>([]);
  const [blockList, setBlockList] = useState<string[]>([]);

  // Friends Sub-State
  const [friendTabSub, setFriendTabSub] = useState<"list" | "add" | "requests">(
    "list",
  );
  const [requestTabSub, setRequestTabSub] = useState<
    "incoming" | "sent" | "recomm"
  >("incoming");
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  // Add Friend State
  const [addPhone, setAddPhone] = useState("");
  const [addMsg, setAddMsg] = useState("Chào bạn, mình kết bạn nhé!");
  const [foundUser, setFoundUser] = useState<ZaloUserResult | null>(null);
  const [searchError, setSearchError] = useState("");

  // Create Group State
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);

  // Group Link State
  const [groupLink, setGroupLink] = useState("");

  // --- FETCHERS ---
  const fetchProfile = () => {
    startTransition(async () => {
      // Hàm này giờ lấy từ DB -> Nhanh và Luôn thành công (nếu bot tồn tại)
      const res = await getBotProfileAction(botId);
      if (res.success && res.data) {
        setProfile(res.data);
      } else {
        console.error("Profile load failed:", res.error);
      }
    });
  };

  const fetchFriendsData = () => {
    // Các hàm này có thể cần Runtime, nếu lỗi sẽ trả về mảng rỗng để không crash
    startTransition(async () => {
      // 1. Friend List
      const res = await getFriendListAction(botId);
      if (res.success && Array.isArray(res.data)) setFriends(res.data);

      // 2. Requests & Recommendations
      try {
        const [resSent, resIncoming, resRecomm] = await Promise.all([
          getSentFriendRequestAction(botId),
          getIncomingFriendRequestAction(botId),
          getFriendRecommendationsAction(botId),
        ]);

        if (resSent.success && Array.isArray(resSent.data))
          setSentRequests(resSent.data);
        if (resIncoming.success && Array.isArray(resIncoming.data))
          setIncomingRequests(resIncoming.data);
        if (resRecomm.success && resRecomm.data?.recommItems)
          setRecommendations(resRecomm.data.recommItems);
      } catch (e) {
        console.warn("Fetch friends extra data failed (Bot might be offline)");
      }
    });
  };

  const fetchGroupsData = () => {
    startTransition(async () => {
      const resGroups = await getAllGroupsAction(botId);
      if (resGroups.success && Array.isArray(resGroups.data))
        setGroups(resGroups.data);

      const resInvites = await getGroupInvitesAction(botId);
      if (resInvites.success && Array.isArray(resInvites.data))
        setGroupInvites(resInvites.data);
    });
  };

  const fetchPrivacy = () => {
    startTransition(async () => {
      const res = await getBlockListAction(botId);
      setBlockList(res.success && Array.isArray(res.data) ? res.data : []);
    });
  };

  // Init Data on Tab Change
  useEffect(() => {
    if (activeTab === "profile") fetchProfile();
    if (activeTab === "friends") fetchFriendsData();
    if (activeTab === "groups") fetchGroupsData();
    if (activeTab === "privacy") fetchPrivacy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, activeTab]);

  // --- HANDLERS: ADD FRIEND ---
  const handleSearchUser = async () => {
    if (!addPhone) return;
    setFoundUser(null);
    setSearchError("");
    startTransition(async () => {
      const res = await findUserAction(botId, addPhone);
      if (res.success && res.data) {
        setFoundUser(res.data);
      } else {
        setSearchError(
          res.error || "Không tìm thấy người dùng (hoặc Bot offline).",
        );
      }
    });
  };

  const handleSendFriendRequest = async () => {
    if (!foundUser) return;
    startTransition(async () => {
      const res = await sendFriendRequestAction(
        botId,
        foundUser.userId,
        addMsg,
      );
      if (res.success) {
        alert(`Đã gửi lời mời tới ${foundUser.displayName}!`);
        setFoundUser(null);
        setAddPhone("");
        fetchFriendsData();
      } else {
        alert(res.error || "Lỗi gửi kết bạn");
      }
    });
  };

  // --- HANDLERS: FRIEND ACTIONS ---
  const handleFriendActionClick = async (
    userId: string,
    type: "remove" | "block" | "undo" | "accept" | "reject" | "unblock",
  ) => {
    if (
      (type === "remove" || type === "block") &&
      !confirm(`Bạn chắc chắn muốn thực hiện hành động này?`)
    )
      return;
    startTransition(async () => {
      await handleFriendAction(botId, userId, type);
      if (type === "unblock") fetchPrivacy();
      else fetchFriendsData();
    });
  };

  const handleAddRecommend = async (userId: string) => {
    startTransition(async () => {
      await sendFriendRequestAction(botId, userId, "Chào bạn!");
      fetchFriendsData();
    });
  };

  // --- HANDLERS: GROUPS ---
  const handleJoinGroup = async () => {
    if (!groupLink) return;
    startTransition(async () => {
      const res = await joinGroupByLinkAction(botId, groupLink);
      if (res.success) {
        alert("Đã gửi yêu cầu tham gia!");
        setGroupLink("");
        fetchGroupsData();
      } else {
        alert(res.error || "Lỗi tham gia nhóm");
      }
    });
  };

  const handleProcessInvite = async (
    inviteId: string,
    action: "join" | "delete",
  ) => {
    startTransition(async () => {
      await handleGroupInviteAction(botId, inviteId, action);
      fetchGroupsData();
    });
  };

  const handleToggleMember = (id: string) => {
    setNewGroupMembers((prev) =>
      prev.includes(id) ? prev.filter((uid) => uid !== id) : [...prev, id],
    );
  };

  const handleCreateGroup = async () => {
    if (!newGroupName || newGroupMembers.length === 0) return;
    startTransition(async () => {
      const res = await createGroupAction(botId, {
        name: newGroupName,
        members: newGroupMembers,
      });
      if (res.success) {
        alert(`Tạo nhóm "${newGroupName}" thành công!`);
        setIsCreatingGroup(false);
        setNewGroupName("");
        setNewGroupMembers([]);
        fetchGroupsData();
      } else {
        alert(res.error || "Lỗi tạo nhóm");
      }
    });
  };

  // --- RENDERERS ---
  const renderProfileTab = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-4 p-4 bg-gray-700/50 rounded-lg border border-gray-700">
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-600 bg-gray-700 shrink-0">
          <img
            src={profile?.avatar || ""}
            alt="Avatar"
            className="w-full h-full object-cover"
            onError={(e) =>
              (e.currentTarget.src = "https://via.placeholder.com/128?text=Bot")
            }
          />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">
            {profile?.displayName || "Đang tải..."}
          </h3>
          <p className="text-sm text-gray-400">Global ID: {profile?.userId}</p>
          <p className="text-sm italic text-gray-300 mt-1 flex items-center gap-2">
            <IconClock className="w-3 h-3" /> Status: &quot;
            {profile?.status || "..."}&quot;
          </p>
        </div>
        <button
          onClick={fetchProfile}
          className="ml-auto p-2 hover:bg-gray-600 rounded-full text-gray-300"
          title="Tải lại từ DB"
        >
          <RefreshCw size={18} className={isPending ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border border-gray-700 rounded-lg bg-gray-800 space-y-2 text-sm text-gray-300">
          <p>
            <span className="text-gray-500">Giới tính:</span>{" "}
            {profile?.gender === 0 ? "Nam" : "Nữ"}
          </p>
          <p>
            <span className="text-gray-500">Ngày sinh:</span>{" "}
            {profile?.sdob || "---"}
          </p>
          <p>
            <span className="text-gray-500">SĐT:</span>{" "}
            {profile?.phoneNumber || "---"}
          </p>
        </div>
        <div className="p-4 border border-gray-700 rounded-lg bg-gray-800 flex justify-between items-center">
          <span className="text-sm text-gray-300">
            Hiện &quot;Vừa mới truy cập&quot;
          </span>
          <button
            onClick={() => {
              startTransition(async () => {
                const res = await updateActiveStatusAction(botId, true);
                if (!res.success)
                  alert("Bot offline, không thể cập nhật trạng thái online.");
              });
            }}
            className="px-3 py-1 bg-green-700 text-white rounded text-sm hover:bg-green-600 border border-green-600"
          >
            Bật
          </button>
        </div>
      </div>
    </div>
  );

  const renderFriendsTab = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Sub Tabs */}
      <div className="flex border-b border-gray-700 bg-gray-800 rounded-t-lg">
        <button
          onClick={() => setFriendTabSub("list")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            friendTabSub === "list"
              ? "text-blue-400 border-b-2 border-blue-400 bg-gray-700/50"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Danh sách ({friends.length})
        </button>
        <button
          onClick={() => setFriendTabSub("add")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            friendTabSub === "add"
              ? "text-blue-400 border-b-2 border-blue-400 bg-gray-700/50"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Thêm bạn
        </button>
        <button
          onClick={() => setFriendTabSub("requests")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            friendTabSub === "requests"
              ? "text-blue-400 border-b-2 border-blue-400 bg-gray-700/50"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Lời mời ({incomingRequests.length})
        </button>
      </div>
      <div className="min-h-[300px]">
        {/* VIEW: LIST */}
        {friendTabSub === "list" && (
          <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
            {friends.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-8">
                Chưa có dữ liệu bạn bè (Hãy chạy Sync).
              </p>
            )}
            {friends.map((friend: any) => (
              <div
                key={friend.userId}
                className="flex justify-between items-center p-2 hover:bg-gray-800 rounded border border-transparent hover:border-gray-700 transition-all"
              >
                <div className="flex gap-3 items-center">
                  <AvatarWrapper
                    src={friend.avatar}
                    alt="F"
                    className="w-9 h-9"
                  />
                  <div>
                    <p className="text-sm font-bold text-gray-200">
                      {friend.displayName}
                    </p>
                    <p className="text-xs text-gray-500">{friend.userId}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() =>
                      handleFriendActionClick(friend.userId, "remove")
                    }
                    className="p-1.5 text-red-400 hover:bg-red-900/30 rounded"
                    title="Hủy kết bạn"
                  >
                    <UserX size={16} />
                  </button>
                  <button
                    onClick={() =>
                      handleFriendActionClick(friend.userId, "block")
                    }
                    className="p-1.5 text-gray-400 hover:bg-gray-700 rounded hover:text-white"
                    title="Chặn"
                  >
                    <Ban size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* VIEW: ADD FRIEND */}
        {friendTabSub === "add" && (
          <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <IconSearch className="w-4 h-4" /> Tìm qua Số điện thoại
            </h4>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nhập SĐT (84...)"
                className="flex-1 px-3 py-2 rounded border border-gray-600 bg-gray-900 text-white text-sm focus:border-blue-500 outline-none"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
              />
              <button
                onClick={handleSearchUser}
                disabled={isPending || !addPhone}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm disabled:opacity-50"
              >
                Tìm
              </button>
            </div>
            {searchError && (
              <p className="text-red-400 text-xs mb-3">{searchError}</p>
            )}
            {foundUser && (
              <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600 animate-fade-in">
                <div className="flex items-center gap-3 mb-3">
                  <AvatarWrapper
                    src={foundUser.avatar}
                    alt="U"
                    className="w-12 h-12"
                  />
                  <div>
                    <p className="font-bold text-white text-base">
                      {foundUser.displayName}
                    </p>
                    <p className="text-xs text-gray-400">
                      ID: {foundUser.userId}
                    </p>
                  </div>
                </div>
                <textarea
                  value={addMsg}
                  onChange={(e) => setAddMsg(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white mb-3 focus:border-blue-500 outline-none"
                  rows={2}
                  placeholder="Nhập lời chào..."
                />
                <button
                  onClick={handleSendFriendRequest}
                  disabled={isPending}
                  className="w-full py-2 bg-green-600 text-white rounded font-bold text-sm hover:bg-green-500 flex items-center justify-center gap-2"
                >
                  <IconUserPlus className="w-4 h-4" /> Gửi kết bạn
                </button>
              </div>
            )}
          </div>
        )}
        {/* VIEW: REQUESTS */}
        {friendTabSub === "requests" && (
          <div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setRequestTabSub("incoming")}
                className={`px-3 py-1 rounded text-xs font-bold ${
                  requestTabSub === "incoming"
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                Nhận ({incomingRequests.length})
              </button>
              <button
                onClick={() => setRequestTabSub("sent")}
                className={`px-3 py-1 rounded text-xs font-bold ${
                  requestTabSub === "sent"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                Đã gửi ({sentRequests.length})
              </button>
              <button
                onClick={() => setRequestTabSub("recomm")}
                className={`px-3 py-1 rounded text-xs font-bold ${
                  requestTabSub === "recomm"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                Gợi ý
              </button>
            </div>
            <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
              {/* INCOMING */}
              {requestTabSub === "incoming" && (
                <>
                  {incomingRequests.length === 0 && (
                    <p className="text-center text-xs text-gray-500 mt-4">
                      Không có lời mời nào.
                    </p>
                  )}
                  {incomingRequests.map((req: any) => (
                    <div
                      key={req.userId || req.uid}
                      className="flex justify-between items-center p-2 bg-gray-800 rounded border border-gray-700"
                    >
                      <div className="flex gap-2 items-center overflow-hidden">
                        <AvatarWrapper
                          src={req.avatar}
                          alt="In"
                          className="w-8 h-8"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {req.displayName || req.name}
                          </p>
                          <p className="text-xs text-gray-400 italic truncate">
                            &quot;{req.msg || req.message}&quot;
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() =>
                            handleFriendActionClick(
                              req.userId || req.uid,
                              "accept",
                            )
                          }
                          className="p-1.5 bg-green-700 hover:bg-green-600 text-white rounded"
                          title="Đồng ý"
                        >
                          <IconCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            handleFriendActionClick(
                              req.userId || req.uid,
                              "reject",
                            )
                          }
                          className="p-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded"
                          title="Xóa"
                        >
                          <IconClose className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {/* SENT */}
              {requestTabSub === "sent" && (
                <>
                  {sentRequests.length === 0 && (
                    <p className="text-center text-xs text-gray-500 mt-4">
                      Trống.
                    </p>
                  )}
                  {sentRequests.map((req: any) => (
                    <div
                      key={req.userId || req.uid}
                      className="flex justify-between items-center p-2 bg-gray-800 rounded border border-gray-700"
                    >
                      <div className="flex gap-2 items-center">
                        <AvatarWrapper
                          src={req.avatar}
                          alt="Sent"
                          className="w-8 h-8"
                        />
                        <div>
                          <p className="text-sm font-bold text-gray-300">
                            {req.displayName || req.name}
                          </p>
                          <p className="text-xs text-gray-500">Đang chờ...</p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleFriendActionClick(req.userId || req.uid, "undo")
                        }
                        className="text-xs text-red-400 hover:text-red-300 hover:underline"
                      >
                        Thu hồi
                      </button>
                    </div>
                  ))}
                </>
              )}
              {/* RECOMMENDATIONS */}
              {requestTabSub === "recomm" && (
                <>
                  {recommendations.length === 0 && (
                    <p className="text-center text-xs text-gray-500 mt-4">
                      Không có gợi ý (Bot có thể offline).
                    </p>
                  )}
                  {recommendations.map((item: any) => (
                    <div
                      key={item.dataInfo.userId}
                      className="flex justify-between items-center p-2 bg-gray-800 rounded border border-gray-700"
                    >
                      <div className="flex gap-2 items-center overflow-hidden">
                        <AvatarWrapper
                          src={item.dataInfo.avatar}
                          alt="Rec"
                          className="w-8 h-8"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {item.dataInfo.displayName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {item.dataInfo.recommInfo?.message}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddRecommend(item.dataInfo.userId)}
                        className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
                        title="Kết bạn"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderGroupsTab = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Create Group Toggle */}
      {!isCreatingGroup ? (
        <div className="flex gap-2">
          <button
            onClick={() => setIsCreatingGroup(true)}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2"
          >
            <IconUsers className="w-4 h-4" /> Tạo Nhóm Mới
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 animate-scale-up">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-white">Tạo nhóm</h4>
            <button
              onClick={() => setIsCreatingGroup(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Tên nhóm..."
            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm mb-3 focus:border-blue-500 outline-none"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <p className="text-xs text-gray-400 mb-2">
            Chọn thành viên ({newGroupMembers.length}):
          </p>
          <div className="max-h-[150px] overflow-y-auto border border-gray-700 rounded bg-gray-900/50 p-1 mb-3">
            {friends.map((f: any) => (
              <div
                key={f.userId}
                onClick={() => handleToggleMember(f.userId)}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                  newGroupMembers.includes(f.userId)
                    ? "bg-blue-900/40 border border-blue-600"
                    : "hover:bg-gray-700 border border-transparent"
                }`}
              >
                <AvatarWrapper src={f.avatar} alt="F" className="w-6 h-6" />
                <span className="text-sm text-gray-200 flex-1 truncate">
                  {f.displayName}
                </span>
                {newGroupMembers.includes(f.userId) && (
                  <Check className="w-3 h-3 text-blue-400" />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={handleCreateGroup}
            disabled={
              !newGroupName || newGroupMembers.length === 0 || isPending
            }
            className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold text-sm disabled:opacity-50"
          >
            {isPending ? "Đang tạo..." : "Xác nhận tạo"}
          </button>
        </div>
      )}
      {/* Join Link */}
      <div className="p-3 bg-gray-700/30 rounded-lg border border-gray-700 flex gap-2">
        <input
          type="text"
          placeholder="Dán link nhóm Zalo..."
          className="flex-1 px-3 py-2 rounded border border-gray-600 bg-gray-800 text-white text-sm focus:border-blue-500 outline-none"
          value={groupLink}
          onChange={(e) => setGroupLink(e.target.value)}
        />
        <button
          onClick={handleJoinGroup}
          disabled={isPending || !groupLink}
          className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 font-medium text-sm disabled:opacity-50"
        >
          Vào
        </button>
      </div>
      {/* Invites */}
      {groupInvites.length > 0 && (
        <div className="p-3 border border-yellow-700/50 bg-yellow-900/10 rounded-lg space-y-2">
          <h4 className="text-xs font-bold text-yellow-500 uppercase">
            Lời mời vào nhóm ({groupInvites.length})
          </h4>
          {groupInvites.map((inv: any) => (
            <div
              key={inv.id}
              className="flex justify-between items-center bg-gray-900 p-2 rounded border border-gray-700"
            >
              <div className="flex gap-2 items-center overflow-hidden">
                <AvatarWrapper src={inv.avatar} alt="G" className="w-8 h-8" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 font-bold truncate">
                    {inv.groupName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    Từ: {inv.inviterName}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleProcessInvite(inv.id, "join")}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                >
                  Vào
                </button>
                <button
                  onClick={() => handleProcessInvite(inv.id, "delete")}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Group List */}
      <div>
        <div className="flex justify-between mb-2 items-center">
          <h4 className="font-semibold text-gray-200">
            Danh sách Nhóm ({groups.length})
          </h4>
          <button
            onClick={fetchGroupsData}
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto border border-gray-700 rounded-lg p-2 bg-gray-900/50">
          {groups.map((grp: any) => (
            <div
              key={grp.groupId}
              className="flex items-center gap-3 p-3 border border-gray-800 bg-gray-800/50 rounded hover:bg-gray-800"
            >
              <div className="w-10 h-10 bg-blue-900/30 rounded-full flex items-center justify-center text-blue-400 font-bold border border-blue-800 shrink-0">
                G
              </div>
              <div className="overflow-hidden">
                <p className="font-medium truncate text-sm text-gray-200">
                  {grp.groupName || grp.groupId}
                </p>
                <p className="text-xs text-gray-500">ID: {grp.groupId}</p>
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="col-span-2 text-center text-xs text-gray-500 py-4">
              Chưa tham gia nhóm nào.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderPrivacyTab = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h3 className="font-bold flex items-center gap-2 text-gray-200">
        <div className="p-1 bg-red-900/30 rounded">
          <Ban size={16} className="text-red-400" />
        </div>
        Danh sách chặn ({blockList.length})
      </h3>
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 overflow-hidden">
        {blockList.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">Trống</p>
        ) : (
          <div className="divide-y divide-gray-800 max-h-[250px] overflow-y-auto">
            {blockList.map((uid) => (
              <div
                key={uid}
                className="flex justify-between items-center p-3 hover:bg-gray-800"
              >
                <span className="font-mono text-sm text-red-300">{uid}</span>
                <button
                  onClick={() => handleFriendActionClick(uid, "unblock")}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Bỏ chặn
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={fetchPrivacy}
        className="text-xs text-gray-400 flex items-center gap-1 hover:text-white"
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden mt-6">
      <div className="flex border-b border-gray-700 bg-gray-900">
        {["profile", "friends", "groups", "privacy"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t as any)}
            className={`flex-1 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === t
                ? "border-blue-500 text-blue-400 bg-gray-800"
                : "border-transparent text-gray-500 hover:bg-gray-800"
            }`}
          >
            {t === "friends" ? "Bạn bè" : t === "groups" ? "Nhóm" : t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 relative min-h-[300px]">
        {isPending && (
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-900/50 overflow-hidden z-10">
            <div className="h-full bg-blue-500 animate-progress"></div>
          </div>
        )}
        {activeTab === "profile" && renderProfileTab()}
        {activeTab === "friends" && renderFriendsTab()}
        {activeTab === "groups" && renderGroupsTab()}
        {activeTab === "privacy" && renderPrivacyTab()}
      </div>
    </div>
  );
}
