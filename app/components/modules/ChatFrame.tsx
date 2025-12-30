/**
 * app/components/modules/ChatFrame.tsx
 * [FIXED LOGIC] Strict Sender Identification & Metadata Priority.
 * - Fixes "Group chat appearing as User chat" confusion by showing explicit names/avatars.
 * - Prioritizes Server Metadata (Joined Data) over Client Cache to avoid ID mismatch.
 */

"use client";
import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";
import {
  ThreadInfo,
  ZaloMessage,
  UserCacheEntry,
  ZaloAttachmentContent,
  ZaloStickerContent,
  ZaloVoiceContent,
  ZaloVideoContent,
  StandardPhoto,
  StandardSticker,
} from "@/lib/types/zalo.types";
import { Avatar } from "@/app/components/ui/Avatar";
import { IconInfo, IconSend } from "@/app/components/ui/Icons";
import { StyledText } from "@/app/components/ui/StyledText";
import { getMessagesAction } from "@/lib/actions/chat.actions";

// [RESOURCE] Default Avatar Base64
const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E`;

// [TYPE DEF]
type SafeContent = {
  type?: string;
  text?: string;
  title?: string;
  msg?: string;
  url?: string;
  href?: string;
  thumb?: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
  data?: {
    url?: string;
    thumbnail?: string;
    // Add optional properties to match StandardPhoto loosely for casting
    width?: number;
    height?: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

// [COMPONENTS]
const RawJsonMessage = ({
  content,
  type,
  extraLink,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  type: string;
  extraLink?: string;
}) => {
  const [show, setShow] = useState(true);
  return (
    <div className="flex flex-col gap-2 min-w-[200px] max-w-md p-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase font-bold text-gray-500 bg-gray-200/80 px-1.5 py-0.5 rounded border border-gray-300">
          {type}
        </span>
        <button
          onClick={() => setShow(!show)}
          className="text-[10px] text-blue-600 hover:underline"
        >
          {show ? "Thu gọn" : "JSON"}
        </button>
      </div>
      {extraLink && (
        <div className="my-1 p-2 bg-gray-50 rounded border border-gray-200">
          {type.toUpperCase().includes("VOICE") ? (
            <audio controls src={extraLink} className="w-full h-8" />
          ) : (
            <a
              href={extraLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 underline break-all block"
            >
              {extraLink}
            </a>
          )}
        </div>
      )}
      {show && (
        <pre className="text-[9px] text-gray-800 bg-gray-50 p-2 rounded overflow-x-auto border border-gray-200 max-h-40 scrollbar-thin font-mono">
          {JSON.stringify(content, null, 2)}
        </pre>
      )}
    </div>
  );
};

const NestedAvatar = ({
  mainAvatar,
  subAvatar,
  subName,
  mainName,
}: {
  mainAvatar: string;
  subAvatar?: string;
  subName?: string;
  mainName: string;
}) => {
  const safeMain =
    mainAvatar && mainAvatar.startsWith("http") ? mainAvatar : DEFAULT_AVATAR;
  const safeSub =
    subAvatar && subAvatar.startsWith("http") ? subAvatar : DEFAULT_AVATAR;
  return (
    <div className="relative w-10 h-10 flex-shrink-0 group select-none">
      <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-600/30 bg-gray-200">
        <img
          src={safeMain}
          alt={mainName}
          className="w-full h-full object-cover"
          onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR)}
        />
      </div>
      {subAvatar && (
        <div className="absolute -bottom-1 -right-1 z-10 cursor-help">
          <div className="w-4 h-4 rounded-full border border-white overflow-hidden shadow-sm bg-gray-300">
            <img
              src={safeSub}
              alt="Staff"
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          </div>
          {subName && (
            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900/90 text-white text-[10px] rounded whitespace-nowrap z-20 pointer-events-none shadow-lg">
              {subName}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type PhotoContent = {
  data?: StandardPhoto;
  href?: string;
  thumb?: string;
} & Partial<ZaloAttachmentContent>;
const PhotoMessage = ({ content }: { content: PhotoContent }) => (
  <div className="overflow-hidden rounded-lg bg-black/20">
    <img
      src={
        content.data?.url ||
        content.data?.thumbnail ||
        content.href ||
        content.thumb ||
        ""
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
type StickerContent = {
  data?: StandardSticker;
  url?: string;
} & Partial<ZaloStickerContent>;
const StickerMessage = ({ content }: { content: StickerContent }) => (
  <div className="flex flex-col items-center rounded-lg bg-transparent p-1">
    <img
      src={content.data?.url || content.url || ""}
      alt="Sticker"
      className="w-24 h-24 object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  </div>
);

// --- CHAT FRAME ---

export function ChatFrame({
  thread,
  messages,
  onSendMessage,
  onToggleDetails,
  isSendingMessage,
  userCache,
  currentBotId,
  onLoadMore,
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
  currentBotId: string | null;
  onLoadMore?: (newMsgs: ZaloMessage[]) => void;
}) {
  const [messageContent, setMessageContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Auto scroll logic (Simplified)
  useEffect(() => {
    if (!isLoadingMore)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoadingMore]);

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || isSendingMessage || !thread) return;
    const contentToSend = messageContent;
    setMessageContent("");
    await onSendMessage(contentToSend);
  };

  const handleScroll = async () => {
    if (
      !containerRef.current ||
      isLoadingMore ||
      !hasMore ||
      !thread ||
      !currentBotId
    )
      return;
    if (containerRef.current.scrollTop < 50) {
      setIsLoadingMore(true);
      const oldScrollHeight = containerRef.current.scrollHeight;
      const oldestMsg = messages[0];
      const beforeTs = oldestMsg
        ? new Date(parseInt(oldestMsg.data.ts)).toISOString()
        : undefined;

      if (beforeTs) {
        try {
          const olderMsgs = await getMessagesAction(
            currentBotId,
            thread.id,
            beforeTs,
          );
          if (olderMsgs.length > 0) {
            if (onLoadMore) onLoadMore(olderMsgs as ZaloMessage[]);
            setTimeout(() => {
              if (containerRef.current) {
                containerRef.current.scrollTop =
                  containerRef.current.scrollHeight - oldScrollHeight;
              }
            }, 0);
          } else setHasMore(false);
        } catch (e) {
          console.error(e);
        }
      }
      setIsLoadingMore(false);
    }
  };

  const renderMessageBody = (msg: ZaloMessage) => {
    const { msgType, content } = msg.data;
    const safeContent = content as SafeContent;
    try {
      if (msgType === "webchat" || msgType === "chat.text") {
        const text =
          safeContent.type === "text"
            ? safeContent.text
            : safeContent.title || safeContent.msg || safeContent;
        const displayText =
          typeof text === "string" ? text : JSON.stringify(text);
        return (
          <StyledText text={displayText} className="text-inherit text-sm" />
        );
      }

      // [FIX TYPE ERROR] Cast to specific types
      if (msgType === "chat.sticker" || safeContent.type === "sticker") {
        // Cast to unknown first if properties mismatch, but usually casting to StickerContent works if types align loosely
        return (
          <StickerMessage content={safeContent as unknown as StickerContent} />
        );
      }

      if (msgType === "chat.photo" || safeContent.type === "photo") {
        // Cast to unknown first to bypass structural check strictness
        return (
          <PhotoMessage content={safeContent as unknown as PhotoContent} />
        );
      }

      if (msgType === "chat.voice" || safeContent.type === "voice")
        return (
          <RawJsonMessage
            content={safeContent}
            type="VOICE"
            extraLink={safeContent.href || safeContent.url}
          />
        );
      if (msgType === "chat.link" || safeContent.type === "link")
        return (
          <RawJsonMessage
            content={safeContent}
            type="LINK"
            extraLink={safeContent.href || safeContent.url}
          />
        );
      if (
        msgType === "chat.file" ||
        safeContent.type === "file" ||
        msgType === "chat.video" ||
        safeContent.type === "video"
      ) {
        return (
          <RawJsonMessage
            content={safeContent}
            type={msgType?.toUpperCase() || "FILE"}
            extraLink={safeContent.href || safeContent.url}
          />
        );
      }
      return (
        <RawJsonMessage content={safeContent} type={msgType || "UNKNOWN"} />
      );
    } catch (e) {
      return <div className="text-red-500 text-xs">Render Error</div>;
    }
  };

  if (!thread) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center bg-gray-800 text-gray-500 gap-4">
        <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center text-3xl">
          💬
        </div>
        <p>Chọn một hội thoại để bắt đầu chat</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-gray-900 relative border-l border-gray-800">
      <header className="flex h-[72px] items-center justify-between border-b border-gray-800 px-6 py-4 bg-gray-900 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar
            src={
              thread.avatar && thread.avatar.startsWith("http")
                ? thread.avatar
                : DEFAULT_AVATAR
            }
            alt={thread.name}
            isGroup={thread.type === 1}
          />
          <div>
            <h2 className="text-base font-bold text-gray-100">{thread.name}</h2>
            <p className="text-xs text-green-500 font-medium">Online</p>
          </div>
        </div>
        <button
          onClick={onToggleDetails}
          className="p-2 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
        >
          <IconInfo className="h-6 w-6" />
        </button>
      </header>

      <div
        className="flex-1 space-y-6 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700 bg-gray-900/50"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {isLoadingMore && (
          <div className="text-center text-xs text-gray-500 py-2">
            Đang tải tin nhắn cũ...
          </div>
        )}

        {messages.map((msg, index) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = msg.data as any;
          const senderType = meta.senderType || "customer";
          const botSendId = meta.botSendId;
          const staffInfo = meta.staffInfo;

          // 1. Logic Xác định PHE (Side)
          // Me: Là Staff hoặc Bot VÀ botSendId trùng với Bot đang xem
          const isMe =
            ["staff", "bot"].includes(senderType) && botSendId === currentBotId;

          // Ally: Là Staff hoặc Bot NHƯNG botSendId KHÁC Bot đang xem (Đồng nghiệp)
          const isAlly = ["staff", "bot"].includes(senderType) && !isMe;

          let bubbleClass = "";
          let textColor = "";
          let alignClass = "";

          if (isMe) {
            alignClass = "ml-auto flex-row-reverse";
            bubbleClass = "bg-blue-600 rounded-tr-sm shadow-md";
            textColor = "text-white";
          } else if (isAlly) {
            alignClass = "mr-auto";
            bubbleClass =
              "bg-sky-200 border border-sky-300 rounded-tl-sm shadow-sm";
            textColor = "text-gray-900";
          } else {
            alignClass = "mr-auto";
            bubbleClass =
              "bg-gray-100 border border-gray-200 rounded-tl-sm shadow-sm";
            textColor = "text-gray-900";
          }

          // [FIXED LOGIC] Identity Resolution for Realtime & History
          let mainAvatar = "";
          let mainName = "";

          if (senderType === "customer") {
            // 1. Ưu tiên Metadata từ Server (có khi load history)
            if (meta.customerInfo && meta.customerInfo.avatar) {
              mainAvatar = meta.customerInfo.avatar;
              mainName = meta.customerInfo.name;
            }
            // 2. Fallback Cache (có khi nhận realtime nhưng chưa có join info)
            // Lưu ý: msg.data.uidFrom ở đây là ID từ DB (có thể là UUID hoặc Zalo ID)
            // Cần check kỹ key trong userCache
            else {
              const cached = userCache[msg.data.uidFrom];
              if (cached) {
                mainAvatar = cached.avatar || "";
                mainName = cached.name;
              } else {
                // 3. Fallback cuối: Dùng avatar hội thoại nếu là chat 1-1
                if (thread && thread.type === 0) {
                  mainAvatar = thread.avatar;
                  mainName = thread.name;
                } else {
                  mainName = msg.data.dName || "Khách hàng";
                }
              }
            }
          } else {
            // Là Bot hoặc Staff
            if (meta.botInfo) {
              mainAvatar = meta.botInfo.avatar;
              mainName = meta.botInfo.name;
            }
          }

          return (
            <div
              key={(msg.data.msgId || index) + "_" + index}
              className={`flex max-w-[85%] gap-3 ${alignClass}`}
            >
              <NestedAvatar
                mainAvatar={mainAvatar}
                mainName={mainName}
                subAvatar={staffInfo?.avatar}
                subName={staffInfo?.name}
              />

              <div
                className={`flex flex-col ${
                  isMe ? "items-end" : "items-start"
                }`}
              >
                {/* Luôn hiện tên nếu không phải là mình (để phân biệt khách vs đồng nghiệp) */}
                {!isMe && (
                  <span className="text-[10px] text-gray-400 mb-1 ml-1 font-medium">
                    {mainName}{" "}
                    {isAlly && (
                      <span className="text-blue-400">(Bot khác)</span>
                    )}
                  </span>
                )}

                <div
                  className={`relative rounded-2xl px-4 py-2 ${bubbleClass} ${textColor}`}
                >
                  {renderMessageBody(msg)}
                </div>

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

      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <form
          onSubmit={handleFormSubmit}
          className="flex items-end gap-2 bg-gray-800 p-2 rounded-xl border border-gray-700 focus-within:border-blue-500 transition-colors"
        >
          <input
            type="text"
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Nhập tin nhắn..."
            className="flex-1 bg-transparent text-gray-100 text-sm px-2 py-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSendingMessage}
            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <IconSend className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
