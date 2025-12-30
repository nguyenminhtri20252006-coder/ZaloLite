/**
 * lib/core/services/sync-service.ts
 * [CORE SERVICE - V4.2 FINAL]
 * Logic: Sync Friends & Groups.
 * - Removed 'getRecentChats'. Used 'getAllGroups' / 'getAllFriends'.
 * - [CRITICAL] Re-integrated ID Upgrade & Metadata Update logic.
 * - [FIX] Avatar extraction for Groups.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ConversationService } from "./conversation-service";
import { GroupInfoResponse } from "@/lib/types/zalo.types";

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
        const numericId = friend.userId; // ID Số
        const rawGlobalId = friend.globalId || friend.userId; // ID Hash Gốc

        // [SEPARATION] ID riêng cho Bot: HashID_BotID
        const conversationGlobalId = `${rawGlobalId}_${botId}`;

        const name = friend.displayName || friend.zaloName || "Unknown";
        const avatar = friend.avatar || "";

        // 1. Ensure Customer (Shared CRM Profile)
        await ConversationService.ensureCustomer(
          botId,
          rawGlobalId, // Shared ID
          numericId,
          name,
          avatar,
          friend,
        );

        // 2. Sync Conversation (Upgrade Check)
        const existingMapping =
          await ConversationService.findConversationByExternalId(
            botId,
            numericId,
          );

        if (existingMapping) {
          const currentDbGlobalId = existingMapping.global_id;

          // Logic Upgrade: Nếu ID hiện tại khác ID tính toán (ví dụ do trước đó dùng Numeric_BotID)
          if (conversationGlobalId !== currentDbGlobalId) {
            // console.log(`[Sync] Upgrading User Conv: ${currentDbGlobalId} -> ${conversationGlobalId}`);
            await ConversationService.updateConversationIdentity(
              existingMapping.conversation_id,
              conversationGlobalId,
              name,
              avatar,
              friend,
            );
          } else {
            // ID đã chuẩn -> Chỉ update Metadata (Avatar/Name)
            await ConversationService.updateConversationIdentity(
              existingMapping.conversation_id,
              currentDbGlobalId,
              name,
              avatar,
              friend,
            );
          }
        } else {
          // Chưa có -> Tạo mới
          await ConversationService.ensureConversation(
            botId,
            conversationGlobalId,
            numericId,
            false, // isGroup = false
            name,
            avatar,
            friend,
          );
        }
      }
    } catch (error) {
      console.error(`[SyncService] Sync friends error:`, error);
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

        // API Call
        const groupInfos = (await api.getGroupInfo(
          chunkIds,
        )) as unknown as GroupInfoResponse;
        const gridInfoMap = groupInfos.gridInfoMap || {};

        for (const groupId of chunkIds) {
          // [SMART EXTRACT] Tìm key trong map
          const targetKey = Object.keys(gridInfoMap).find((k) => k == groupId);
          const info = gridInfoMap[targetKey || groupId];

          if (!info) continue;

          // [LOGIC ID]
          const numericGroupId = groupId;
          // Group dùng chung ID Global (Shared Context)
          const globalGroupHash = info.globalId || groupId;

          // [AVATAR LOGIC FIXED]
          const avatar = info.avt || info.fullAvt || "";
          const name = info.name || `Group ${numericGroupId}`;

          // [SYNC LOGIC]
          const existingMapping =
            await ConversationService.findConversationByExternalId(
              botId,
              numericGroupId,
            );

          if (existingMapping) {
            const currentDbGlobalId = existingMapping.global_id;

            // Case A: Cần nâng cấp ID (Numeric -> Hash)
            // Nếu ID hiện tại là số (giống externalId) và ta đã có Hash mới
            if (
              globalGroupHash &&
              globalGroupHash !== currentDbGlobalId &&
              currentDbGlobalId === numericGroupId
            ) {
              console.log(
                `[Sync] Upgrading ID for Group ${name}: ${currentDbGlobalId} -> ${globalGroupHash}`,
              );
              await ConversationService.updateConversationIdentity(
                existingMapping.conversation_id,
                globalGroupHash,
                name,
                avatar,
                info,
              );
            }
            // Case B: ID đã ổn định -> Chỉ cập nhật Metadata (Avatar/Tên)
            else {
              await ConversationService.updateConversationIdentity(
                existingMapping.conversation_id,
                currentDbGlobalId, // Giữ nguyên ID
                name,
                avatar,
                info,
              );
            }
          } else {
            // Case C: Chưa có -> Tạo mới hoàn toàn
            await ConversationService.ensureConversation(
              botId,
              globalGroupHash, // Global Hash
              numericGroupId, // External Numeric
              true, // isGroup = true
              name,
              avatar,
              info,
            );
          }
        }
      }
    } catch (error) {
      console.error(`[Sync] Sync groups error:`, error);
      throw error;
    }
  }
}
