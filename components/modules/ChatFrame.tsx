/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import {
  getMessagesAction,
  sendMessageAction,
} from "@/lib/actions/chat.actions";
import { NormalizedContent } from "@/lib/types/zalo.types";
import { useStaffAuth } from "@/hooks/useWorkSession";
import { useZaloRichText } from "@/hooks/useZaloRichText";
import { Icons } from "@/components/ui/Icons";
import { Avatar } from "@/components/ui/Avatar";
import { useSSE } from "@/context/SSEContext";
import { useMediaUploader } from "@/hooks/useMediaUploader"; // [NEW] Hook xử lý upload
import { VoiceRecorder } from "./chat/VoiceRecorder"; // [NEW] Component ghi âm

// --- TYPES ---
type SSEMessagePayload = {
  id: string;
  conversation_id: string;
  content: any;
  sent_at: string;
  flags: any;
  sender: {
    id: string;
    type: string;
    name: string;
    avatar: string;
    is_self: boolean;
  };
  context: {
    bot_id: string;
    thread_id: string;
  };
};

interface MessageUI {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "customer" | "bot" | "staff" | "system";
  content: NormalizedContent | any;
  sent_at: string;
  flags?: { is_undo?: boolean; undo_at?: string; status?: string };
  sender_identity?: {
    id: string;
    display_name?: string;
    name?: string;
    avatar?: string;
    type?: string;
  };
  staff_accounts?: { full_name?: string; avatar?: string };
  bot_send_id?: string;
}

interface ChatFrameProps {
  botId: string;
  threadId: string;
  displayThreadId?: string;
  threadName: string;
  threadAvatar: string;
  onToggleDetails?: () => void;
}

// --- HELPERS ---
const formatBytes = (bytes: any, decimals = 2) => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
};

