/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/sync-service.ts
 * [CORE SERVICE - V7.5 SAFE SYNC]
 * - Fix logic upsert ID.
 * - Fix column name mapping (name -> display_name)
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
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

    // Update Identity (No is_friend)
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

      // A. Upsert Identities (Global) - Bỏ is_friend
      const identitiesToUpsert = batch
        .map((f) => ({
          zalo_global_id: f.userId || f.id || f.uid,
          display_name: f.displayName || f.name || "Unknown User",
          avatar: f.avatar || "",
          type: "user",
          updated_at: new Date().toISOString(),
        }))
        .filter((f) => f.zalo_global_id);

      const { data: upsertedIdentities, error } = await supabase
        .from("zalo_identities")
        .upsert(identitiesToUpsert, { onConflict: "zalo_global_id" })
        .select("id, zalo_global_id");

      if (error) {
        console.error("[Sync] Error upserting identities:", error);
        continue;
      }

      // Map ZaloID -> UUID
      const uuidMap = new Map<string, string>();
      upsertedIdentities?.forEach((row: any) =>
        uuidMap.set(row.zalo_global_id, row.id),
      );

      // B. Process Connections & Conversations
      await Promise.all(
        batch.map(async (friend) => {
          try {
            const friendZaloId = friend.userId || friend.id || friend.uid;
            const identityId = uuidMap.get(friendZaloId);

            if (!identityId) return;

            // 1. Upsert Connection (Is Friend = TRUE)
            await supabase.from("zalo_connections").upsert(
              {
                observer_id: botId,
                target_id: identityId,
                external_uid: friendZaloId,
                relationship_data: { is_friend: true, source: "sync" },
                last_interaction_at: new Date().toISOString(),
              },
              { onConflict: "observer_id, target_id" },
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
            console.error(`[Sync] Friend Processing Error:`, e);
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
        else if (Array.isArray(raw))
          groupIds = raw.map((g: any) => (typeof g === "string" ? g : g.id));
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
          const info = gridInfoMap[groupId] || {};

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

      // Upsert Identities (Group Members) - No is_friend
      const identitiesToUpsert = batch.map((uid) => ({
        zalo_global_id: uid,
        display_name: `Member ${uid}`, // Placeholder
        type: "user",
        updated_at: new Date().toISOString(),
      }));

      const { data } = await supabase
        .from("zalo_identities")
        .upsert(identitiesToUpsert, { onConflict: "zalo_global_id" })
        .select("id, zalo_global_id");

      if (data) {
        for (const identity of data) {
          // Create Connection (Stranger) ONLY IF NOT EXISTS
          const { data: existingConn } = await supabase
            .from("zalo_connections")
            .select("id")
            .eq("observer_id", botId)
            .eq("target_id", identity.id)
            .single();

          if (!existingConn && identity.id !== botId) {
            await supabase.from("zalo_connections").insert({
              observer_id: botId,
              target_id: identity.id,
              external_uid: identity.zalo_global_id,
              relationship_data: {
                is_friend: false,
                source: "group_sync",
                group_id: groupId,
              },
              last_interaction_at: new Date().toISOString(),
            });
          }

          // 3. Add Member to Group
          await ConversationService.addMember(
            convId,
            identity.id,
            "member",
            null,
          );
        }
      }
    }
  }
}
