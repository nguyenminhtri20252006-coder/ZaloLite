"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  User,
  Users,
  Shield,
  Globe,
  Search,
  UserPlus,
  UserX,
  Ban,
  RefreshCw,
  Link as LinkIcon,
  Check,
  X,
  Clock,
} from "lucide-react";
import { ZaloUserProfile } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";

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
} from "@/lib/actions/friend.actions";
import {
  getAllGroupsAction,
  joinGroupByLinkAction,
  getGroupInvitesAction,
  handleGroupInviteAction,
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

  // Data State
  const [profile, setProfile] = useState<ZaloUserProfile | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [friends, setFriends] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [groups, setGroups] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [groupInvites, setGroupInvites] = useState<any[]>([]);
  const [blockList, setBlockList] = useState<string[]>([]);

  // Friend Requests State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [friendTabSub, setFriendTabSub] = useState<"list" | "requests">("list");

  // Search State
  const [phoneSearch, setPhoneSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searchError, setSearchError] = useState("");

  // Group Link State
  const [groupLink, setGroupLink] = useState("");

  // --- FETCHERS ---
  const fetchProfile = () =>
    startTransition(async () => {
      const res = await getBotProfileAction(botId);
      if (res.success && res.data) setProfile(res.data);
    });

  const fetchFriends = () =>
    startTransition(async () => {
      const res = await getFriendListAction(botId);
      setFriends(res.success && Array.isArray(res.data) ? res.data : []);

      // Fetch requests
      const resSent = await getSentFriendRequestAction(botId);
      setSentRequests(
        resSent.success && Array.isArray(resSent.data) ? resSent.data : [],
      );

      const resIncoming = await getIncomingFriendRequestAction(botId);
      setIncomingRequests(
        resIncoming.success && Array.isArray(resIncoming.data)
          ? resIncoming.data
          : [],
      );
    });

  const fetchGroups = () =>
    startTransition(async () => {
      const resGroups = await getAllGroupsAction(botId);
      setGroups(
        resGroups.success && Array.isArray(resGroups.data)
          ? resGroups.data
          : [],
      );

      const resInvites = await getGroupInvitesAction(botId);
      setGroupInvites(
        resInvites.success && Array.isArray(resInvites.data)
          ? resInvites.data
          : [],
      );
    });

  const fetchPrivacy = () =>
    startTransition(async () => {
      const res = await getBlockListAction(botId);
      setBlockList(res.success && Array.isArray(res.data) ? res.data : []);
    });

  useEffect(() => {
    if (activeTab === "profile") fetchProfile();
    if (activeTab === "friends") fetchFriends();
    if (activeTab === "groups") fetchGroups();
    if (activeTab === "privacy") fetchPrivacy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, activeTab]);

  // --- HANDLERS ---
  const handleSearchUser = () => {
    if (!phoneSearch) return;
    setSearchResult(null);
    setSearchError("");
    startTransition(async () => {
      const res = await findUserAction(botId, phoneSearch);
      if (res.success && res.data) setSearchResult(res.data);
      else setSearchError(res.error || "Không tìm thấy.");
    });
  };

  const handleAddFriend = async (userId: string) => {
    startTransition(async () => {
      const res = await sendFriendRequestAction(botId, userId);
      if (res.success) {
        alert("Đã gửi lời mời!");
        fetchFriends();
      } else alert(res.error);
    });
  };

  // [FIX] Cập nhật Type Definition cho tham số 'type' để bao gồm 'unblock'
  const handleFriendActionClick = async (
    userId: string,
    type: "remove" | "block" | "undo" | "accept" | "reject" | "unblock",
  ) => {
    if (
      (type === "remove" || type === "block") &&
      !confirm(`Bạn chắc chắn muốn ${type}?`)
    )
      return;
    startTransition(async () => {
      await handleFriendAction(botId, userId, type);
      // Refresh list tương ứng
      if (type === "unblock") fetchPrivacy();
      else fetchFriends();
    });
  };

  const handleJoinGroup = async () => {
    if (!groupLink) return;
    startTransition(async () => {
      const res = await joinGroupByLinkAction(botId, groupLink);
      if (res.success) {
        alert("Đã gửi yêu cầu tham gia!");
        setGroupLink("");
        fetchGroups();
      } else alert(res.error);
    });
  };

  const handleProcessInvite = async (
    inviteId: string,
    action: "join" | "delete",
  ) => {
    startTransition(async () => {
      await handleGroupInviteAction(botId, inviteId, action);
      fetchGroups();
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
          <p className="text-sm text-gray-400">ID: {profile?.userId}</p>
          <p className="text-sm italic text-gray-300 mt-1">
            &quot;{profile?.status || "..."}&quot;
          </p>
        </div>
        <button
          onClick={fetchProfile}
          className="ml-auto p-2 hover:bg-gray-600 rounded-full text-gray-300"
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
            <span className="text-gray-500">Ngày sinh:</span> {profile?.sdob}
          </p>
          <p>
            <span className="text-gray-500">SĐT:</span> {profile?.phoneNumber}
          </p>
        </div>
        <div className="p-4 border border-gray-700 rounded-lg bg-gray-800 flex justify-between items-center">
          <span className="text-sm text-gray-300">
            Hiện &quot;Vừa mới truy cập&quot;
          </span>
          {/* [FIX] Wrap async call with brace block to avoid returning promise to startTransition */}
          <button
            onClick={() => {
              startTransition(async () => {
                await updateActiveStatusAction(botId, true);
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Search */}
      <div className="p-4 bg-gray-700/30 rounded-lg border border-gray-700">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Nhập SĐT (VN)..."
            className="flex-1 px-3 py-2 rounded border border-gray-600 bg-gray-800 text-white text-sm"
            value={phoneSearch}
            onChange={(e) => setPhoneSearch(e.target.value)}
          />
          <button
            onClick={handleSearchUser}
            disabled={isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
          >
            Tìm
          </button>
        </div>
        {searchError && <p className="text-red-400 text-xs">{searchError}</p>}
        {searchResult && (
          <div className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-600 mt-2">
            <div className="flex items-center gap-3">
              <AvatarWrapper
                src={searchResult.avatar}
                alt="U"
                className="w-10 h-10"
              />
              <div>
                <p className="font-bold text-white text-sm">
                  {searchResult.displayName}
                </p>
                <p className="text-xs text-gray-400">{searchResult.userId}</p>
              </div>
            </div>
            <button
              onClick={() => handleAddFriend(searchResult.userId)}
              className="text-xs bg-blue-900 text-blue-300 border border-blue-700 px-3 py-1 rounded"
            >
              Kết bạn
            </button>
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setFriendTabSub("list")}
          className={`flex-1 py-2 text-sm ${
            friendTabSub === "list"
              ? "text-blue-400 border-b-2 border-blue-400"
              : "text-gray-400"
          }`}
        >
          Bạn bè ({friends.length})
        </button>
        <button
          onClick={() => setFriendTabSub("requests")}
          className={`flex-1 py-2 text-sm ${
            friendTabSub === "requests"
              ? "text-blue-400 border-b-2 border-blue-400"
              : "text-gray-400"
          }`}
        >
          Lời mời ({incomingRequests.length + sentRequests.length})
        </button>
      </div>

      {friendTabSub === "list" && (
        <div className="max-h-[400px] overflow-y-auto border border-gray-700 rounded-lg bg-gray-900/50 p-2 space-y-1">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {friends.map((friend: any) => (
            <div
              key={friend.userId}
              className="flex justify-between items-center p-2 hover:bg-gray-800 rounded"
            >
              <div className="flex gap-3 items-center">
                <AvatarWrapper
                  src={friend.avatar}
                  alt="F"
                  className="w-8 h-8"
                />
                <div>
                  <p className="text-sm text-gray-200">{friend.displayName}</p>
                  <p className="text-xs text-gray-500">{friend.userId}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    handleFriendActionClick(friend.userId, "remove")
                  }
                  className="p-1 text-red-400 bg-gray-800 rounded"
                >
                  <UserX size={14} />
                </button>
                <button
                  onClick={() =>
                    handleFriendActionClick(friend.userId, "block")
                  }
                  className="p-1 text-gray-400 bg-gray-800 rounded"
                >
                  <Ban size={14} />
                </button>
              </div>
            </div>
          ))}
          {friends.length === 0 && (
            <p className="text-center text-xs text-gray-500 py-4">
              Chưa có bạn bè.
            </p>
          )}
        </div>
      )}

      {friendTabSub === "requests" && (
        <div className="space-y-4">
          {/* Incoming */}
          <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-2">
            <h5 className="text-xs font-bold text-green-400 mb-2 uppercase">
              Lời mời nhận được ({incomingRequests.length})
            </h5>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {incomingRequests.map((req: any) => (
              <div
                key={req.userId || req.uid}
                className="flex justify-between items-center p-2 bg-gray-800 mb-1 rounded"
              >
                <div className="flex gap-2 items-center">
                  <AvatarWrapper
                    src={req.avatar}
                    alt="Req"
                    className="w-8 h-8"
                  />
                  <div>
                    <p className="text-sm text-white">
                      {req.displayName || req.name}
                    </p>
                    <p className="text-xs text-gray-400 italic">
                      &quot;{req.msg || req.message}&quot;
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      handleFriendActionClick(req.userId || req.uid, "accept")
                    }
                    className="text-xs bg-green-700 text-white px-2 py-1 rounded"
                  >
                    Đồng ý
                  </button>
                  <button
                    onClick={() =>
                      handleFriendActionClick(req.userId || req.uid, "reject")
                    }
                    className="text-xs bg-gray-600 text-white px-2 py-1 rounded"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
            {incomingRequests.length === 0 && (
              <p className="text-center text-xs text-gray-500">
                Không có lời mời nào.
              </p>
            )}
          </div>

          {/* Sent */}
          <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-2">
            <h5 className="text-xs font-bold text-blue-400 mb-2 uppercase">
              Lời mời đã gửi ({sentRequests.length})
            </h5>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {sentRequests.map((req: any) => (
              <div
                key={req.userId || req.uid}
                className="flex justify-between items-center p-2 bg-gray-800 mb-1 rounded"
              >
                <div className="flex gap-2 items-center">
                  <AvatarWrapper
                    src={req.avatar}
                    alt="Sent"
                    className="w-8 h-8"
                  />
                  <p className="text-sm text-gray-300">
                    {req.displayName || req.name}
                  </p>
                </div>
                <button
                  onClick={() =>
                    handleFriendActionClick(req.userId || req.uid, "undo")
                  }
                  className="text-xs text-red-400 hover:underline"
                >
                  Thu hồi
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderGroupsTab = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="p-4 bg-gray-700/30 rounded-lg border border-gray-700 flex gap-2">
        <input
          type="text"
          placeholder="Link nhóm Zalo..."
          className="flex-1 px-3 py-2 rounded border border-gray-600 bg-gray-800 text-white text-sm"
          value={groupLink}
          onChange={(e) => setGroupLink(e.target.value)}
        />
        <button
          onClick={handleJoinGroup}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
        >
          Tham gia
        </button>
      </div>

      {groupInvites.length > 0 && (
        <div className="p-3 border border-yellow-700/50 bg-yellow-900/10 rounded-lg space-y-2">
          <h4 className="text-xs font-bold text-yellow-500 uppercase">
            Lời mời vào nhóm ({groupInvites.length})
          </h4>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {groupInvites.map((inv: any) => (
            <div
              key={inv.id}
              className="flex justify-between items-center bg-gray-900 p-2 rounded border border-gray-700"
            >
              <div className="flex gap-2 items-center">
                <AvatarWrapper src={inv.avatar} alt="G" className="w-8 h-8" />
                <div>
                  <p className="text-sm text-gray-200 font-bold">
                    {inv.groupName}
                  </p>
                  <p className="text-xs text-gray-500">Từ: {inv.inviterName}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleProcessInvite(inv.id, "join")}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                >
                  Vào
                </button>
                <button
                  onClick={() => handleProcessInvite(inv.id, "delete")}
                  className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex justify-between mb-2">
          <h4 className="font-semibold text-gray-200">
            Nhóm ({groups.length})
          </h4>
          <button
            onClick={fetchGroups}
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto border border-gray-700 rounded-lg p-2 bg-gray-900/50">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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
                  {grp.groupId}
                </p>
                {/* [FIX] Ép kiểu String cho version để tránh React Error */}
                <p className="text-xs text-gray-500">
                  Ver: {String(grp.version)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPrivacyTab = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h3 className="font-bold flex items-center gap-2 text-gray-200">
        <Shield size={16} className="text-red-400" /> Chặn ({blockList.length})
      </h3>
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 overflow-hidden">
        {blockList.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">Trống</p>
        ) : (
          <div className="divide-y divide-gray-800">
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
        className="text-xs text-gray-400 flex items-center gap-1"
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
            key={
              t
            } /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            onClick={() => setActiveTab(t as any)}
            className={`flex-1 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === t
                ? "border-blue-500 text-blue-400 bg-gray-800"
                : "border-transparent text-gray-500 hover:bg-gray-800"
            }`}
          >
            {t}
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
