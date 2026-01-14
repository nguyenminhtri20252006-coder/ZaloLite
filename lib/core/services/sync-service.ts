/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/services/sync-service.ts
 * [CORE SERVICE - V13.1 STOP SYNC FIX via DB FLAG]
 * - Fix: Stop Sync using Database Flag instead of In-Memory Map.
 * - Logic: Check DB status before processing each batch.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ConversationService } from "@/lib/core/services/conversation-service";
import { FriendService } from "@/lib/core/services/friend-service";
import { sseManager } from "@/lib/core/sse-manager";
import supabase from "@/lib/supabaseServer";

// [NEW] Interface định nghĩa dữ liệu trả về từ API Zalo để Fix lỗi TS
interface ZaloRawProfile {
  userId?: string;
  globalId?: string;
  displayName?: string;
  zaloName?: string;
  name?: string;
  avatar?: string;
  avt?: string;
}

// Quản lý cờ dừng cho từng Bot
const syncAbortControllers = new Map<string, { aborted: boolean }>();

export class SyncService {
  private static log(
    targetId: string,
    message: string,
    type: "info" | "success" | "error" | "warning" = "info",
  ) {
    console.log(`[SyncService:${targetId}] ${message}`);

    // [UPDATED] Pub/Sub Broadcast
    // Topic: sync_bot_{botId}
    const topic = `sync_bot_${targetId}`;

    sseManager.broadcast(topic, "sync-log", {
      timestamp: new Date().toISOString(),
      message,
      type,
      botId: targetId, // Include botId for UI filtering
    });
  }
  private static async updateSyncStatus(botId: string, status: any) {
    // Tìm bot_info_id từ identityId (botId truyền vào thường là identityId)
    let targetId = botId;
    // Thử check xem botId có phải identityId không để lấy ref_bot_id
    const { data } = await supabase
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", botId)
      .single();
    if (data?.ref_bot_id) targetId = data.ref_bot_id;

    await supabase
      .from("zalo_bot_info")
      .update({
        sync_status: {
          ...status,
          last_updated: new Date().toISOString(),
        },
      })
      .eq("id", targetId);
  }

  // [NEW] Kiểm tra cờ dừng từ DB
  private static async shouldAbort(botId: string): Promise<boolean> {
    let targetId = botId;
    const { data: identity } = await supabase
      .from("zalo_identities")
      .select("ref_bot_id")
      .eq("id", botId)
      .single();
    if (identity?.ref_bot_id) targetId = identity.ref_bot_id;

    const { data } = await supabase
      .from("zalo_bot_info")
      .select("sync_status")
      .eq("id", targetId)
      .single();

    const state = (data?.sync_status as any)?.state;
    // Nếu trạng thái là STOPPED -> Abort
    return state === "STOPPED";
  }

  // --- PUBLIC METHODS ---

  public static stopSync(botId: string) {
    const controller = syncAbortControllers.get(botId);
    if (controller) {
      controller.aborted = true;
      this.log(botId, "🛑 Đã nhận lệnh DỪNG ĐỒNG BỘ từ người dùng.", "warning");
      return true;
    }
    return false;
  }

