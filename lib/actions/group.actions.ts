"use server";

import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";

export async function createGroupAction(payload: {
  name: string;
  members: string[];
}) {
  try {
    // Tương tự friend.actions, cần botId để thực thi
    // const api = BotRuntimeManager.getInstance().getBotAPI(botId);
    // await api.createGroup({ groupName: payload.name, members: payload.members });
    return { success: true };
  } catch (error: unknown) {
    console.error("Create Group Error:", error);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
