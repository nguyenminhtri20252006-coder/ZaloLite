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

const PhotoMessage = ({ content }: { content: ZaloAttachmentContent }) => (
  <div className="overflow-hidden rounded-lg bg-black/20">
    <img
      src={content.thumb || content.href}
      alt="Photo"
      className="max-h-64 w-auto object-contain"
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  </div>
);

const StickerMessage = ({ content }: { content: ZaloStickerContent }) => (
  <div className="flex flex-col items-center rounded-lg bg-yellow-100/10 p-3">
    <img
      src={content.url}
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
  // Loại bỏ các props cũ (test, vocab) để code sạch hơn
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
  // Giữ lại props tương thích nhưng không dùng (hoặc nên xóa ở BotInterface sau)
  onSendVocabulary?: any;
  isSendingVocab?: any;
  isSendingMessage: boolean;
  onSetError: (message: string | null) => void;
  userCache: Record<string, UserCacheEntry>;
}) {
  const [messageContent, setMessageContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || isSendingMessage || !thread) return;

    const contentToSend = messageContent;
    setMessageContent(""); // Optimistic clear
    await onSendMessage(contentToSend);
  };

  // Render nội dung tin nhắn
  const renderMessageBody = (msg: ZaloMessage) => {
    const { msgType, content, quote } = msg.data;

    const renderContent = () => {
      // 1. Text & Rich Text
      if (msgType === "webchat") {
        let text = "";
        let styles: ZaloStyle[] | undefined = undefined;

        if (typeof content === "string") {
          text = content;
        } else if (typeof content === "object" && content !== null) {
          const c = content as any;
          text =
            c.title || c.msg || c.message || c.description || c.content || "";

          if (Array.isArray(c.styles)) styles = c.styles;
          else if (typeof c.params === "string") {
            try {
              const p = JSON.parse(c.params);
              if (p?.styles) styles = p.styles;
            } catch {}
          }
        }
        return (
          <StyledText
            text={text}
            styles={styles}
            className="text-white text-sm"
          />
        );
      }

      // 2. Multimedia
      if (msgType === "chat.photo")
        return <PhotoMessage content={content as ZaloAttachmentContent} />;
      if (msgType === "chat.sticker")
        return <StickerMessage content={content as ZaloStickerContent} />;
      if (msgType === "chat.voice")
        return <VoiceMessage content={content as ZaloVoiceContent} />;
      if (msgType === "chat.video.msg")
        return <VideoMessage content={content as ZaloVideoContent} />;
      if (msgType === "chat.recommended")
        return <LinkMessage content={content as ZaloAttachmentContent} />;

      // 3. Fallback
      return (
        <div className="text-xs text-gray-400 italic">
          [Tin nhắn loại: {msgType}]
        </div>
      );
    };

    return (
      <div className="flex flex-col">
        {quote && <ReplyBlock quote={quote} />}
        {renderContent()}
      </div>
    );
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
      {/* 1. Header */}
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
          title="Thông tin hội thoại"
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
          const senderAvatar = senderInfo?.avatar || "";

          // Logic Avatar: Group -> Show sender avatar; 1-1 -> Show partner avatar if not self
          const showAvatar = thread.type === 1 && !msg.isSelf;
          const avatarUrl = showAvatar ? senderAvatar : "";

          return (
            <div
              key={msg.data.msgId + index}
              className={`flex max-w-[85%] gap-3 ${
                msg.isSelf ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
            >
              {/* Avatar (Chỉ hiện cho tin nhắn người khác trong nhóm) */}
              <div className="flex-shrink-0 w-8">
                {showAvatar && (
                  <Avatar src={avatarUrl} alt={senderName} isGroup={false} />
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
          {/* Echo Bot Toggle (Mini) */}
          <div
            className="flex items-center self-center pl-2 pr-2 border-r border-gray-700"
            title="Bot nhại lại"
          >
            <input
              type="checkbox"
              checked={isEchoBotEnabled}
              onChange={onToggleEchoBot}
              className="w-4 h-4 accent-blue-500 cursor-pointer"
            />
          </div>

          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder={`Nhập tin nhắn tới ${thread.name}...`}
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
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:bg-gray-700 transition-all self-end mb-[1px]"
          >
            {isSendingMessage ? (
              <span className="block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <IconSend className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
