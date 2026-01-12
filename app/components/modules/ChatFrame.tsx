/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  getMessagesAction,
  sendMessageAction,
  uploadMediaAction,
} from "@/lib/actions/chat.actions";
import { NormalizedContent } from "@/lib/types/zalo.types";
import { useStaffAuth } from "@/lib/hooks/useWorkSession";
import { Icons } from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
// [FIX] Sử dụng default export vì lib/supabaseClient.ts export default instance
import supabase from "@/lib/supabaseClient";

// --- TYPES ---
// Định nghĩa lại Message cho UI (Merge giữa Raw DB & Relations)
interface MessageUI {
  id: string;
  conversation_id: string;
  sender_id: string; // Identity ID
  sender_type: "customer" | "bot" | "staff" | "system"; // Added 'system'
  content: NormalizedContent;
  sent_at: string;

  // Relations
  sender_identity?: {
    id: string;
    display_name?: string; // Tên hiển thị ưu tiên
    name?: string; // Tên gốc
    avatar?: string;
    type?: string;
  };
  staff_accounts?: {
    full_name?: string;
    avatar?: string;
  };

  // Fields bổ sung từ DB (nếu có)
  bot_send_id?: string; // ID của bot thực hiện gửi (đối với staff/system/bot)
}

interface ChatFrameProps {
  botId: string; // Active Bot ID
  threadId: string; // UUID Conversation
  displayThreadId?: string;
  threadName: string;
  threadAvatar: string;
  onToggleDetails?: () => void;
}

