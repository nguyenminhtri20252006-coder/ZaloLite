"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { ZaloUserProfile, ZaloSettingsResponse } from "@/lib/types/zalo.types";

async function getBotAPI(botId: string) {
  try {
    return BotRuntimeManager.getInstance().getBotAPI(botId);
  } catch (error) {
    throw new Error(`Bot connection not found for ID: ${botId}`);
  }
}

export async function getBotProfileAction(
  botId: string,
): Promise<{ success: boolean; data?: ZaloUserProfile; error?: string }> {
  try {
    const api = await getBotAPI(botId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawData: any = await api.fetchAccountInfo();

    console.log("Raw Profile Data:", JSON.stringify(rawData, null, 2));

    // [FIX] Handle nested 'profile' object from log: { profile: { ... } }
    const source = rawData.profile || rawData;

    if (!source) {
      return { success: false, error: "Không lấy được dữ liệu profile." };
    }

    // Map fields correctly based on log
    const profile: ZaloUserProfile = {
      userId: source.userId || source.id || "",
      displayName: source.displayName || source.username || "Unknown",
      zaloName: source.zaloName || "",
      avatar: source.avatar || "",
      cover: source.cover || "",
      gender: typeof source.gender === "number" ? source.gender : 0,
      dob: typeof source.dob === "number" ? source.dob : 0,
      sdob: source.sdob || source.s_dob || "",
      status: source.status || "",
      phoneNumber: source.phoneNumber || source.phone || "Hidden",
    };

    return { success: true, data: profile };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Get Bot Profile Error:", err);
    return { success: false, error: err.message };
  }
}

export async function updateActiveStatusAction(
  botId: string,
  isActive: boolean,
) {
  try {
    const api = await getBotAPI(botId);
    await api.updateActiveStatus(isActive);
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Update Active Status Error:", err);
    return { success: false, error: err.message };
  }
}

export async function changeFriendAliasAction(
  botId: string,
  friendId: string,
  alias: string,
) {
  try {
    const api = await getBotAPI(botId);
    await api.changeFriendAlias(friendId, alias);
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Change Alias Error:", err);
    return { success: false, error: err.message };
  }
}

export async function getBlockListAction(
  botId: string,
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    const api = await getBotAPI(botId);
    const settings =
      (await api.getSettings()) as unknown as ZaloSettingsResponse;
    const blockedUids = settings?.privacy?.blacklist || [];
    return { success: true, data: blockedUids };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function toggleBlockFeedAction(
  botId: string,
  userId: string,
  isBlock: boolean,
) {
  try {
    const api = await getBotAPI(botId);
    type CorrectBlockFeedSignature = {
      blockViewFeed: (userId: string, isBlock: boolean) => Promise<unknown>;
    };
    await (api as unknown as CorrectBlockFeedSignature).blockViewFeed(
      userId,
      isBlock,
    );
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Toggle Block Feed Error:", err);
    return { success: false, error: err.message };
  }
}