  public static async debugFetchFullInfo(botId: string) {
    console.log(`\n🔍 [DEBUG SCANNER] STARTING FOR BOT: ${botId} 🔍\n`);
    const manager = BotRuntimeManager.getInstance();
    let api: any;

    try {
      await manager.getBotAPI(botId);
      return {
        success: true,
        data: { message: "Debug logs printed to server console" },
      };
    } catch (e: any) {
      console.error("❌ API Instance Error:", e.message);
      return { success: false, error: e.message };
    }

    const report: any = { timestamp: new Date().toISOString() };

    // 1. IDENTITY & PROFILE (Cốt lõi)
    try {
      if (typeof api.getOwnId === "function") {
        report.ownId = api.getOwnId();
      } else {
        report.ownId = "N/A (getOwnId missing)";
      }

      if (typeof api.fetchAccountInfo === "function") {
        report.accountInfo = await api.fetchAccountInfo();
      } else {
        report.accountInfo = "N/A (fetchAccountInfo missing)";
      }
    } catch (e: any) {
      report.identityError = e.message;
    }

    // 2. SETTINGS (Cấu hình)
    try {
      console.log("--> Fetching Settings...");
      if (typeof api.getSettings === "function") {
        report.settings = await api.getSettings();
      } else {
        report.settings = "N/A (getSettings missing)";
      }
    } catch (e: any) {
      report.settingsError = e.message;
    }

    // 3. GROUPS
    try {
      console.log("--> Fetching Groups...");
      if (typeof api.getAllGroups === "function") {
        const groups = await api.getAllGroups();
        report.groups = {
          dataType: typeof groups,
          isArray: Array.isArray(groups),
          isMap: groups instanceof Map,
          rawSample: groups, // Log raw để xem
        };
      } else {
        report.groups = "N/A (getAllGroups missing)";
      }
    } catch (e: any) {
      report.groupsError = e.message;
    }

    // 4. LABELS
    try {
      console.log("--> Fetching Labels...");
      if (typeof api.getLabels === "function") {
        report.labels = await api.getLabels();
      } else {
        report.labels = "N/A (getLabels missing)";
      }
    } catch (e: any) {
      report.labelsError = e.message;
    }

    // 5. AUTOMATION
    try {
      console.log("--> Fetching Automation...");
      if (typeof api.getQuickMessageList === "function") {
        report.quickMessages = await api.getQuickMessageList();
      }
      if (typeof api.getAutoReplyList === "function") {
        report.autoReply = await api.getAutoReplyList();
      }
    } catch (e: any) {
      report.automationError = e.message;
    }

    // 6. BUSINESS
    try {
      console.log("--> Fetching Business Info...");
      if (typeof api.getBizAccount === "function") {
        report.bizAccount = await api.getBizAccount();
      } else {
        report.bizAccount = "Not Supported in this ZCA version";
      }

      if (typeof api.getProductCatalogList === "function") {
        report.catalog = await api.getProductCatalogList();
      }
    } catch (e: any) {
      report.bizError = "Likely not a business account: " + e.message;
    }

    // --- LOG TO SERVER CONSOLE ---
    console.log("-------------------------------------------------------");
    console.log(JSON.stringify(report, null, 2));
    console.log("-------------------------------------------------------");
    console.log(`✅ [DEBUG SCANNER] COMPLETED \n`);

    return { success: true, data: report };
  }