// --- SUB-COMPONENT: MESSAGE BUBBLE ---
const MessageBubble = ({
  msg,
  activeBotId,
}: {
  msg: MessageUI;
  activeBotId: string;
}) => {
  const content = msg.content;
  const time = new Date(msg.sent_at).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  let isRightSide = false;

  if (msg.sender_type === "bot") {
    isRightSide = msg.sender_id === activeBotId;
  } else if (msg.sender_type === "staff" || msg.sender_type === "system") {
    isRightSide = msg.bot_send_id === activeBotId;
  }
  // Customer luôn bên trái

  // 2. Resolve Display Info (Name & Avatar)
  let displayName = "Người dùng";
  let avatarUrl = "";

  if (msg.sender_type === "customer") {
    displayName =
      msg.sender_identity?.display_name ||
      msg.sender_identity?.name ||
      "Khách hàng";
    avatarUrl = msg.sender_identity?.avatar || "";
  } else if (msg.sender_type === "staff") {
    displayName = msg.staff_accounts?.full_name || "Nhân viên";
    avatarUrl = msg.staff_accounts?.avatar || "";
  } else if (msg.sender_type === "bot") {
    displayName = msg.sender_identity?.display_name || "Bot";
    avatarUrl = msg.sender_identity?.avatar || "";
  } else if (msg.sender_type === "system") {
    displayName = "Hệ thống";
    // System có thể không cần avatar hoặc dùng icon default
  }

  // 3. Render Content Logic
  // 3. Render Content Logic
  const renderContent = () => {
    if (!content) return <div>[Lỗi hiển thị]</div>;
    const type = content.type || "text";
    const data = content.data || {};

    switch (type) {
      case "text":
        return (
          <div className="whitespace-pre-wrap break-words">{data.text}</div>
        );
      case "image":
        return (
          <div className="max-w-xs">
            <img
              src={data.url}
              alt="sent"
              className="rounded-lg w-full h-auto"
              loading="lazy"
            />
          </div>
        );
      case "sticker":
        return (
          <img
            src={data.url || data.stickerUrl}
            alt="sticker"
            className="w-24 h-24 object-contain"
          />
        );
      default:
        return <div className="italic text-sm">[Tin nhắn {type}]</div>;
    }
  };

  // 4. Styles
  const bubbleClass = isRightSide
    ? "bg-blue-600 text-white rounded-tr-none"
    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none";

  // Style đặc biệt cho System Message
  const systemStyle =
    msg.sender_type === "system"
      ? "border-2 border-yellow-500/50 bg-yellow-900/10 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300"
      : "";

  return (
    <div
      className={`flex gap-3 mb-4 ${
        isRightSide ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar (Luôn hiện, trừ khi là System có thể ẩn nếu muốn) */}
      <Avatar
        src={avatarUrl}
        name={displayName}
        className="w-8 h-8 flex-shrink-0 mt-1"
      />

      <div
        className={`flex flex-col max-w-[70%] ${
          isRightSide ? "items-end" : "items-start"
        }`}
      >
        {/* Name Label (Hiện cho Staff, Customer, Other Bots. Ẩn cho Current Bot để gọn?) */}
        {/* User yêu cầu: Staff hiển thị tên. Customer hiển thị tên. */}
        <span className="text-[10px] text-gray-500 mb-1 px-1">
          {displayName} {msg.sender_type === "staff" && " (NV)"}
        </span>

        <div
          className={`px-4 py-2 rounded-2xl shadow-sm ${bubbleClass} ${systemStyle}`}
        >
          {renderContent()}
        </div>

        <span className="text-[9px] text-gray-400 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

export default function ChatFrame({
  botId,
  threadId,
  threadName,
  threadAvatar,
  onToggleDetails,
}: ChatFrameProps) {
  const [messages, setMessages] = useState<MessageUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { staff } = useStaffAuth();

  // 1. Fetch Messages
  const fetchMessages = useCallback(async () => {
    if (!botId || !threadId) return;
    setLoading(true);
    try {
      const data = await getMessagesAction(botId, threadId);
      // [SAFEGUARD] Nếu data null hoặc rỗng, set mảng rỗng
      setMessages(Array.isArray(data) ? (data as any) : []);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Fetch msg error:", error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [botId, threadId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 2. Realtime Subscription
  useEffect(() => {
    if (!botId || !threadId) return;

    // Kênh realtime lắng nghe bảng messages
    const channel = supabase
      .channel(`chat_room:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${threadId}`,
        },
        async (payload) => {
          const newMsg = payload.new as MessageUI;

          // [OPTIMIZATION]
          // Payload realtime chỉ trả về dữ liệu thô (raw row).
          // Ta cần join để lấy thông tin sender_identity hoặc staff_accounts để hiển thị đẹp.
          // Tuy nhiên, để nhanh, ta có thể fake tạm info nếu biết logic, hoặc fetch lại single row.
          // Ở đây chấp nhận hiển thị thô tạm thời, hoặc reload nhẹ.
          // Để UX tốt nhất: Ta add vào list, nếu thiếu info Avatar thì nó sẽ hiện Placeholder.

          setMessages((prev) => {
            // Tránh duplicate nếu mình vừa gửi (cần logic optimistic ID nếu làm kỹ)
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          scrollToBottom();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [botId, threadId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 3. Handle Send Text
  const handleSendMessage = async () => {
    if (!inputText.trim() || !staff?.id) return;
    const contentToSend: NormalizedContent = {
      type: "text",
      data: { text: inputText },
    };
    await processSend(contentToSend);
    setInputText("");
  };

  // 4. Handle Upload & Send Media
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !staff?.id) return;

    setIsUploading(true);
    try {
      // Determine type
      let type: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      // Step A: Upload
      const uploadRes = await uploadMediaAction(botId, formData);
      if (!uploadRes.success || !uploadRes.data) {
        throw new Error(uploadRes.error || "Upload failed");
      }

      // Step B: Construct Content
      // uploadRes.data trả về raw response của Zalo (ví dụ: { photoId: "...", url: "..." })
      // Ta cần map nó vào NormalizedContent
      // Vì cấu trúc trả về khác nhau tùy type, đây là mapping cơ bản:
      const mediaData = uploadRes.data;
      const contentToSend: NormalizedContent = {
        type: type as any,
        data: {
          ...mediaData, // Spread các trường ID, URL
          url: mediaData.url || mediaData.href || "", // Fallback
        },
      };

      // Step C: Send
      await processSend(contentToSend);
    } catch (error) {
      alert("Lỗi gửi file: " + String(error));
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const processSend = async (content: NormalizedContent) => {
    if (!staff?.id) return;
    setIsSending(true);
    try {
      // Gửi tin nhắn
      const res = await sendMessageAction(
        staff.id,
        botId,
        content,
        threadId,
        0,
      );
      if (!res.success) alert("Gửi thất bại: " + res.error);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="h-16 border-b flex items-center px-4 justify-between bg-white dark:bg-gray-900 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar src={threadAvatar} name={threadName} className="w-10 h-10" />
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              {threadName}
            </h3>
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Realtime Active
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              title="Thông tin hội thoại"
            >
              <Icons.Info className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950">
        {loading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            Đang tải tin nhắn...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400 flex-col gap-2">
            <span>💬</span>
            <span>Chưa có tin nhắn nào</span>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} activeBotId={botId} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-gray-900 border-t">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <input
            className="flex-1 bg-gray-100 dark:bg-gray-800 dark:text-white p-3 rounded-full outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Nhập tin nhắn..."
            disabled={isSending}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isSending}
            className={`p-3 rounded-full transition-colors ${
              !inputText.trim()
                ? "bg-gray-200 text-gray-400"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isSending ? (
              <Icons.Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Icons.Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <div className="text-center mt-2 text-[10px] text-gray-400">
          Enter để gửi
        </div>
      </div>
    </div>
  );
}