// --- SUB-COMPONENTS ---
const VoiceMessagePlayer = ({
  src,
  durationMs,
}: {
  src: string;
  durationMs: number;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000 || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (
        audio.duration &&
        !isNaN(audio.duration) &&
        audio.duration !== Infinity
      ) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(console.error);
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div className="flex items-center gap-2 min-w-[200px] p-1 select-none">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 text-xs"
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <div className="flex flex-col flex-1 gap-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          onClick={(e) => e.stopPropagation()}
          className="w-full h-1 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-[9px] text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

const ImageViewer = ({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-white/20 rounded-full text-white"
      >
        {Icons.Close ? (
          <Icons.Close className="w-6 h-6" />
        ) : (
          <span className="text-xl font-bold">×</span>
        )}
      </button>
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt="Full screen"
          className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
        />
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-[-3rem] left-1/2 -translate-x-1/2 text-white/80 hover:text-white text-sm flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20"
        >
          {Icons.Download ? (
            <Icons.Download className="w-4 h-4" />
          ) : (
            <span>⬇</span>
          )}{" "}
          Mở ảnh gốc
        </a>
      </div>
    </div>
  );
};

const MessageBubble = ({
  msg,
  activeBotId,
  onImageClick,
}: {
  msg: MessageUI;
  activeBotId: string;
  onImageClick: (src: string) => void;
}) => {
  const { renderZaloText } = useZaloRichText();
  const content = msg.content || {};
  const time = new Date(msg.sent_at).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isRevoked = msg.flags?.is_undo;

  let isRightSide = false;
  if (msg.sender_type === "bot") isRightSide = msg.sender_id === activeBotId;
  else if (msg.sender_type === "staff" || msg.sender_type === "system")
    isRightSide = true;

  let displayName = "Người dùng",
    avatarUrl = "";
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
  } else if (msg.sender_type === "system") displayName = "Hệ thống";

  const renderContentCore = () => {
    const type = content.type || "text";
    const payload = content.content || content.data || {};

    switch (type) {
      case "text":
      case "html":
      case "webchat":
        return (
          <div className="whitespace-pre-wrap break-words min-w-[20px]">
            {renderZaloText(payload.text || "", payload.styles || [])}
          </div>
        );
      case "image":
      case "chat.photo":
      case "chat.doodle":
        const imgSrc = payload.url || payload.thumb;
        return (
          <div className="flex flex-col gap-1">
            <div
              className="relative group cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
              onClick={() => onImageClick(imgSrc)}
            >
              <img
                src={imgSrc}
                alt="image"
                className="max-w-[280px] h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            {payload.caption && (
              <span className="text-xs opacity-80">{payload.caption}</span>
            )}
          </div>
        );
      case "sticker":
      case "chat.sticker":
        return (
          <img
            src={payload.url || payload.stickerUrl}
            alt="sticker"
            className="w-28 h-28 object-contain"
          />
        );
      case "voice":
      case "chat.voice":
      case "audio":
        return (
          <VoiceMessagePlayer src={payload.url} durationMs={payload.duration} />
        );
      case "video":
      case "chat.video.msg":
        return (
          <div className="flex flex-col gap-1 max-w-[280px]">
            <video
              controls
              src={payload.url}
              poster={payload.thumb}
              className="rounded-lg w-full h-auto bg-black"
            />
            {payload.caption && (
              <span className="text-xs opacity-80">{payload.caption}</span>
            )}
          </div>
        );
      case "file":
      case "share.file":
      case "chat.file":
        return (
          <a
            href={payload.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 hover:bg-gray-100 max-w-[280px]"
          >
            <div className="w-10 h-10 flex-shrink-0 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xs uppercase">
              {payload.fileType || "FILE"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span
                className="font-medium text-sm truncate w-full text-gray-800 dark:text-gray-200"
                title={payload.fileName}
              >
                {payload.fileName || "File đính kèm"}
              </span>
              <span className="text-xs text-gray-500">
                {formatBytes(payload.fileSize)}
              </span>
            </div>
            {Icons.Download ? (
              <Icons.Download className="w-5 h-5 text-gray-400 ml-auto" />
            ) : (
              <Icons.Paperclip className="w-5 h-5 text-gray-400 ml-auto" />
            )}
          </a>
        );
      case "link":
      case "chat.recommended":
        return (
          <a
            href={payload.url}
            target="_blank"
            rel="noreferrer"
            className="block max-w-[280px] bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90"
          >
            {payload.thumb && (
              <img
                src={payload.thumb}
                alt="preview"
                className="w-full h-32 object-cover"
              />
            )}
            <div className="p-3">
              <h4 className="font-semibold text-sm line-clamp-2 mb-1">
                {payload.title || payload.url}
              </h4>
              {payload.desc && (
                <p className="text-xs text-gray-500 line-clamp-2">
                  {payload.desc}
                </p>
              )}
            </div>
          </a>
        );
      default:
        return (
          <div className="italic text-xs opacity-60">
            [Tin nhắn {type} chưa hỗ trợ]
          </div>
        );
    }
  };

  const bubbleClass = isRightSide
    ? "bg-blue-600 text-white rounded-tr-none"
    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none";
  return (
    <div
      className={`flex gap-3 mb-4 ${
        isRightSide ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <Avatar
        src={avatarUrl}
        name={displayName}
        className="w-8 h-8 flex-shrink-0 mt-1"
      />
      <div
        className={`flex flex-col max-w-[75%] ${
          isRightSide ? "items-end" : "items-start"
        }`}
      >
        <span className="text-[10px] text-gray-500 mb-1 px-1">
          {displayName} {msg.sender_type === "staff" && " (NV)"}
        </span>
        <div
          className={`px-4 py-2 rounded-2xl shadow-sm relative ${bubbleClass} ${
            isRevoked ? "opacity-70 border border-red-300" : ""
          }`}
        >
          {renderContentCore()}
          {isRevoked && (
            <div className="mt-1 pt-1 border-t border-gray-300/30 flex items-center gap-1.5">
              <span className="text-[10px] italic">Tin nhắn đã bị thu hồi</span>
            </div>
          )}
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
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isLowContent, setIsLowContent] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);

  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isPrependingRef = useRef(false);

  const { staff } = useStaffAuth();
  const { subscribe, unsubscribe } = useSSE();
  const { sendMedia, isUploading } = useMediaUploader(botId, threadId);

  // 1. Initial Load
  useEffect(() => {
    const initThread = async () => {
      if (!botId || !threadId) return;
      setLoading(true);
      try {
        const data = await getMessagesAction(botId, threadId, undefined);
        const sortedData = Array.isArray(data) ? (data as any[]).reverse() : [];
        setMessages(sortedData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    initThread();
  }, [botId, threadId]);

  // Check content height on every render to toggle layout
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setIsLowContent(container.scrollHeight <= container.clientHeight);
    }
  }, [messages, loading]);

  // 2. Scroll Handler
  const handleScroll = async () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isScrollable = container.scrollHeight > container.clientHeight;
    if (isScrollable && Math.abs(container.scrollTop) > 200) {
      if (!showScrollBottomBtn) setShowScrollBottomBtn(true);
    } else if (showScrollBottomBtn) {
      setShowScrollBottomBtn(false);
      setHasNewMessage(false);
    }

    // Load more logic
    if (loadingMore || !isScrollable) return;
    const distanceToTop =
      container.scrollHeight -
      container.clientHeight -
      Math.abs(container.scrollTop);

    if (distanceToTop < 100) {
      setLoadingMore(true);
      isPrependingRef.current = true;
      prevScrollHeightRef.current = container.scrollHeight;

      try {
        const oldestMsg = messages[messages.length - 1];
        if (!oldestMsg?.sent_at) return;
        const moreData = await getMessagesAction(
          botId,
          threadId,
          oldestMsg.sent_at,
        );
        if (Array.isArray(moreData) && moreData.length > 0) {
          setMessages((prev) => [...prev, ...moreData.reverse()]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // 3. Scroll Preservation
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (container && isPrependingRef.current && !loadingMore) {
      const diff = container.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) container.scrollTop = container.scrollTop - diff;
      isPrependingRef.current = false;
    }
  }, [messages, loadingMore]);

  // 2. SSE Handler (Realtime Update)
  useEffect(() => {
    const handleSSEMessage = (payload: any) => {
      if (!payload || payload.conversation_id !== threadId) return;

      // Update Message List
      setMessages((prev) => {
        // Check exists to avoid duplicates
        const exists = prev.find((m) => m.id === payload.id);
        if (exists) {
          // Update existing (e.g., status sending -> sent)
          return prev.map((m) =>
            m.id === payload.id ? { ...m, ...payload } : m,
          );
        }
        // Add new (to top because reverse-flex)
        return [payload, ...prev];
      });

      // Auto Scroll logic
      const container = scrollContainerRef.current;
      if (container) {
        const isNearBottom = Math.abs(container.scrollTop) < 100;
        if (payload.sender?.is_self || isNearBottom) {
          setTimeout(
            () => container.scrollTo({ top: 0, behavior: "smooth" }),
            50,
          );
        } else {
          setHasNewMessage(true);
          setShowScrollBottomBtn(true);
        }
      }
    };
    subscribe("user_stream", "new_message", handleSSEMessage);
    return () => unsubscribe("user_stream", "new_message", handleSSEMessage);
  }, [threadId, subscribe, unsubscribe]);

  // 3. User Interactions
  const scrollToBottom = () => {
    if (scrollContainerRef.current)
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !staff?.id) return;
    const content = { type: "text", data: { text: inputText } };

    // Optimistic UI (Optional: Add placeholder to state immediately)
    // Here we rely on API 3-phase which is fast enough
    setIsSending(true);
    try {
      await sendMessageAction(staff.id, botId, content as any, threadId, 0);
      setInputText("");
    } catch (e) {
      alert("Lỗi gửi tin");
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  };

  // Media Handler (Unified)
  const handleFileUpload = async (file: File) => {
    if (!staff?.id) return;
    setShowRecorder(false); // Close recorder if open

    // Call Hook (API Route)
    const success = await sendMedia(file);

    if (success) {
      // Reset Inputs
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      scrollToBottom();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 relative">
      <div className="h-16 border-b flex items-center px-4 justify-between bg-white dark:bg-gray-900 z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Avatar src={threadAvatar} name={threadName} className="w-10 h-10" />
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              {threadName}
            </h3>
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />{" "}
              Realtime (SSE) Active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <Icons.Info className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950 flex ${
          isLowContent ? "flex-col" : "flex-col-reverse"
        }`}
        style={{ overflowAnchor: "none" }}
        onScroll={handleScroll}
      >
        {!isLowContent && loadingMore && (
          <div className="flex justify-center py-2 text-xs text-gray-400 w-full mb-2">
            <Icons.Loader className="w-4 h-4 animate-spin mr-2" /> Tải thêm...
          </div>
        )}

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
          (isLowContent ? [...messages].reverse() : messages).map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              activeBotId={botId}
              onImageClick={setZoomedImage}
            />
          ))
        )}
      </div>

      {showScrollBottomBtn && (
        <div className="absolute top-20 right-4 z-20">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs font-medium bg-gray-700 text-white opacity-90 hover:bg-gray-600"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            {hasNewMessage ? "Tin mới" : "Về cuối"}
          </button>
        </div>
      )}

      {zoomedImage && (
        <ImageViewer src={zoomedImage} onClose={() => setZoomedImage(null)} />
      )}
      {/* FOOTER INPUT */}
      <div className="p-4 bg-white dark:bg-gray-900 border-t shrink-0">
        {isUploading && (
          <div className="text-xs text-blue-500 mb-2 flex items-center gap-2 animate-pulse">
            <Icons.Loader className="w-3 h-3 animate-spin" /> Đang gửi media...
          </div>
        )}

        <div className="flex items-center gap-2 max-w-4xl mx-auto relative">
          {showRecorder ? (
            <VoiceRecorder
              onSend={handleFileUpload}
              onCancel={() => setShowRecorder(false)}
              disabled={isSending || isUploading}
            />
          ) : (
            <>
              {/* Media Button */}
              <button
                className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 text-blue-500 transition-colors"
                onClick={() => mediaInputRef.current?.click()}
                disabled={isSending || isUploading}
                title="Gửi Ảnh/Video"
              >
                <Icons.Image className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={mediaInputRef}
                accept="image/*,video/*"
                hidden
                onChange={handleFileInputChange}
              />

              {/* File Button */}
              <button
                className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || isUploading}
                title="Gửi File"
              >
                <Icons.Paperclip className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                hidden
                onChange={handleFileInputChange}
              />

              {/* Text Input */}
              <input
                className="flex-1 bg-gray-100 dark:bg-gray-800 dark:text-white p-3 rounded-full outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Nhập tin nhắn..."
                disabled={isSending || isUploading}
              />

              {/* Voice Button */}
              <button
                onClick={() => setShowRecorder(true)}
                disabled={isSending || isUploading || inputText.length > 0}
                className={`p-3 rounded-full transition-colors ${
                  inputText.length > 0
                    ? "hidden"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                }`}
                title="Gửi voice"
              >
                <Icons.Microphone className="w-5 h-5" />
              </button>

              {/* Send Button */}
              {inputText.length > 0 && (
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                >
                  {isSending ? (
                    <Icons.Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icons.Send className="w-5 h-5" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
