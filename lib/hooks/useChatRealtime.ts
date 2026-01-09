/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/hooks/useChatRealtime.ts
 * [CLIENT HOOK] Lắng nghe sự kiện Typing/Seen từ cả Staff khác và Zalo User.
 * [FIXED FINAL] Use setTimeout to avoid synchronous setState warning.
 */
import { useEffect, useState, useRef } from "react";
import supabase from "@/lib/supabaseClient";

export type TypingEvent = {
  botId: string;
  threadId: string;
  isTyping: boolean;
  uid: string; // User ID đang gõ
  source: "zalo_user" | "system_staff";
};

export function useChatRealtime(
  activeBotId: string | null,
  activeThreadId: string | null,
) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Dùng ref để tránh stale closure trong callback
  const threadIdRef = useRef(activeThreadId);
  const botIdRef = useRef(activeBotId);

  useEffect(() => {
    threadIdRef.current = activeThreadId;
    botIdRef.current = activeBotId;

    // [FIXED] Bọc trong setTimeout(0) để đẩy việc update ra khỏi luồng render hiện tại
    // Điều này giải quyết triệt để lỗi "Calling setState synchronously..."
    const timer = setTimeout(() => {
      setTypingUsers(new Set());
    }, 0);

    return () => clearTimeout(timer);
  }, [activeThreadId, activeBotId]);

  useEffect(() => {
    const channel = supabase.channel("chat_room");

    channel
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const data = payload.payload as TypingEvent;

        // Check refs instead of deps to avoid re-subscribing constantly
        const currentBotId = botIdRef.current;
        const currentThreadId = threadIdRef.current;

        // Chỉ xử lý nếu đúng Bot và Thread đang xem
        if (currentBotId && data.botId !== currentBotId) return;
        if (currentThreadId && data.threadId !== currentThreadId) return;

        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          if (data.isTyping) {
            newSet.add(data.uid);
          } else {
            newSet.delete(data.uid);
          }

          // Optimization: Chỉ render lại nếu Set thực sự thay đổi
          if (newSet.size === prev.size) {
            let isEqual = true;
            for (const item of newSet)
              if (!prev.has(item)) {
                isEqual = false;
                break;
              }
            if (isEqual) return prev;
          }
          return newSet;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Empty deps -> chỉ connect 1 lần duy nhất

  return {
    typingUsers: Array.from(typingUsers),
  };
}
