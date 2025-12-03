"use client";

/**
 * app/components/modules/ChatFrame.tsx
 * [REFACTORED & CLEANED]
 * - Loại bỏ logic Test/Debug cũ.
 * - Loại bỏ tính năng Vocabulary (EdTech).
 * - Tối ưu cho Multi-Bot CRM.
 */

import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";
import {
  ThreadInfo,
  ZaloMessage,
  UserCacheEntry,
  ZaloAttachmentContent,
  ZaloStickerContent,
  ZaloVoiceContent,
  ZaloVideoContent,
} from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconInfo, IconSend } from "@/app/components/ui/Icons";
import { StyledText } from "@/app/components/ui/StyledText";
import { ZaloStyle } from "@/lib/utils/text-renderer";

// --- SUB-COMPONENTS HIỂN THỊ TIN NHẮN ---

const PhotoMessage = ({ content }: { content: any }) => (
  <div className="overflow-hidden rounded-lg bg-black/20">
    {/* Hỗ trợ cả cấu trúc cũ (href) và mới (data.url) */}
    <img
      src={
        content.data?.url ||
        content.data?.thumbnail ||
        content.href ||
        content.thumb
      }
      alt="Photo"
      className="max-h-64 w-auto object-contain"
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  </div>
);

const StickerMessage = ({ content }: { content: any }) => (
  <div className="flex flex-col items-center rounded-lg bg-yellow-100/10 p-3">
    <img
      src={content.data?.url || content.url}
      alt="Sticker"
      className="w-24 h-24 object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
    {!content.url && <span className="text-4xl">🐱</span>}
  </div>
);

const VoiceMessage = ({ content }: { content: ZaloVoiceContent }) => (
  <div className="flex items-center gap-3 rounded-lg bg-gray-600 p-3 min-w-[200px]">
    <div className="p-2 bg-gray-500 rounded-full">
      <span className="text-xl">🎤</span>
    </div>
    <div className="flex flex-col flex-1">
      <span className="text-xs text-gray-300 mb-1">Tin nhắn thoại</span>
      <audio controls src={content.href} className="h-8 w-full" />
    </div>
  </div>
);

const VideoMessage = ({ content }: { content: ZaloVideoContent }) => (
  <div className="overflow-hidden rounded-lg bg-black">
    <video
      controls
      poster={content.thumb}
      className="max-h-64 w-full max-w-xs object-contain"
    >
      <source src={content.href} type="video/mp4" />
      Trình duyệt không hỗ trợ thẻ video.
    </video>
  </div>
);

