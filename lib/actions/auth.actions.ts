"use server";

/**
 * lib/actions/auth.actions.ts
 * [UPDATED V6 Strict]
 * - Sử dụng bảng zalo_bot_info (chứa credential) và zalo_identities (persona).
 * - Lưu token vào access_token JSONB.
 */

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import supabase from "@/lib/supabaseServer";

export async function startLoginWithTokenAction(
  botId: string, // Có thể là ID bot cũ hoặc string tạm
  tokenJson: string,
) {
  console.log(`[AuthAction] Start Login...`);

  if (!botId || !tokenJson) {
    return { success: false, error: "Thiếu thông tin Bot ID hoặc Token." };
  }

  try {
    let credentials;
    try {
      credentials = JSON.parse(tokenJson);
    } catch (e) {
      return { success: false, error: "Invalid JSON Token." };
    }

    // 1. Init Runtime & Verify
    const manager = BotRuntimeManager.getInstance();
    const api = await manager.loginWithCredentials(botId, credentials);
    if (!api) throw new Error("API Init Failed.");

    // 2. Get Info
    // @ts-expect-error: Zalo API dynamic type
    const selfInfo = await api.getSelfInfo();
    if (!selfInfo || !selfInfo.uid) {
      await manager.stopBot(botId);
      return { success: false, error: "Token Expired." };
    }

    const zaloUid = selfInfo.uid;
    const botName = selfInfo.name || `Bot ${zaloUid}`;

    console.log(`[AuthAction] Verified UID: ${zaloUid}`);

    // 3. Database Update logic (V6 Structure)

    // Bước A: Tìm xem Identity (User/Bot) đã tồn tại chưa
    const { data: existingIdentity } = await supabase
      .from("zalo_identities")
      .select("id, ref_bot_id")
      .eq("zalo_global_id", zaloUid)
      .single();

    let botInfoId = existingIdentity?.ref_bot_id;

    // Bước B: Upsert Zalo Bot Info (Technical Record)
    // Nếu chưa có botInfoId, tạo mới.

    const botInfoPayload = {
      name: botName,
      access_token: credentials, // [CORE] Lưu token vào cột JSONB như cũ
      status: { state: "LOGGED_IN" },
      is_active: true,
      is_realtime_active: false, // Default OFF
      updated_at: new Date().toISOString(),
    };

    if (botInfoId) {
      // Update existing info
      const { error } = await supabase
        .from("zalo_bot_info")
        .update(botInfoPayload)
        .eq("id", botInfoId);
      if (error) throw error;
    } else {
      // Create new info
      const { data: newInfo, error } = await supabase
        .from("zalo_bot_info")
        .insert(botInfoPayload)
        .select("id")
        .single();
      if (error) throw error;
      botInfoId = newInfo.id;
    }

    // Bước C: Upsert Zalo Identity (Persona)
    const { data: identity, error: idError } = await supabase
      .from("zalo_identities")
      .upsert(
        {
          zalo_global_id: zaloUid, // [NAME MATCH]
          display_name: botName,
          avatar: selfInfo.avatar,
          type: "system_bot",
          ref_bot_id: botInfoId, // Link to Info
          updated_at: new Date().toISOString(),
        },
        { onConflict: "zalo_global_id" },
      )
      .select()
      .single();

    if (idError) throw idError;

    // 4. Stop Runtime (No Sync)
    await manager.stopBot(botId);

    return {
      success: true,
      message: "Login Success.",
      botId: identity.id, // Trả về Identity ID để UI redirect
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[AuthAction] Error:", errMsg);
    try {
      BotRuntimeManager.getInstance().stopBot(botId);
    } catch (e) {}
    return { success: false, error: errMsg };
  }
}

export async function logoutBotAction(identityId: string) {
  // Tìm bot info ID từ identity
  const { data } = await supabase
    .from("zalo_identities")
    .select("ref_bot_id")
    .eq("id", identityId)
    .single();
  if (data?.ref_bot_id) {
    await supabase
      .from("zalo_bot_info")
      .update({
        status: { state: "STOPPED" },
        is_active: false,
        is_realtime_active: false,
      })
      .eq("id", data.ref_bot_id);
  }

  try {
    BotRuntimeManager.getInstance().stopBot(identityId);
  } catch (e) {}

  return { success: true };
}
