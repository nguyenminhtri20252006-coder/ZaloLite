/**
 * lib/core/services/sync-service.ts
 * [CORE SERVICE - V3.0]
 * Logic: Đồng bộ danh sách Bạn bè & Nhóm.
 * [MAJOR UPDATE] Trích xuất Global ID (Hash) chính xác từ raw data.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ConversationService } from "@/lib/core/services/conversation-service";

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const friends: any[] = await api.getAllFriends();
      console.log(`[SyncService] Found ${friends.length} friends.`);

      for (const friend of friends) {
        // [LOGIC ID]
        const numericId = friend.userId; // ID Số (dùng để chat)
        const globalHash = friend.globalId || friend.userId; // ID Hash (dùng để định danh) - API mới thường trả về globalId

        const name = friend.displayName || friend.zaloName || "Unknown";
        const avatar = friend.avatar || "";

        // 1. Tạo Customer (Single View)
        await ConversationService.ensureCustomer(
          botId,
          globalHash, // Global
          numericId, // External
          name,
          avatar,
          friend,
        );

        // 2. Tạo Conversation (User Type)
        await ConversationService.ensureConversation(
          botId,
          globalHash, // Global
          numericId, // External
          false, // isGroup = false
          name,
          avatar,
          friend,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawGroupsData: any = await api.getAllGroups();
      const groupIds = Object.keys(rawGroupsData.gridVerMap || {});

      console.log(`[Sync] Found ${groupIds.length} groups.`);

      const chunkSize = 10;
      for (let i = 0; i < groupIds.length; i += chunkSize) {
        const chunkIds = groupIds.slice(i, i + chunkSize);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupInfos: any = await api.getGroupInfo(chunkIds);

        for (const groupId of chunkIds) {
          const info = groupInfos.gridInfoMap?.[groupId];
          if (!info) continue;

          // [LOGIC ID]
          const numericGroupId = groupId; // ID Số (dùng để chat)
          const globalGroupHash = info.globalId || groupId; // ID Hash

          console.log(
            `[Sync] Group: ${info.name} | Num: ${numericGroupId} | Hash: ${globalGroupHash}`,
          );

          await ConversationService.ensureConversation(
            botId,
            globalGroupHash, // Global Hash
            numericGroupId, // External Numeric
            true, // isGroup = true
            info.name || `Group ${numericGroupId}`,
            info.avatar || "",
            info,
          );
        }
      }
    } catch (error) {
      console.error(`[Sync] Sync groups error:`, error);
      throw error;
    }
  }
}