  // ===========================================================================
  // 1. SYNC IDENTITY (SỬ DỤNG KHI LOGIN SUCCESS) - UPDATE LOGIC MAPPING
  // ===========================================================================
  public static async syncBotIdentity(botId: string, api: any) {
    console.log(`[Sync] Updating Identity for ${botId}...`);

    try {
      const ownId = api.getOwnId();
      const info = await api.fetchAccountInfo();
      let settings = {};
      try {
        if (typeof api.getSettings === "function") {
          settings = await api.getSettings();
        }
      } catch {}

      if (!info) {
        console.warn("[Sync] No account info returned.");
        return;
      }

      const profileSource = info.profile || info.data || info;

      const zaloGlobalId =
        profileSource.globalId ||
        profileSource.userId ||
        profileSource.uid ||
        ownId;

      const rootName =
        profileSource.zaloName ||
        profileSource.displayName ||
        profileSource.name ||
        "Bot";

      const avatar = profileSource.avatar || profileSource.avt || "";

      const rawDataPayload = {
        ...profileSource,
        settings: settings,
        _syncedAt: new Date().toISOString(),
      };

      // A. Update Identity
      const updatePayload: any = {
        zalo_global_id: String(zaloGlobalId),
        root_name: rootName,
        avatar: avatar,
        raw_data: rawDataPayload,
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from("zalo_identities")
        .update(updatePayload)
        .eq("id", botId);

      // B. Update Bot Info
      const { data: identity } = await supabase
        .from("zalo_identities")
        .select("ref_bot_id")
        .eq("id", botId)
        .single();

      if (identity?.ref_bot_id) {
        await supabase
          .from("zalo_bot_info")
          .update({
            name: rootName,
            avatar: avatar,
          })
          .eq("id", identity.ref_bot_id);
      }

      console.log(
        `[Sync] Identity Updated: ${rootName} (GlobalID: ${zaloGlobalId})`,
      );
    } catch (error: any) {
      console.error(`[Sync] Error syncing bot identity: ${error.message}`);
    }
  }

  public static async syncAll(botId: string, listenerId?: string) {
    const logChannel = listenerId || botId;

    // Reset abort controller
    syncAbortControllers.set(botId, { aborted: false });
    const abortController = syncAbortControllers.get(botId)!;

    this.log(logChannel, `🚀 Bắt đầu đồng bộ V13.0...`, "info");
    await this.updateSyncStatus(botId, {
      state: "RUNNING",
      step: "INIT",
      progress: 0,
    });

    try {
      const manager = BotRuntimeManager.getInstance();
      const api = await manager.getBotAPI(botId);
      const ownId = api.getOwnId();

      // 1. Friends
      if (await this.shouldAbort(botId)) throw new Error("User Aborted");
      await this.syncFriends(botId, api, logChannel);

      // 2. Groups
      if (await this.shouldAbort(botId)) throw new Error("User Aborted");
      await this.syncGroupsAndMembers(botId, api, logChannel, ownId);

      // 3. Metadata
      if (await this.shouldAbort(botId)) throw new Error("User Aborted");
      await this.syncConversationMetadata(botId, api, logChannel);

      // Final Check trước khi báo thành công
      if (await this.shouldAbort(botId)) throw new Error("User Aborted");

      this.log(logChannel, `✅ ĐỒNG BỘ HOÀN TẤT!`, "success");
      await this.updateSyncStatus(botId, { state: "COMPLETED", progress: 100 });
      return { success: true };
    } catch (error: any) {
      const isAborted = error.message === "User Aborted";
      const msg = isAborted
        ? "🛑 Đã dừng đồng bộ theo yêu cầu."
        : `❌ Lỗi System: ${error.message}`;
      const type = isAborted ? "warning" : "error";

      this.log(logChannel, msg, type);
      // Nếu lỗi do User Abort, giữ nguyên state STOPPED đã set bởi Action
      if (!isAborted) {
        await this.updateSyncStatus(botId, { state: "ERROR", error: msg });
      }

      return { success: false, error: msg };
    }
  }

  // --- 1. SYNC FRIENDS ---
  private static async syncFriends(
    botId: string,
    api: any,
    logChannel: string,
  ) {
    this.log(logChannel, `1. Sync Bạn bè...`);
    await this.updateSyncStatus(botId, { state: "RUNNING", step: "FRIENDS" });

    let friends: any[] = [];
    try {
      friends = await api.getAllFriends();
      this.log(logChannel, `-> Tìm thấy ${friends.length} bạn bè.`);
    } catch (e: any) {
      this.log(logChannel, `Lỗi tải bạn bè: ${e.message}`, "error");
      return;
    }

    if (!friends || !Array.isArray(friends)) return;

    const DB_BATCH = 50;
    let count = 0;

    for (let i = 0; i < friends.length; i += DB_BATCH) {
      if (await this.shouldAbort(botId)) return; // Check abort per batch

      const batch = friends.slice(i, i + DB_BATCH);
      await Promise.all(
        batch.map(async (friend) => {
          const globalId = friend.globalId;
          const uid = friend.userId || friend.id || friend.uid;
          if (!globalId || !uid) return;

          const identityId = await FriendService.upsertIdentity(
            globalId,
            friend,
            "user",
          );

          if (identityId) {
            await FriendService.upsertConnection(botId, identityId, uid, {
              is_friend: true,
              type: "friend",
              source: "sync_friends_api",
            });

            const friendName =
              friend.zaloName || friend.displayName || `Friend ${uid}`;
            const convId = await ConversationService.upsertPrivateConversation(
              botId,
              identityId,
              friendName,
              friend.avatar,

              friend,
            );

            if (convId) {
              await ConversationService.addMember(convId, botId, "admin", uid);
              await ConversationService.addMember(
                convId,
                identityId,
                "member",
                null,
              );
            }
            count++;
          }
        }),
      );
    }
    this.log(logChannel, `-> Đã xử lý xong ${count} bạn bè.`, "success");
  }

  // ===========================================================================
  // 2. SYNC GROUPS & MEMBERS (UPDATED LOGIC)
  // ===========================================================================
  private static async syncGroupsAndMembers(
    botId: string,
    api: any,
    logChannel: string,
    ownId: string,
  ) {
    this.log(logChannel, `2. Sync Nhóm...`);
    await this.updateSyncStatus(botId, { state: "RUNNING", step: "GROUPS" });

    let groupIds: string[] = [];

    try {
      const raw = await api.getAllGroups();
      if (raw && typeof raw === "object") {
        if (raw.gridVerMap) groupIds = Object.keys(raw.gridVerMap);
        else if (Array.isArray(raw))
          groupIds = raw.map((g: any) => (typeof g === "string" ? g : g.id));
      }
      this.log(logChannel, `-> Tìm thấy ${groupIds.length} nhóm.`);
    } catch (e: any) {
      this.log(logChannel, `Lỗi tải nhóm: ${e.message}`, "error");
      return;
    }

    const GROUP_CHUNK_SIZE = 5;

    for (let i = 0; i < groupIds.length; i += GROUP_CHUNK_SIZE) {
      if (await this.shouldAbort(botId)) {
        this.log(logChannel, "Ngắt sync nhóm do lệnh dừng.", "warning");
        break; // Check Abort
      }

      const chunkIds = groupIds.slice(i, i + GROUP_CHUNK_SIZE);
      const progress = Math.round((i / groupIds.length) * 100);

      this.log(
        logChannel,
        `[Tiến trình] Xử lý nhóm ${i + 1}-${Math.min(
          i + GROUP_CHUNK_SIZE,
          groupIds.length,
        )}/${groupIds.length} (${progress}%)`,
      );
      await this.updateSyncStatus(botId, {
        state: "RUNNING",
        step: "GROUPS",
        progress,
        detail: `Processing group batch ${i}`,
      });

      try {
        const groupInfosRes = await api.getGroupInfo(chunkIds);
        const gridInfoMap = groupInfosRes.gridInfoMap || {};

        for (const groupId of chunkIds) {
          if (await this.shouldAbort(botId)) break; // Check Abort inside loop

          const info = gridInfoMap[groupId];
          if (!info) continue;

          const groupGlobalId = info.globalId;
          const groupNumericId = groupId;

          if (!groupGlobalId) continue;

          const convId = await ConversationService.upsertGroupConversation(
            groupGlobalId,
            info.name || `Group ${groupNumericId}`,
            info.avt || info.fullAvt || "",
            info,
          );

          if (!convId) continue;

          // 2. Add Bot to Group
          const myId = api.getOwnId();
          const isAdmin = (info.adminIds || []).includes(myId);
          await ConversationService.addMember(
            convId,
            botId,
            isAdmin ? "admin" : "member",
            groupNumericId,
          );

          // 3. SYNC MEMBERS (GET REAL INFO)
          let memberUids: string[] = info.memVerList || [];
          memberUids = memberUids.map((m: string) => m.split("_")[0]);

          // Fallback
          if (
            memberUids.length === 0 &&
            typeof api.getGroupMembersInfo === "function"
          ) {
            try {
              const mems = await api.getGroupMembersInfo(groupId);
              if (Array.isArray(mems))
                memberUids = mems.map((m: any) => m.id || m.uid);
            } catch (e) {}
          }

          if (memberUids.length > 0) {
            await this.processGroupMembersWithRealInfo(
              botId,
              convId,
              groupId,
              memberUids,
              api,
              logChannel,
              ownId,
              info.name,
            );
          }
        }
      } catch (err: any) {
        this.log(logChannel, `Lỗi lô nhóm: ${err.message}`, "error");
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // --- 3. HELPER BATCH INFO (SMART RATE LIMIT HANDLING) ---
  private static async processGroupMembersWithRealInfo(
    botId: string,
    convId: string,
    groupId: string,
    uids: string[],
    api: any,
    logChannel: string,
    ownId: string,
    groupName: string,
  ) {
    if (await this.shouldAbort(botId)) return;

    const MEMBER_BATCH_SIZE = 20;
    const DELAY_MS = 1500;

    let consecutiveRateLimitErrors = 0;
    const MAX_GLOBAL_FAILURES = 2;

    if (uids.length > 20) {
      this.log(
        logChannel,
        `   > Nhóm "${groupName}": Sync ${uids.length} mems...`,
      );
    }

    for (let i = 0; i < uids.length; i += MEMBER_BATCH_SIZE) {
      if (await this.shouldAbort(botId)) {
        this.log(logChannel, "   -> Dừng lấy thành viên.", "warning");
        return; // Check Abort
      }

      const batchUids = uids.slice(i, i + MEMBER_BATCH_SIZE);
      const batchIndex = Math.floor(i / MEMBER_BATCH_SIZE) + 1;

      let rawResponse: any = null;
      let success = false;

      try {
        if (typeof api.getUserInfo !== "function")
          throw new Error("API missing");

        // Gọi API (Chỉ thử 1 lần, nếu lỗi Rate Limit xử lý ngay, không retry mù quáng)
        rawResponse = await api.getUserInfo(batchUids);
        success = true;
        consecutiveRateLimitErrors = 0;
      } catch (e: any) {
        const errMsg = (e.message || String(e)).toLowerCase();
        const isRateLimit =
          errMsg.includes("request") ||
          errMsg.includes("limit") ||
          errMsg.includes("chặn") ||
          errMsg.includes("429");

        if (isRateLimit) {
          consecutiveRateLimitErrors++;
          this.log(
            logChannel,
            `      ⚠ Lô ${batchIndex} bị chặn! (Fail count: ${consecutiveRateLimitErrors})`,
            "warning",
          );

          // Nếu bị chặn liên tiếp -> Kích hoạt Circuit Breaker
          if (consecutiveRateLimitErrors >= MAX_GLOBAL_FAILURES) {
            this.log(
              logChannel,
              `      ⛔ TỰ ĐỘNG DỪNG do Rate Limit quá nhiều.`,
              "error",
            );
            // Force Stop in DB
            await this.updateSyncStatus(botId, {
              state: "STOPPED",
              error: "Auto-stopped due to Rate Limit",
            });
            return;
          }

          // Nếu mới bị lần đầu -> Ngủ đông ngắn (30s) rồi bỏ qua lô này
          this.log(logChannel, `      ⏳ Tạm nghỉ 30s...`, "info");
          await new Promise((r) => setTimeout(r, 30000));
          continue;
        }
      }

      if (!success || !rawResponse) continue;

      // --- PROCESSING SUCCESSFUL RESPONSE ---
      try {
        const identitiesToUpsert = batchUids
          .map((uid) => {
            // Parse profile
            let profile: ZaloRawProfile | null = null;

            if (
              rawResponse.changed_profiles &&
              rawResponse.changed_profiles[uid]
            ) {
              profile = rawResponse.changed_profiles[uid];
            } else if (rawResponse[uid]) {
              profile = rawResponse[uid];
            }

            const hasValidProfile = !!(profile?.globalId || profile?.userId);

            if (!hasValidProfile) return null;

            const finalGlobalId = profile!.globalId || profile!.userId || uid;
            const finalName =
              profile!.zaloName ||
              profile!.displayName ||
              profile!.name ||
              `User ${uid}`;
            const finalAvatar = profile!.avatar || profile!.avt || "";

            return {
              zalo_global_id: finalGlobalId,
              root_name: finalName,
              avatar: finalAvatar,
              type: "user",
              raw_data: profile,
              updated_at: new Date().toISOString(),
              _uid: uid,
            };
          })
          .filter((item) => item !== null);

        // [PROTECTION] Lọc bỏ System Bot để không ghi đè
        if (identitiesToUpsert.length > 0) {
          const targetGlobalIds = identitiesToUpsert.map(
            (p) => p!.zalo_global_id,
          );
          const { data: protectedBots } = await supabase
            .from("zalo_identities")
            .select("zalo_global_id")
            .in("zalo_global_id", targetGlobalIds)
            .eq("type", "system_bot");

          const protectedSet = new Set(
            protectedBots?.map((b) => b.zalo_global_id) || [],
          );

          const safeIdentities = identitiesToUpsert.filter((item) => {
            if (!item) return false;
            if (item._uid === ownId) return false;
            if (protectedSet.has(item.zalo_global_id!)) return false;
            return true;
          });

          if (safeIdentities.length > 0) {
            // Upsert Identities
            const { data: upserted } = await supabase
              .from("zalo_identities")
              .upsert(
                safeIdentities.map(({ _uid, ...rest }) => rest),
                { onConflict: "zalo_global_id" },
              )
              .select("id, zalo_global_id");

            if (upserted) {
              // Map Connections
              const globalToUidMap = new Map<string, string>();
              safeIdentities.forEach((item) => {
                if (item) globalToUidMap.set(item.zalo_global_id!, item._uid);
              });

              await Promise.all(
                upserted.map(async (identity) => {
                  const numericUid = globalToUidMap.get(
                    identity.zalo_global_id,
                  );
                  if (!numericUid) return;

                  if (identity.id !== botId) {
                    await FriendService.upsertConnection(
                      botId,
                      identity.id,
                      numericUid,
                      {
                        is_friend: false,
                        type: "stranger",
                        source: `group_${groupId}`,
                      },
                    );
                    await ConversationService.addMember(
                      convId,
                      identity.id,
                      "member",
                      null,
                    );
                  }
                }),
              );
            }
          }
        }
      } catch (err: any) {
        this.log(logChannel, `Lỗi DB: ${err.message}`, "error");
      }

      // Delay Base
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // --- 4. METADATA (Giữ nguyên) ---
  private static async syncConversationMetadata(
    botId: string,
    api: any,
    logChannel: string,
  ) {
    this.log(logChannel, `3. Sync Metadata...`);
    const metaUpdates: Record<string, any> = {};
    const addUpdate = (threadId: string, key: string, val: boolean) => {
      if (!metaUpdates[threadId]) metaUpdates[threadId] = {};
      metaUpdates[threadId][key] = val;
    };
    try {
      if (typeof api.getPinConversations === "function") {
        const pinned = await api.getPinConversations();
        const ids = Array.isArray(pinned) ? pinned : [];
        ids.forEach((p: any) =>
          addUpdate(typeof p === "string" ? p : p.id, "pinned", true),
        );
      }
    } catch (e) {}

    // B. Hidden
    try {
      if (typeof api.getHiddenConversations === "function") {
        const hidden = await api.getHiddenConversations();
        console.log(`[DEBUG API] Hidden:`, JSON.stringify(hidden, null, 2));
        const ids = Array.isArray(hidden) ? hidden : [];
        ids.forEach((h: any) =>
          addUpdate(typeof h === "string" ? h : h.id, "hidden", true),
        );
      }
    } catch (e) {}

    for (const [threadId, settings] of Object.entries(metaUpdates)) {
      const { data: memberRec } = await supabase
        .from("conversation_members")
        .select("conversation_id, settings")
        .eq("identity_id", botId)
        .eq("thread_id", threadId)
        .single();

      if (memberRec) {
        const newSettings = { ...(memberRec.settings || {}), ...settings };
        await supabase
          .from("conversation_members")
          .update({ settings: newSettings })
          .eq("conversation_id", memberRec.conversation_id)
          .eq("identity_id", botId);

        console.log(`[Sync] Updated Meta for ${threadId}:`, newSettings);
      }
    }
    this.log(logChannel, `-> Hoàn tất metadata.`);
  }
}
