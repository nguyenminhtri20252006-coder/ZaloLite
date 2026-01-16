/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/notification-service.ts
 * [NEW SERVICE] Dispatcher trung tâm.
 * Chức năng:
 * 1. Hydration: Biến Raw Message thành Rich Message (Kèm tên, avatar sender).
 * 2. Security: Xác định danh sách Staff được phép nhận tin (RLS).
 * 3. Dispatch: Gọi SSEManager để bắn tin.
 */

import supabaseAdmin from "@/lib/supabaseServer";
import { sseManager } from "@/lib/core/sse-manager";

export type SSEMessagePayload = {
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

export class NotificationService {
  /**
   * Dispatch tin nhắn mới tới các Staff có quyền quản lý Bot này.
   */
  public static async dispatchMessage(
    botId: string,
    dbMessage: any,
    targetThreadId: string,
  ) {
    try {
      // 1. Hydrate Data (Lấy thông tin người gửi)
      const richPayload = await this.hydrateMessage(
        botId,
        dbMessage,
        targetThreadId,
      );

      // 2. Resolve Recipients (Ai được nhận?)
      const recipients = await this.getStaffsManagingBot(botId);

      if (recipients.length === 0) {
        // console.log(`[Notification] No active staff for Bot ${botId}`);
        return;
      }

      // 3. Multicast
      // console.log(`[Notification] Dispatching msg ${dbMessage.id} to ${recipients.length} staffs.`);
      sseManager.multicast(recipients, "new_message", richPayload);
    } catch (e) {
      console.error("[Notification] Dispatch Error:", e);
    }
  }

  // --- HELPERS ---

  private static async hydrateMessage(
    botId: string,
    msg: any,
    threadId: string,
  ): Promise<SSEMessagePayload> {
    const senderId = msg.sender_identity_id;
    const senderInfo = {
      id: senderId,
      type: msg.sender_type,
      name: "Unknown",
      avatar: "",
      is_self: false,
    };

    // Nếu người gửi là chính Bot hoặc Staff -> Self
    if (
      senderId === botId ||
      msg.sender_type === "bot" ||
      msg.sender_type === "staff"
    ) {
      senderInfo.is_self = true;
    }

    // Fetch Identity Info (Nếu không có sẵn trong context pipeline)
    // Tối ưu: Pipeline có thể truyền identity object vào để tránh query lại.
    // Ở đây ta query lại cho chắc chắn và code gọn.
    try {
      if (senderId) {
        const { data } = await supabaseAdmin
          .from("zalo_identities")
          .select("root_name, avatar")
          .eq("id", senderId)
          .single();

        if (data) {
          senderInfo.name = data.root_name;
          senderInfo.avatar = data.avatar;
        }
      }

      // Fallback name nếu là staff
      if (msg.sender_type === "staff" && msg.raw_content?.staff_name) {
        senderInfo.name = msg.raw_content.staff_name;
      }
    } catch (e) {}

    return {
      id: msg.id,
      conversation_id: msg.conversation_id,
      content: msg.content,
      sent_at: msg.sent_at,
      flags: msg.flags,
      sender: senderInfo,
      context: {
        bot_id: botId,
        thread_id: threadId, // External Thread ID (Zalo UID/Group ID)
      },
    };
  }

  /**
   * Lấy danh sách Staff ID có quyền quản lý Bot này.
   * Logic: Admin (All) + Staff được assign.
   */
  private static async getStaffsManagingBot(botId: string): Promise<string[]> {
    // 1. Lấy Bot Info ID từ Identity ID (Bot ID truyền vào là Identity ID)
    let botInfoId = botId;

    // Check xem input là Identity ID hay Bot Info ID.
    // Thường pipeline làm việc với Identity ID.
    const { data: identity } = await supabaseAdmin
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", botId)
      .single();

    if (identity && identity.ref_bot_id) {
      botInfoId = identity.ref_bot_id;
    }

    const recipientSet = new Set<string>();

    // 2. Get Admins (Luôn nhận được all)
    const { data: admins } = await supabaseAdmin
      .from("staff_accounts")
      .select("id")
      .eq("role", "admin");

    if (admins) admins.forEach((a) => recipientSet.add(a.id));

    // 3. Get Assigned Staffs
    if (botInfoId) {
      const { data: perms } = await supabaseAdmin
        .from("staff_bot_permissions")
        .select("staff_id")
        .eq("bot_id", botInfoId);

      if (perms) perms.forEach((p) => recipientSet.add(p.staff_id));
    }

    return Array.from(recipientSet);
  }
}
