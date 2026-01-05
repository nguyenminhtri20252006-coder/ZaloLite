/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/sync-service.ts
 * [CORE SERVICE - V7.5 SAFE SYNC]
 * - Fix logic upsert ID.
 * - Fix column name mapping (name -> display_name)
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { FriendService } from "@/lib/core/services/friend-service";
import { ConversationService } from "@/lib/core/services/conversation-service";
import supabase from "@/lib/supabaseServer";
import { GroupInfoResponse } from "@/lib/types/zalo.types";

export class SyncService {
  public static async syncAll(botId: string) {
    console.log(`[SyncService] 🔄 Bắt đầu đồng bộ cho Bot ${botId}...`);
    try {
      const manager = BotRuntimeManager.getInstance();
      const api = manager.getBotAPI(botId);

      await this.syncSelfProfile(botId, api);
      await this.syncFriends(botId, api);
      await this.syncGroups(botId, api);

      console.log(`[SyncService] ✅ Đồng bộ hoàn tất cho Bot ${botId}.`);
      return { success: true };
    } catch (error: unknown) {
      const err = String(error);
      console.error(`[SyncService] ❌ Lỗi đồng bộ Bot ${botId}:`, err);
      await BotRuntimeManager.getInstance().reportError(botId, error);
      return { success: false, error: err };
    }
  }

  // --- 1. SELF PROFILE (SAFE UPDATE) ---
  private static async syncSelfProfile(botId: string, api: any) {
    const info = await api.fetchAccountInfo(); // Use fetchAccountInfo as fixed before
    if (!info || (!info.id && !info.uid)) return;

    const updatePayload: any = {
      // [FIX] Map name -> display_name
      display_name: info.display_name || info.name,
      avatar: info.avatar,
      updated_at: new Date().toISOString(),
    };

    // Nếu DB chưa có Global ID thì điền vào. Nếu có rồi thì giữ nguyên (để tránh conflict unique nếu hệ thống đang sai lệch)
    // Tuy nhiên, nếu addBotWithTokenAction đã chạy đúng, GlobalID đã chuẩn.
    // Ta check xem GlobalID có thay đổi không

    await supabase
      .from("zalo_identities")
      .update(updatePayload)
      .eq("id", botId);

    // Update cả bên Info table (Avatar)
    const { data: identity } = await supabase
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", botId)
      .single();
    if (identity?.ref_bot_id) {
      await supabase
        .from("zalo_bot_info")
        .update({ avatar: info.avatar })
        .eq("id", identity.ref_bot_id);
    }
  }

  // --- 2. FRIENDS ---
  private static async syncFriends(botId: string, api: any) {
    console.log(`[Sync] Fetching Friends...`);
    let friends: any[] = [];
    try {
      friends = await api.getAllFriends();
    } catch (e) {
      return;
    }

    if (!friends || !Array.isArray(friends)) return;

    // Batch processing limits
    const BATCH_SIZE = 50;

    for (let i = 0; i < friends.length; i += BATCH_SIZE) {
      const batch = friends.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (friend) => {
          try {
            const friendZaloId = friend.userId || friend.id || friend.uid;
            if (!friendZaloId) return;

            const identityId = await FriendService.upsertIdentity(
              friendZaloId,
              friend,
              "user",
              true,
            );
            if (!identityId) return;

            // 2. Create Connection (Friend)
            await FriendService.upsertConnection(
              botId,
              identityId,
              friendZaloId,
              "friend",
            );

            // 3. Create Private Conversation
            const convId = await ConversationService.upsertPrivateConversation(
              botId,
              identityId,
              friend.displayName || friend.name || `User ${friendZaloId}`,
              friend.avatar,
            );

            // 4. Add Members to Private Chat
            if (convId) {
              // Bot (Admin) - Cần thread_id = UserID để gửi tin
              await ConversationService.addMember(
                convId,
                botId,
                "admin",
                friendZaloId,
              );
              // Friend (Member)
              await ConversationService.addMember(
                convId,
                identityId,
                "member",
                null,
              );
            }
          } catch (e) {
            console.error(`[Sync] Friend Error:`, e);
          }
        }),
      );
    }
  }

  // --- 3. GROUPS ---
  private static async syncGroups(botId: string, api: any) {
    console.log(`[Sync] Fetching Groups...`);
    let groupIds: string[] = [];
    try {
      const raw = await api.getAllGroups();
      if (raw && typeof raw === "object") {
        if (raw.gridVerMap) groupIds = Object.keys(raw.gridVerMap);
        else if (raw instanceof Map)
          groupIds = Array.from(raw.keys()).map(String);
        else if (Array.isArray(raw))
          groupIds = raw.map((g: any) =>
            typeof g === "string" ? g : g.id || g.groupId,
          );
        else groupIds = Object.keys(raw);
      }
    } catch (e) {
      return;
    }

    if (groupIds.length === 0) return;
    console.log(`[Sync] Processing ${groupIds.length} groups...`);

    const chunkSize = 10;
    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunkIds = groupIds.slice(i, i + chunkSize);

      try {
        const groupInfosRes = (await api.getGroupInfo(
          chunkIds,
        )) as GroupInfoResponse;
        const gridInfoMap = groupInfosRes.gridInfoMap || {};

        for (const groupId of chunkIds) {
          const targetKey = Object.keys(gridInfoMap).find((k) => k == groupId);
          const info = gridInfoMap[targetKey || groupId];
          if (!info) continue;

          // 1. Upsert Group Conversation
          const convId = await ConversationService.upsertGroupConversation(
            groupId,
            info.name || `Group ${groupId}`,
            info.avt || info.fullAvt || "",
            info,
          );
          if (!convId) continue;

          // 2. Add Bot to Group (Routing Key = GroupID)
          const isAdmin = (info.adminIds || []).includes(await api.getOwnId());
          await ConversationService.addMember(
            convId,
            botId,
            isAdmin ? "admin" : "member",
            groupId,
          );

          // 3. Sync Members
          if (info.memVerList && Array.isArray(info.memVerList)) {
            await this.syncGroupMembers(
              botId,
              convId,
              groupId,
              info.memVerList,
              api,
            );
          }
        }
      } catch (err) {
        console.error(`[Sync] Group Chunk Error:`, err);
      }
    }
  }

  private static async syncGroupMembers(
    botId: string,
    convId: string,
    groupId: string,
    uids: string[],
    api: any,
  ) {
    if (uids.length === 0) return;
    const batchSize = 20;

    for (let i = 0; i < uids.length; i += batchSize) {
      const batch = uids.slice(i, i + batchSize);
      try {
        let profiles: any = {};
        if (typeof api.getGroupMembersInfo === "function") {
          const res = await api.getGroupMembersInfo(batch);
          profiles = res.profiles || {};
        } else if (typeof api.getUserInfo === "function") {
          profiles = await api.getUserInfo(batch);
        }

        for (const uid of batch) {
          const p = profiles[uid] || { uid };

          // 1. Upsert Identity (Stranger/User)
          const identityId = await FriendService.upsertIdentity(
            uid,
            p,
            "user",
            false,
          );
          if (!identityId) continue;

          // 2. Upsert Connection (Stranger) - Nếu chưa có quan hệ
          if (identityId !== botId) {
            await FriendService.upsertConnection(
              botId,
              identityId,
              uid,
              "stranger",
              { source_group: groupId },
            );
          }

          // 3. Add Member to Group
          await ConversationService.addMember(
            convId,
            identityId,
            "member",
            null,
          );
        }
      } catch (e) {
        console.error(`[Sync] Group Member Batch Error:`, e);
      }
    }
  }
}