const LinkMessage = ({ content }: { content: ZaloAttachmentContent }) => (
  <a
    href={content.href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex flex-col overflow-hidden rounded-lg bg-gray-900 hover:bg-gray-950 transition-colors border border-gray-700 max-w-sm"
  >
    {content.thumb && (
      <img
        src={content.thumb}
        alt="Thumb"
        className="h-32 w-full object-cover"
      />
    )}
    <div className="p-3">
      <h4 className="font-bold text-blue-400 truncate text-sm">
        {content.title || content.href}
      </h4>
      <p className="text-xs text-gray-400 line-clamp-2 mt-1">
        {content.description}
      </p>
    </div>
  </a>
);

const ReplyBlock = ({
  quote,
}: {
  quote: NonNullable<ZaloMessage["data"]["quote"]>;
}) => (
  <div className="mb-1 flex flex-col border-l-2 border-gray-400 bg-black/10 pl-2 py-1 text-xs text-gray-300">
    <span className="font-bold">{quote.fromD}</span>
    <span className="truncate italic opacity-80">
      {quote.msg || "[Đính kèm]"}
    </span>
  </div>
);

// --- COMPONENT CHÍNH ---

export function ChatFrame({
  thread,
  messages,
  onSendMessage,
  onToggleDetails,
  isEchoBotEnabled,
  onToggleEchoBot,
  isSendingMessage,
  onSetError,
  userCache,
}: {
  thread: ThreadInfo | null;
  messages: ZaloMessage[];
  onSendMessage: (content: string) => Promise<void>;
  onToggleDetails: () => void;
  isEchoBotEnabled: boolean;
  onToggleEchoBot: (e: ChangeEvent<HTMLInputElement>) => void;
  isSendingMessage: boolean;
  onSetError: (message: string | null) => void;
  userCache: Record<string, UserCacheEntry>;
}) {
  const [messageContent, setMessageContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || isSendingMessage || !thread) return;
    const contentToSend = messageContent;
    setMessageContent("");
    await onSendMessage(contentToSend);
  };

  // Render nội dung tin nhắn
  const renderMessageBody = (msg: ZaloMessage) => {
    // [DEBUG] Log cấu trúc tin nhắn để kiểm tra
    // console.log("Rendering Msg:", msg);

    const { msgType, content } = msg.data;
    const safeContent = content as any;

    try {
      // 1. TEXT (webchat hoặc chat.text)
      if (msgType === "webchat" || msgType === "chat.text") {
        // Hỗ trợ cả cấu trúc Normalized (type: 'text', text: '...') và Raw Zalo
        const text =
          safeContent.type === "text"
            ? safeContent.text
            : safeContent.title || safeContent.msg || safeContent;

        return (
          <StyledText
            text={typeof text === "string" ? text : JSON.stringify(text)}
            className="text-white text-sm"
          />
        );
      }

      // 2. STICKER
      if (msgType === "chat.sticker" || safeContent.type === "sticker") {
        return <StickerMessage content={safeContent} />;
      }

      // 3. PHOTO
      if (msgType === "chat.photo" || safeContent.type === "photo") {
        return <PhotoMessage content={safeContent} />;
      }

      // 4. Default / Fallback / Debug
      return (
        <div className="flex flex-col gap-1 min-w-[150px]">
          <span className="text-xs text-yellow-500 font-bold uppercase">
            {msgType || safeContent.type || "Unknown Type"}
          </span>
          <pre className="text-[10px] text-gray-400 bg-black/30 p-2 rounded overflow-x-auto max-w-xs">
            {JSON.stringify(safeContent, null, 2)}
          </pre>
        </div>
      );
    } catch (e) {
      return <div className="text-red-500 text-xs">Render Error</div>;
    }
  };

  if (!thread) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center bg-gray-800 text-gray-500 gap-4">
        <div className="w-24 h-24 bg-gray-700/50 rounded-full flex items-center justify-center">
          <span className="text-4xl">💬</span>
        </div>
        <p>Chọn một hội thoại để bắt đầu chat</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-gray-800 relative">
      {/* Header */}
      <header className="flex h-[72px] items-center justify-between border-b border-gray-700 px-6 py-4 bg-gray-900/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar
              src={thread.avatar}
              alt={thread.name}
              isGroup={thread.type === 1}
            />
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full"></div>
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              {thread.name}
            </h2>
            <p className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              Online
            </p>
          </div>
        </div>

        <button
          onClick={onToggleDetails}
          className="p-2 text-gray-400 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
        >
          <IconInfo className="h-6 w-6" />
        </button>
      </header>

      {/* 2. Message Log */}
      <div className="flex-1 space-y-6 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700">
        {messages.map((msg, index) => {
          // Resolve Sender info from Cache
          const senderInfo = userCache[msg.data.uidFrom];
          const senderName =
            senderInfo?.name ||
            msg.data.dName ||
            (msg.isSelf ? "Tôi" : "Người lạ");
          const showAvatar = thread.type === 1 && !msg.isSelf;

          return (
            <div
              key={(msg.data.msgId || index) + "_" + index}
              className={`flex max-w-[85%] gap-3 ${
                msg.isSelf ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
            >
              <div className="flex-shrink-0 w-8">
                {showAvatar && (
                  <Avatar
                    src={senderInfo?.avatar || ""}
                    alt={senderName}
                    isGroup={false}
                  />
                )}
              </div>

              <div
                className={`flex flex-col ${
                  msg.isSelf ? "items-end" : "items-start"
                }`}
              >
                {/* Sender Name (Group only) */}
                {thread.type === 1 && !msg.isSelf && (
                  <span className="text-[10px] text-gray-400 mb-1 ml-1">
                    {senderName}
                  </span>
                )}

                {/* Bubble */}
                <div
                  className={`relative rounded-2xl px-4 py-2 shadow-sm ${
                    msg.isSelf
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-gray-700 text-gray-100 rounded-tl-sm"
                  }`}
                >
                  {renderMessageBody(msg)}
                </div>

                {/* Time */}
                <span className="text-[9px] text-gray-500 mt-1 mx-1">
                  {new Date(parseInt(msg.data.ts, 10)).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Input Area */}
      <div className="p-4 bg-gray-900 border-t border-gray-700">
        <form
          onSubmit={handleFormSubmit}
          className="flex items-end gap-2 bg-gray-800 p-2 rounded-xl border border-gray-700 focus-within:border-blue-500 transition-colors"
        >
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder={`Nhập tin nhắn...`}
            rows={1}
            className="flex-1 bg-transparent text-white text-sm px-2 py-2.5 focus:outline-none resize-none max-h-32"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleFormSubmit(e);
              }
            }}
            style={{ minHeight: "44px" }}
          />
          <button
            type="submit"
            disabled={isSendingMessage || !messageContent.trim()}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all self-end mb-[1px]"
          >
            <IconSend className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
