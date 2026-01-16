/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

type SSEEventCallback = (data: any) => void;

interface SSEContextType {
  subscribe: (
    topic: string,
    eventName: string,
    callback: SSEEventCallback,
  ) => void;
  unsubscribe: (
    topic: string,
    eventName: string,
    callback: SSEEventCallback,
  ) => void;
  isConnected: boolean;
}

const SSEContext = createContext<SSEContextType | null>(null);

export const SSEProvider = ({ children }: { children: React.ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Map<Topic, Map<EventName, Set<Callback>>>
  const listeners = useRef<Map<string, Map<string, Set<SSEEventCallback>>>>(
    new Map(),
  );

  const activeTopics = useRef<Set<string>>(new Set());

  // API Call helper (Giữ nguyên logic cũ cho các module khác)
  const apiSubscribe = async (topic: string) => {
    try {
      if (topic === "user_stream") return; // Không cần subscribe topic ảo này lên server
      await fetch("/api/sse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, action: "subscribe" }),
      });
    } catch (e) {
      console.error("[SSE-Global] Subscribe API fail:", e);
    }
  };

  const apiUnsubscribe = async (topic: string) => {
    try {
      if (topic === "user_stream") return;
      await fetch("/api/sse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, action: "unsubscribe" }),
      });
    } catch (e) {
      console.error("[SSE-Global] Unsubscribe API fail:", e);
    }
  };

  useEffect(() => {
    const connect = () => {
      console.log("[SSE-Global] 🔌 Connecting stream...");
      const es = new EventSource("/api/sse/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log("[SSE-Global] ✅ Connected.");
        setIsConnected(true);
        activeTopics.current.forEach((topic) => apiSubscribe(topic));
      };

      es.onerror = () => {
        console.warn("[SSE-Global] ❌ Connection lost. Retrying...");
        setIsConnected(false);
        es.close();
        setTimeout(connect, 3000);
      };

      // [CRITICAL FIX] Thêm "new_message" vào danh sách supportedEvents
      const supportedEvents = [
        "qr",
        "status",
        "success",
        "error",
        "conflict",
        "sync-log",
        "new_message", // <--- QUAN TRỌNG: Phải có dòng này mới nhận được tin nhắn
      ];

      supportedEvents.forEach((evt) => {
        es.addEventListener(evt, (e: any) => {
          try {
            // [DEBUG LOG] In ra mọi sự kiện nhận được để debug
            // console.log(`[SSE-Debug] 📥 Event Received: [${evt}]`, e.data);

            const data = JSON.parse(e.data);

            // Dispatch cho tất cả listeners đăng ký sự kiện này (bất kể topic nào)
            // Vì Multicast gửi thẳng vào user, Client không phân biệt topic ở tầng transport
            listeners.current.forEach((eventMap, topicKey) => {
              const callbacks = eventMap.get(evt);
              if (callbacks) {
                // console.log(`[SSE-Debug] Dispatching to topic: ${topicKey}, listeners: ${callbacks.size}`);
                callbacks.forEach((cb) => cb(data));
              }
            });
          } catch (err) {
            console.error(`[SSE-Global] Parse error for [${evt}]:`, err);
          }
        });
      });
    };

    connect();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  const subscribe = useCallback(
    (topic: string, eventName: string, callback: SSEEventCallback) => {
      if (!listeners.current.has(topic)) {
        listeners.current.set(topic, new Map());
      }
      const eventMap = listeners.current.get(topic)!;

      if (!eventMap.has(eventName)) {
        eventMap.set(eventName, new Set());
      }
      eventMap.get(eventName)!.add(callback);

      if (!activeTopics.current.has(topic)) {
        activeTopics.current.add(topic);
        apiSubscribe(topic);
      }
    },
    [],
  );

  const unsubscribe = useCallback(
    (topic: string, eventName: string, callback: SSEEventCallback) => {
      const eventMap = listeners.current.get(topic);
      if (eventMap) {
        const callbacks = eventMap.get(eventName);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) eventMap.delete(eventName);
        }

        if (eventMap.size === 0) {
          listeners.current.delete(topic);
          activeTopics.current.delete(topic);
          apiUnsubscribe(topic);
        }
      }
    },
    [],
  );

  return (
    <SSEContext.Provider value={{ subscribe, unsubscribe, isConnected }}>
      {children}
    </SSEContext.Provider>
  );
};

export const useSSE = () => {
  const context = useContext(SSEContext);
  if (!context) throw new Error("useSSE must be used within SSEProvider");
  return context;
};
