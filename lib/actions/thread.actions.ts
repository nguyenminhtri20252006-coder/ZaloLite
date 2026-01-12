/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import supabase from "@/lib/supabaseServer";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { resolveBotIdentityId } from "./chat.actions";

/**
 * Action: Lấy chi tiết hội thoại (Enrichment)
 * Logic: Two-Tier Fetching (Basic -> Role Check -> Advanced)
 */
export async function getThreadDetailsAction(
  botId: string,
  threadUuid: string,
) {
  try {
    // 1. Resolve Identity & Context
    const identityId = await resolveBotIdentityId(botId);

    const { data: member } = await supabase
      .from("conversation_members")
      .select(
        "thread_id, conversation:conversations(id, type, global_group_id)",
      )
      .eq("identity_id", identityId)
      .eq("conversation_id", threadUuid)
      .single();

    if (!member || !member.thread_id) {
      throw new Error("Không tìm thấy kết nối hội thoại (Thread ID missing).");
    }

    const threadId = member.thread_id;
    const conversation = member.conversation as any;
    const type = conversation.type; // 'group' | 'private'

    const api = await BotRuntimeManager.getInstance().getBotAPI(identityId);
    if (!api) throw new Error("Bot offline");

    let finalRawData: any = {};

    // 3. Logic phân nhánh theo loại hội thoại
    if (type === "group") {
      // =================================================================
      // TIER 1: Truy vấn thông tin cơ bản
      // =================================================================
      console.log(`[ThreadDetails] 1️⃣ Fetching Basic Group Info: ${threadId}`);

      const groupInfoRes = await api.getGroupInfo(threadId);

      // [FIX] Cast về any để tránh lỗi TS Union Type
      const basicInfo: any = groupInfoRes.gridInfoMap
        ? groupInfoRes.gridInfoMap[threadId]
        : groupInfoRes;

      if (!basicInfo) {
        throw new Error("Không lấy được thông tin nhóm từ Zalo.");
      }

      // Role Check
      const ownId = api.getOwnId();
      // [FIX] Access properties safely via any cast
      const creatorId = basicInfo.creatorId;
      const adminIds = basicInfo.adminIds || [];

      const isCreator = ownId === creatorId;
      // adminIds có thể là undefined trong 1 số trường hợp, cần optional check
      const isAdmin = Array.isArray(adminIds) && adminIds.includes(ownId);
      const hasAdminRights = isCreator || isAdmin;

      finalRawData = {
        ...basicInfo,
        _role: {
          isCreator,
          isAdmin,
          hasAdminRights,
        },
      };

      // =================================================================
      // TIER 2: Truy vấn nâng cao (Admin/Creator Only)
      // =================================================================
      if (hasAdminRights) {
        console.log(
          `[ThreadDetails] 2️⃣ Authorized (${
            isCreator ? "Creator" : "Admin"
          }). Fetching Advanced Info...`,
        );

        // 2.1 Link tham gia nhóm
        try {
          const linkInfo = await api.getGroupLinkDetail(threadId);
          if (linkInfo) {
            finalRawData.linkJoin = linkInfo;
          }
        } catch (e: any) {
          console.warn(
            `[ThreadDetails] ⚠️ Failed to get Group Link: ${e.message}`,
          );
          // Không push warning vào data để tránh làm rối UI
        }

        // 2.2 Danh sách chặn (API Blocked Member)
        // [FIX] Gọi đúng signature: (payload, groupId)
        try {
          const payload = { page: 1, count: 20 }; // Lấy 20 người đầu tiên
          const blockedRes = await api.getGroupBlockedMember(payload, threadId);
          finalRawData.blockedMembers = blockedRes || [];
        } catch (e: any) {
          console.warn(
            `[ThreadDetails] ⚠️ Failed to get Blocked Members: ${e.message}`,
          );
        }
      } else {
        console.log(
          `[ThreadDetails] 🚫 Member role detected. Skipping Tier 2 APIs.`,
        );
      }

      finalRawData._fetchedAt = new Date().toISOString();
      finalRawData._source = "realtime_action_v2";
    } else {
      // =================================================================
      // LOGIC PRIVATE CHAT
      // =================================================================
      console.log(`[ThreadDetails] Fetching Private User Info: ${threadId}`);

      const userInfoRes = await api.getUserInfo(threadId);
      const userProfile = userInfoRes[threadId] || userInfoRes;

      // 2. Alias
      let alias = "";
      try {
        // [FIX] Sử dụng 'as unknown as any[]' để giải quyết xung đột Type
        const aliasesResponse = await api.getAliasList();
        const aliases = aliasesResponse as unknown as any[];

        if (Array.isArray(aliases)) {
          const aliasObj = aliases.find((a: any) => a.id === threadId);
          if (aliasObj) alias = aliasObj.displayName;
        }
      } catch {}

      finalRawData = {
        ...userProfile,
        alias: alias,
        _fetchedAt: new Date().toISOString(),
        _source: "realtime_action_v2",
      };
    }

    // 4. Update Database
    await supabase
      .from("conversations")
      .update({
        raw_data: finalRawData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadUuid);

    console.log(`[ThreadDetails] ✅ Success. Data updated for ${threadUuid}`);
    return { success: true, data: finalRawData };
  } catch (error: any) {
    console.error("[ThreadAction] Get Details Critical Error:", error);
    return { success: false, error: error.message || "Lỗi không xác định" };
  }
}
