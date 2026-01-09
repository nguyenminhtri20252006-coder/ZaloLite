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
  // Subscribe vào 1 Topic cụ thể với 1 Event cụ thể
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

  // Theo dõi các topic đã báo Server (để tránh gọi API subscribe trùng lặp)
  const activeTopics = useRef<Set<string>>(new Set());
  const apiSubscribe = async (topic: string) => {
    try {
      await fetch("/api/sse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, action: "subscribe" }),
      });
    } catch (e) {
      console.error("[SSE-Global] Subscribe API fail:", e);
    }
  };

  // 1. Khởi tạo Single Connection
  useEffect(() => {
    const connect = () => {
      console.log("[SSE-Global] Connecting stream...");
      const es = new EventSource("/api/sse/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log("[SSE-Global] Connected.");
        setIsConnected(true);
        // Resubscribe topics if reconnecting (Optional: Server might handle connection persistence, but safer to resubscribe)
        activeTopics.current.forEach((topic) => apiSubscribe(topic));
      };

      es.onerror = () => {
        console.warn("[SSE-Global] Connection lost. Retrying...");
        setIsConnected(false);
        es.close();
        // Native EventSource auto-retries, but we might want explicit control
        setTimeout(connect, 3000);
      };

      // Listen to ALL events and dispatch
      // Note: EventSource requires explicit addEventListener for named events
      const supportedEvents = [
        "qr",
        "status",
        "success",
        "error",
        "conflict",
        "sync-log",
      ];

      supportedEvents.forEach((evt) => {
        es.addEventListener(evt, (e: any) => {
          try {
            const data = JSON.parse(e.data);
            // Payload MUST contain info to identify Topic if multiple topics emit same event
            // Tuy nhiên, mô hình SSEManager hiện tại gửi broadcast cho ID/Topic cụ thể.
            // Client nhận được hết.
            // Chúng ta sẽ dispatch cho TẤT CẢ listeners đăng ký sự kiện này ở TẤT CẢ topic?
            // Không, ta cần biết sự kiện này thuộc topic nào.
            // Nhưng SSE standard không gửi Topic Name trong header.
            // => GIẢI PHÁP: Component callback phải tự filter data.botId hoặc data.sessionId nếu cần.
            // Context chỉ dispatch dựa trên EventName.

            listeners.current.forEach((eventMap, topic) => {
              const callbacks = eventMap.get(evt);
              if (callbacks) callbacks.forEach((cb) => cb(data));
            });
          } catch (err) {
            console.error("[SSE-Global] Parse error:", err);
          }
        });
      });
    };

    connect();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  // API Call helper

  const apiUnsubscribe = async (topic: string) => {
    try {
      await fetch("/api/sse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, action: "unsubscribe" }),
      });
    } catch (e) {
      console.error("[SSE-Global] Unsubscribe API fail:", e);
    }
  };

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

      // Call API if this is the first listener for this topic
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

        // Cleanup Topic if empty
        // Note: Logic này cần cẩn thận để không unsubscribe quá sớm nếu còn event khác
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
