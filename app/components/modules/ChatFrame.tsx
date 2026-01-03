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
  sender_id: string;
  sender_type: "customer" | "bot" | "staff";
  content: NormalizedContent;
  sent_at: string;
  is_self?: boolean;
  sender_identity?: {
    display_name?: string;
    name?: string;
    avatar?: string;
  };
  staff_accounts?: {
    full_name?: string;
    avatar?: string;
  };
}

interface ChatFrameProps {
  botId: string;
  threadId: string; // routing key (group id or user id)
  threadName: string;
  threadAvatar: string;
}

// --- SUB-COMPONENT: MESSAGE BUBBLE ---
const MessageBubble = ({
  msg,
  isMine,
}: {
  msg: MessageUI;
  isMine: boolean;
}) => {
  const content = msg.content;
  const time = new Date(msg.sent_at).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Hiển thị tên người gửi nếu là nhóm và không phải tin của mình
  const showName = !isMine;
  const displayName =
    msg.sender_type === "staff"
      ? msg.staff_accounts?.full_name || "Nhân viên"
      : msg.sender_identity?.display_name ||
        msg.sender_identity?.name ||
        "Người dùng";
  const avatarUrl =
    msg.sender_type === "staff"
      ? msg.staff_accounts?.avatar
      : msg.sender_identity?.avatar;

  // Render nội dung theo Type
  const renderContent = () => {
    switch (content.type) {
      case "text":
        return (
          <div className="whitespace-pre-wrap break-words">
            {/* Cast to any to avoid strict TS if data type varies */}
            {(content.data as any).text}
          </div>
        );

      case "image":
        const photoData = content.data as any; // Cast for UI flexibility
        const imgUrl = photoData.url?.startsWith("http")
          ? `/api/media-proxy?url=${encodeURIComponent(photoData.url)}`
          : photoData.url;
        return (
          <div className="relative max-w-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <img
              src={imgUrl}
              alt="Sent image"
              className="w-full h-auto object-cover"
              loading="lazy"
            />
            {photoData.caption && (
              <p className="p-2 text-sm bg-black/50 text-white absolute bottom-0 w-full">
                {photoData.caption}
              </p>
            )}
          </div>
        );

      case "sticker":
        // [FIX] Handle various sticker URL properties safely
        const stickerData = content.data as any;
        const stickerUrl = stickerData.url || stickerData.stickerUrl;
        return (
          <img
            src={stickerUrl}
            alt="Sticker"
            className="w-32 h-32 object-contain"
          />
        );

      case "voice":
        const voiceData = content.data as any;
        const voiceUrl = voiceData.url?.startsWith("http")
          ? `/api/media-proxy?url=${encodeURIComponent(voiceData.url)}`
          : voiceData.url;
        return (
          <div className="flex items-center gap-2 min-w-[200px]">
            <Icons.Microphone className="w-5 h-5 text-current" />
            <audio controls className="h-8 w-48 max-w-full" src={voiceUrl} />
          </div>
        );

      default:
        return (
          <div className="italic text-sm text-gray-500">
            [Tin nhắn {content.type} chưa hỗ trợ hiển thị]
          </div>
        );
    }
  };

  return (
    <div
      className={`flex gap-2 mb-4 ${isMine ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <Avatar
        src={avatarUrl}
        name={displayName}
        className="w-8 h-8 flex-shrink-0 mt-1"
      />

      <div
        className={`flex flex-col max-w-[70%] ${
          isMine ? "items-end" : "items-start"
        }`}
      >
        {showName && (
          <span className="text-xs text-gray-500 mb-1 ml-1">{displayName}</span>
        )}

        <div
          className={`px-4 py-2 rounded-2xl ${
            isMine
              ? "bg-blue-600 text-white rounded-tr-none"
              : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none"
          }`}
        >
          {renderContent()}
        </div>

        <span className="text-[10px] text-gray-400 mt-1 px-1">{time}</span>
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
      // Ép kiểu về MessageUI (Backend trả về Raw Data có join)
      setMessages(data as any);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Fetch msg error:", error);
    } finally {
      setLoading(false);
    }
  }, [botId, threadId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 2. Realtime Subscription
  useEffect(() => {
    if (!botId) return;

    // Kênh realtime lắng nghe bảng messages
    const channel = supabase
      .channel(`chat:${botId}:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          // Không filter theo conversation_id ở đây vì Supabase Realtime filter hạn chế
          // Ta filter ở callback
        },
        (payload) => {
          const newMsg = payload.new as MessageUI;
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
  }, [botId, threadId, supabase]);

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
      // Optimistic Update (Optional): Thêm tin nhắn ảo vào list ngay lập tức
      // Ở đây ta chờ Realtime phản hồi để đơn giản hóa
      const res = await sendMessageAction(
        staff.id,
        botId,
        content,
        threadId,
        0,
      );

      if (!res.success) {
        alert("Gửi thất bại: " + res.error);
      }
    } catch (error) {
      console.error("Send Error:", error);
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="h-16 border-b flex items-center px-4 justify-between bg-white dark:bg-gray-900 z-10">
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
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-950">
        {loading ? (
          <div className="text-center py-10 text-gray-400">
            Đang tải tin nhắn...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            Chưa có tin nhắn nào.
          </div>
        ) : (
          messages.map((msg) => {
            const isMine =
              msg.sender_type === "staff" ||
              (msg.sender_type === "bot" && msg.sender_id === botId);

            return <MessageBubble key={msg.id} msg={msg} isMine={isMine} />;
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-gray-900 border-t">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {/* File Upload Trigger */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-3 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            title="Đính kèm file"
          >
            {isUploading ? (
              <Icons.Loader className="w-6 h-6 animate-spin" />
            ) : (
              <Icons.Paperclip className="w-6 h-6" />
            )}
          </button>

          {/* Text Input */}
          <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 flex items-center">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Nhập tin nhắn..."
              className="w-full bg-transparent border-none focus:ring-0 outline-none resize-none max-h-32 py-2"
              rows={1}
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={(!inputText.trim() && !isUploading) || isSending}
            className={`p-3 rounded-full transition-all ${
              inputText.trim() || isUploading
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isSending ? (
              <Icons.Loader className="w-6 h-6 animate-spin" />
            ) : (
              <Icons.Send className="w-6 h-6" />
            )}
          </button>
        </div>
        <div className="text-center mt-2 text-xs text-gray-400">
          Hỗ trợ: Enter để gửi, Shift+Enter xuống dòng.
        </div>
      </div>
    </div>
  );
}
