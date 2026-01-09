/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/broadcast-service.ts
 * [NEW MODULE] Cầu nối để Server bắn sự kiện "Ephemeral" lên Client qua Supabase.
 * - Mục đích: Chuyển tiếp sự kiện Typing/Seen từ Zalo -> Client UI.
 * - Kênh: 'chat_room' (Kênh chung cho toàn hệ thống chat).
 */

import supabaseServer from "@/lib/supabaseServer";

export class BroadcastService {
  private static CHANNEL_NAME = "chat_room";

  /**
   * Gửi sự kiện Typing tới Client
   */
  public static async broadcastTyping(
    botId: string,
    threadId: string,
    isTyping: boolean,
    senderId: string,
  ) {
    try {
      // Vì Server không giữ kết nối socket liên tục (stateless functions),
      // ta gửi qua REST API hoặc dùng channel ephemeral nếu dùng Edge Functions.
      // Tuy nhiên, thư viện supabase-js hỗ trợ track/send qua socket.
      // Để đơn giản và nhanh nhất: Ta dùng channel.send().

      const channel = supabaseServer.channel(this.CHANNEL_NAME);

      // Subscribe (nếu chưa) -> Send -> Unsubscribe (để tránh leak connection ở serverless)
      // *Lưu ý*: Nếu deploy Vercel/Serverless, việc này có thể hơi chậm do handshake.
      // Nếu chạy VPS/Docker (Node), ta nên giữ connection global.

      // Ở đây giả định môi trường Node.js long-running (VPS) -> Giữ connection tốt hơn.
      // Nhưng để an toàn cho Next.js, ta sẽ init-send-cleanup.

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.send({
            type: "broadcast",
            event: "typing",
            payload: {
              botId,
              threadId,
              isTyping,
              uid: senderId, // Người đang gõ (Zalo User ID)
              source: "zalo_user",
            },
          });
          // Cleanup ngay sau khi gửi để tránh treo lambda/serverless function
          supabaseServer.removeChannel(channel);
        }
      });
    } catch (e) {
      console.error("[Broadcast] Failed to send Typing:", e);
    }
  }

  /**
   * Gửi sự kiện Seen tới Client
   */
  public static async broadcastSeen(
    botId: string,
    threadId: string,
    msgId: string,
    senderId: string,
  ) {
    try {
      const channel = supabaseServer.channel(this.CHANNEL_NAME);
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.send({
            type: "broadcast",
            event: "seen",
            payload: {
              botId,
              threadId,
              msgId,
              uid: senderId,
              source: "zalo_user",
            },
          });
          supabaseServer.removeChannel(channel);
        }
      });
    } catch (e) {
      console.error("[Broadcast] Failed to send Seen:", e);
    }
  }
}
