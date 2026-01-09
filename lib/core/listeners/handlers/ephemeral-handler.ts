/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/listeners/handlers/ephemeral-handler.ts
 * [UPDATED] Tích hợp Broadcast Service.
 */

import { BroadcastService } from "@/lib/core/services/broadcast-service";

export class EphemeralHandler {
  public handleTyping(event: any, botId: string) {
    // event: { uid: string, isTyping: boolean, type: 'user'|'group', threadId: string }
    const { uid, isTyping, threadId } = event;

    // LOG để kiểm tra hoạt động
    console.log(
      `[Ephemeral] ⌨️ User ${uid} is ${
        isTyping ? "TYPING" : "STOPPED"
      } in ${threadId} (Bot: ${botId})`,
    );

    // Bắn lên Client
    BroadcastService.broadcastTyping(botId, threadId, isTyping, uid);
  }

  public handleSeen(event: any, botId: string) {
    // event: { uid: string, msgId: string, threadId: string }
    const { uid, msgId, threadId } = event;

    // LOG để kiểm tra hoạt động
    console.log(
      `[Ephemeral] 👀 User ${uid} SEEN msg ${msgId} in ${threadId} (Bot: ${botId})`,
    );

    // Bắn lên Client
    BroadcastService.broadcastSeen(botId, threadId, msgId, uid);
  }
}
