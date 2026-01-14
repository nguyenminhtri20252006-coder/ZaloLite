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
import { useZaloRichText } from "@/lib/hooks/useZaloRichText";
import { Icons } from "@/app/components/ui/Icons";
import { Avatar } from "@/app/components/ui/Avatar";
import supabase from "@/lib/supabaseClient";

// --- HELPERS ---
const formatBytes = (bytes: any, decimals = 2) => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatDuration = (ms: any) => {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(Number(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
};

// --- TYPES ---
interface MessageUI {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "customer" | "bot" | "staff" | "system";
  content: NormalizedContent | any;
  sent_at: string;
  flags?: {
    is_undo?: boolean;
    undo_at?: string;
    status?: string;
  };

  sender_identity?: {
    id: string;
    display_name?: string;
    name?: string;
    avatar?: string;
    type?: string;
  };
  staff_accounts?: {
    full_name?: string;
    avatar?: string;
  };
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

// --- SUB-COMPONENTS (Keep VoicePlayer & ImageViewer as is) ---
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
    const handleError = (e: any) => console.error("Audio Load Error:", e);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
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
        className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex-shrink-0"
      >
        {isPlaying ? (
          <span className="font-bold text-blue-600 text-xs">❚❚</span>
        ) : (
          <span className="font-bold text-blue-600 text-xs">▶</span>
        )}
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
        <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 font-mono">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={onClose}
          className="p-2 bg-black/50 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          {Icons.Close ? (
            <Icons.Close className="w-6 h-6" />
          ) : (
            <span className="text-xl font-bold">×</span>
          )}
        </button>
      </div>
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
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
          className="absolute bottom-[-3rem] left-1/2 -translate-x-1/2 text-white/80 hover:text-white text-sm flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          onClick={(e) => e.stopPropagation()}
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

// --- MESSAGE BUBBLE ---
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
  if (msg.sender_type === "bot") {
    isRightSide = msg.sender_id === activeBotId;
  } else if (msg.sender_type === "staff" || msg.sender_type === "system") {
    isRightSide = msg.bot_send_id === activeBotId;
  }

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
  }

  const renderContentCore = () => {
    const type = content.type || "text";
    const payload = content.content || content.data || {};

    switch (type) {
      case "text":
      case "html":
      case "webchat":
        // [DEBUG LOG] Log to Console to inspect data directly
        if (payload.styles) {
          console.log(`[MessageBubble] Rendering ID ${msg.id}:`, {
            text: payload.text,
            styles: payload.styles,
          });
        }
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
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="bg-black/50 p-2 rounded-full text-white">
                  {Icons.Search ? (
                    <Icons.Search className="w-4 h-4" />
                  ) : (
                    <span>🔍</span>
                  )}
                </div>
              </div>
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
            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors max-w-[280px]"
          >
            <div className="w-10 h-10 flex-shrink-0 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xs uppercase">
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
            className="block max-w-[280px] bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-90 transition-opacity"
          >
            {payload.thumb && (
              <img
                src={payload.thumb}
                alt="link preview"
                className="w-full h-32 object-cover"
              />
            )}
            <div className="p-3">
              <h4 className="font-semibold text-sm line-clamp-2 text-gray-800 dark:text-gray-100 mb-1">
                {payload.title || payload.url}
              </h4>
              {payload.desc && (
                <p className="text-xs text-gray-500 line-clamp-2">
                  {payload.desc}
                </p>
              )}
              <span className="text-[10px] text-blue-500 mt-2 block truncate">
                {new URL(payload.url || "http://localhost").hostname}
              </span>
            </div>
          </a>
        );

      default:
        return (
          <div className="italic text-xs opacity-60">
            [Tin nhắn {type} chưa hỗ trợ hiển thị]
          </div>
        );
    }
  };

  const revokedStyle = isRevoked
    ? "border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10"
    : "";
  const bubbleClass = isRightSide
    ? "bg-blue-600 text-white rounded-tr-none"
    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none";
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
          className={`px-4 py-2 rounded-2xl shadow-sm relative ${bubbleClass} ${systemStyle} ${revokedStyle}`}
        >
          <div className={isRevoked ? "opacity-70" : ""}>
            {renderContentCore()}
          </div>
          {isRevoked && (
            <div
              className={`mt-1 pt-1 border-t ${
                isRightSide
                  ? "border-blue-400/30"
                  : "border-gray-300 dark:border-gray-600"
              } flex items-center gap-1.5`}
            >
              <div className="w-3 h-3 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">!</span>
              </div>
              <span
                className={`text-[10px] italic font-medium ${
                  isRightSide ? "text-blue-100" : "text-red-500"
                }`}
              >
                Tin nhắn đã bị thu hồi
              </span>
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
  const [messages, setMessages] = useState<MessageUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { staff } = useStaffAuth();

  const fetchMessages = useCallback(async () => {
    if (!botId || !threadId) return;
    setLoading(true);
    try {
      const data = await getMessagesAction(botId, threadId);
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

  useEffect(() => {
    if (!botId || !threadId) return;
    const channel = supabase
      .channel(`chat_room:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${threadId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as MessageUI;
            setMessages((prev) => {
              if (prev.find((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            scrollToBottom();
          } else if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as MessageUI;
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)),
            );
          }
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

  const handleSendMessage = async () => {
    if (!inputText.trim() || !staff?.id) return;
    const contentToSend: NormalizedContent = {
      type: "text",
      data: { text: inputText },
    };
    await processSend(contentToSend);
    setInputText("");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !staff?.id) return;
    setIsUploading(true);
    try {
      let type: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const uploadRes = await uploadMediaAction(botId, formData);
      if (!uploadRes.success || !uploadRes.data)
        throw new Error(uploadRes.error || "Upload failed");

      const mediaData = uploadRes.data;
      const contentToSend: NormalizedContent = {
        type: type as any,
        data: { ...mediaData, url: mediaData.url || mediaData.href || "" },
      };
      await processSend(contentToSend);
    } catch (error) {
      alert("Lỗi gửi file: " + String(error));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const processSend = async (content: NormalizedContent) => {
    if (!staff?.id) return;
    setIsSending(true);
    try {
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
      <div className="h-16 border-b flex items-center px-4 justify-between bg-white dark:bg-gray-900 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar src={threadAvatar} name={threadName} className="w-10 h-10" />
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              {threadName}
            </h3>
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />{" "}
              Realtime Active
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
            <MessageBubble
              key={msg.id}
              msg={msg}
              activeBotId={botId}
              onImageClick={(src) => setZoomedImage(src)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      {zoomedImage && (
        <ImageViewer src={zoomedImage} onClose={() => setZoomedImage(null)} />
      )}
      <div className="p-4 bg-white dark:bg-gray-900 border-t">
        {isUploading && (
          <div className="text-xs text-blue-500 mb-2 flex items-center gap-2">
            <Icons.Loader className="w-3 h-3 animate-spin" /> Đang tải lên
            media...
          </div>
        )}
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <button
            className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
          >
            <Icons.Paperclip className="w-5 h-5 text-gray-500" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
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
      </div>
    </div>
  );
}
