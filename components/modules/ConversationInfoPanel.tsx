/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconRefresh } from "@/components/ui/Icons";
import { getThreadDetailsAction } from "@/lib/actions/thread.actions";

interface ConversationInfoPanelProps {
  bot: ZaloBot | null;
  thread: ThreadInfo | null;
  onClose: () => void;
}

// --- SUB-COMPONENTS (Tách logic hiển thị) ---

const InfoRow = ({
  label,
  value,
  isLink = false,
}: {
  label: string;
  value: string | number;
  isLink?: boolean;
}) => (
  <div className="flex justify-between items-start py-3 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-500 min-w-[100px]">{label}</span>
    <span
      className={`text-sm font-medium text-right max-w-[65%] break-words ${
        isLink
          ? "text-blue-600 cursor-pointer hover:underline"
          : "text-gray-900"
      }`}
    >
      {value || "---"}
    </span>
  </div>
);

const PrivateInfoView = ({ data }: { data: any }) => {
  // Mapping dữ liệu từ User Profile Zalo
  const genderMap: Record<number, string> = { 0: "Nam", 1: "Nữ" };
  const gender =
    data.gender !== undefined ? genderMap[data.gender] : "Không xác định";

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-1">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Hồ sơ cá nhân
      </h4>
      <InfoRow label="Tên Zalo" value={data.zaloName} />
      <InfoRow label="Tên hiển thị" value={data.displayName} />
      <InfoRow label="Biệt danh" value={data.alias} />
      <InfoRow label="Giới tính" value={gender} />
      <InfoRow label="Ngày sinh" value={data.sdob} />
      <InfoRow label="Số điện thoại" value={data.phoneNumber || "Ẩn"} />
      <InfoRow label="User ID" value={data.userId} />
    </div>
  );
};

const GroupInfoView = ({ data }: { data: any }) => {
  const admins = Array.isArray(data.adminIds)
    ? `${data.adminIds.length} quản trị viên`
    : "---";

  // [FIX] Xử lý linkJoin (Object -> String)
  let linkJoinUrl = "Không có";
  if (data.linkJoin) {
    if (typeof data.linkJoin === "string") {
      linkJoinUrl = data.linkJoin;
    } else if (typeof data.linkJoin === "object" && data.linkJoin.link) {
      linkJoinUrl = data.linkJoin.link; // Lấy URL từ object
    }
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-1">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Thông tin nhóm
      </h4>
      <InfoRow label="Tên nhóm" value={data.name} />
      <InfoRow
        label="Thành viên"
        value={`${data.totalMember || data.memberNum || 0} người`}
      />
      <InfoRow label="Quản trị" value={admins} />
      <InfoRow
        label="Chế độ"
        value={data.isReadOnly ? "Chỉ Admin gửi tin" : "Công khai"}
      />

      {/* [FIX] Truyền chuỗi URL đã xử lý */}
      <InfoRow
        label="Link tham gia"
        value={linkJoinUrl}
        isLink={linkJoinUrl !== "Không có"}
      />

      <InfoRow label="Group ID" value={data.groupId || data.id} />
      <div className="pt-2">
        <span className="text-xs text-gray-500 block mb-1">Mô tả:</span>
        <p className="text-sm text-gray-800 bg-white p-2 rounded border border-gray-200 min-h-[40px]">
          {data.desc || "Chưa có mô tả"}
        </p>
      </div>
    </div>
  );
};

export function ConversationInfoPanel({
  bot,
  thread,
  onClose,
}: ConversationInfoPanelProps) {
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "raw">("info");

  const fetchDetails = async () => {
    if (!bot || !thread) return;
    setIsLoading(true);
    try {
      // Gọi Action mới: Lấy data từ DB hoặc Fetch Fresh từ API
      const res = await getThreadDetailsAction(bot.id, thread.uuid);
      if (res.success) {
        setDetails(res.data);
      } else {
        console.error(res.error);
      }
    } catch (error) {
      console.error("Fetch Details Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch lần đầu khi mở panel
  useEffect(() => {
    fetchDetails();
  }, [bot, thread]);

  if (!thread) return null;

  return (
    <div className="w-[350px] bg-white border-l border-gray-200 flex flex-col h-full shadow-xl animate-slide-in-right z-50">
      {/* Header */}
      <div className="h-[64px] border-b border-gray-100 flex items-center justify-between px-4 bg-white sticky top-0 z-10">
        <h3 className="font-bold text-gray-800 text-base">
          Thông tin hội thoại
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchDetails}
            disabled={isLoading}
            className={`p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-all ${
              isLoading ? "animate-spin text-blue-500" : ""
            }`}
            title="Cập nhật dữ liệu mới nhất"
          >
            <IconRefresh className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin bg-white">
        {/* Avatar Section */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 mb-3 shadow-sm rounded-full p-1 bg-white border border-gray-100 flex justify-center items-center">
            <Avatar
              src={thread.avatar}
              name={thread.name}
              size="xl"
              isGroup={thread.type === 1}
            />
          </div>
          <h2 className="text-lg font-bold text-gray-900 text-center line-clamp-2 px-4">
            {thread.name}
          </h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full mt-1 ${
              thread.type === 1
                ? "bg-blue-100 text-blue-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {thread.type === 1 ? "Nhóm trò chuyện" : "Cá nhân"}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          <button
            className={`flex-1 pb-2 text-sm font-medium ${
              activeTab === "info"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("info")}
          >
            Thông tin
          </button>
          <button
            className={`flex-1 pb-2 text-sm font-medium ${
              activeTab === "raw"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("raw")}
          >
            JSON Raw
          </button>
        </div>

        {/* Body */}
        {isLoading && !details ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            Đang tải dữ liệu...
          </div>
        ) : details ? (
          <>
            {activeTab === "info" && (
              <div className="animate-fade-in">
                {thread.type === 1 ? (
                  <GroupInfoView data={details} />
                ) : (
                  <PrivateInfoView data={details} />
                )}
                <div className="mt-4 text-[10px] text-gray-400 text-center">
                  Dữ liệu cập nhật lúc:{" "}
                  {new Date(details._fetchedAt || Date.now()).toLocaleString()}
                </div>
              </div>
            )}

            {activeTab === "raw" && (
              <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto animate-fade-in">
                <pre className="text-[10px] text-green-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(details, null, 2)}
                </pre>
              </div>
            )}
          </>
        ) : (
          <div className="py-10 text-center text-gray-400 text-sm">
            Chưa có dữ liệu chi tiết. <br /> Bấm nút Refresh để tải.
          </div>
        )}
      </div>
    </div>
  );
}
