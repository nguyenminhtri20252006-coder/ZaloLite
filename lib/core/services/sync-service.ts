/**
 * lib/core/services/sync-service.ts
 * [CORE SERVICE - V2]
 * Chuyên trách đồng bộ dữ liệu từ Zalo API về Database Hợp nhất.
 * - Sync Friends -> Customers & User Conversations
 * - Sync Groups -> Group Conversations
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ConversationService } from "@/lib/core/services/conversation-service";
import { ThreadType } from "@/lib/types/zalo.types";

export class SyncService {
  /**
   * Đồng bộ toàn bộ (Full Sync) cho một Bot
   */
  static async syncAll(botId: string) {
    console.log(`[SyncService] Starting full sync for bot ${botId}...`);
    try {
      await Promise.all([this.syncFriends(botId), this.syncGroups(botId)]);
      console.log(`[SyncService] Full sync completed for bot ${botId}.`);
      return { success: true };
    } catch (error: unknown) {
      console.error(`[SyncService] Full sync failed:`, error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Đồng bộ danh sách bạn bè
   */
  static async syncFriends(botId: string) {
    try {
      const api = BotRuntimeManager.getInstance().getBotAPI(botId);
      console.log(`[SyncService] Fetching friends list...`);

      // API zca-js trả về mảng User
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const friends: any[] = await api.getAllFriends();
      console.log(`[SyncService] Found ${friends.length} friends.`);

      for (const friend of friends) {
        const userId = friend.userId;
        const name = friend.displayName || friend.zaloName || "Unknown";
        const avatar = friend.avatar || "";

        // 1. Tạo Customer & Mapping
        // Lưu ý: userId của friend chính là Global ID
        await ConversationService.ensureCustomer(
          botId,
          userId,
          name,
          avatar,
          friend, // Lưu toàn bộ raw data
        );

        // 2. Tạo Conversation (Loại User) để chat 1-1
        // Với friend, ThreadID chính là UserID
        await ConversationService.ensureConversation(
          botId,
          userId,
          false, // isGroup = false
          name,
          avatar,
          friend, // raw data
        );
      }
    } catch (error) {
      console.error(`[SyncService] Sync friends error:`, error);
      throw error;
    }
  }

  /**
   * Đồng bộ danh sách nhóm
   */
  static async syncGroups(botId: string) {
    try {
      const api = BotRuntimeManager.getInstance().getBotAPI(botId);
      console.log(`[SyncService] Fetching groups list...`);

      // API zca-js trả về object chứa gridVerMap
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawGroupsData: any = await api.getAllGroups();
      const groupIds = Object.keys(rawGroupsData.gridVerMap || {});

      console.log(`[SyncService] Found ${groupIds.length} groups.`);

      // Lấy thông tin chi tiết từng nhóm (Batch processing nên được cân nhắc nếu list quá lớn)
      // Hiện tại ta loop qua và dùng getGroupInfo
      // Tuy nhiên getAllGroups không trả về tên nhóm ngay, cần gọi getGroupInfo

      // Chunking: Lấy thông tin 10 nhóm một lần để tránh rate limit
      const chunkSize = 10;
      for (let i = 0; i < groupIds.length; i += chunkSize) {
        const chunkIds = groupIds.slice(i, i + chunkSize);

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const groupInfos: any = await api.getGroupInfo(chunkIds);

          for (const groupId of chunkIds) {
            const info = groupInfos.gridInfoMap?.[groupId];
            if (!info) continue;

            const name = info.name || `Group ${groupId}`;
            const avatar = info.avatar || "";

            // Tạo Conversation (Loại Group)
            await ConversationService.ensureConversation(
              botId,
              groupId,
              true, // isGroup = true
              name,
              avatar,
              info, // raw data (chứa admins, members list...)
            );
          }
        } catch (e) {
          console.error(
            `[SyncService] Failed to fetch info for chunk ${i}:`,
            e,
          );
        }
      }
    } catch (error) {
      console.error(`[SyncService] Sync groups error:`, error);
      throw error;
    }
  }
}
