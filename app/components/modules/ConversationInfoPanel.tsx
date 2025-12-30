/**
 * app/components/modules/ConversationInfoPanel.tsx
 * [NEW MODULE] Dedicated Panel for Conversation CRM Info.
 * Displays: Thread Avatar, Name, Member Count (Group), CRM Profile (User).
 */

"use client";
import { useState, useEffect } from "react";
import { ZaloBot } from "@/lib/types/database.types";
import { ThreadInfo } from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconClose } from "@/app/components/ui/Icons";
import { getThreadDetailsAction } from "@/lib/actions/thread.actions";

interface ConversationInfoPanelProps {
  bot: ZaloBot | null;
  thread: ThreadInfo | null;
  onClose: () => void;
}

export function ConversationInfoPanel({
  bot,
  thread,
  onClose,
}: ConversationInfoPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchDetails = async () => {
      if (!bot || !thread) return;
      setIsLoading(true);
      try {
        const res = await getThreadDetailsAction(bot.id, thread.id);
        if (isMounted && res.success) {
          setDetails(res.data);
        }
      } catch (error) {
        console.error("Fetch CRM error:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [bot, thread]);

  if (!thread) return null;

  return (
    <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col h-full shadow-xl animate-slide-in-right z-50">
      {/* Header */}
      <div className="h-[72px] border-b border-gray-100 flex items-center justify-between px-6">
        <h3 className="font-bold text-gray-800 text-lg">Thông tin hội thoại</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
        >
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {/* Avatar & Name */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 mb-4 shadow-lg rounded-full p-1 bg-white flex justify-center items-center">
            <Avatar
              src={thread.avatar}
              alt={thread.name}
              size="xl"
              isGroup={thread.type === 1}
            />
          </div>
          <h2 className="text-xl font-bold text-gray-900 text-center line-clamp-2">
            {thread.name}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {thread.type === 1 ? "Nhóm trò chuyện" : "Khách hàng cá nhân"}
          </p>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-3 gap-2 mb-8">
          <ActionButton icon="🔔" label="Tắt tb" />
          <ActionButton icon="🔍" label="Tìm kiếm" />
          <ActionButton icon="🖼️" label="File/Ảnh" />
        </div>

        {/* Details Section */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center text-gray-400 text-sm">
              Đang tải thông tin...
            </div>
          ) : (
            <>
              {thread.type === 1 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Thông tin nhóm
                  </h4>
                  <InfoRow
                    label="Thành viên"
                    value={`${details?.membersCount || 0} người`}
                  />
                  <InfoRow
                    label="Admin"
                    value={
                      details?.admins?.length > 0 ? "Đang cập nhật" : "Không có"
                    }
                  />
                  <InfoRow
                    label="Mô tả"
                    value={details?.desc || "Chưa có mô tả"}
                  />
                </div>
              )}

              {thread.type === 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    CRM Profile
                  </h4>
                  <InfoRow label="Tags" value="---" />
                  <InfoRow label="Phone" value="---" />
                  <InfoRow label="Ghi chú" value="Chưa có ghi chú" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-components UI (Private to this module)
const ActionButton = ({ icon, label }: { icon: string; label: string }) => (
  <button className="flex flex-col items-center gap-2 p-3 hover:bg-gray-50 rounded-xl transition-colors">
    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-lg">
      {icon}
    </div>
    <span className="text-[10px] font-medium text-gray-600">{label}</span>
  </button>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] truncate">
      {value}
    </span>
  </div>
);
