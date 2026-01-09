/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/listeners/zalo-event-listener.ts
 * [VERSION 15.3 - RAW LOGGING & DEBUG MODE]
 * - Change: Temporarily disabled MessagePipeline to bypass DB errors.
 * - Logic: Catch All Events -> Classify -> Log Raw JSON.
 */

import { API } from "zca-js";
// import { MessagePipeline } from "@/lib/core/pipelines/message-pipeline"; // [DISABLED FOR DEBUG]
import { InteractionHandler } from "./handlers/interaction-handler";
import { GroupHandler } from "./handlers/group-handler";
import { EphemeralHandler } from "./handlers/ephemeral-handler";

export class ZaloEventListener {
  private botId: string;
  private api: any; // Raw API object
  private isListening: boolean = false; // [GUARD FLAG]

  // Sub-handlers
  // private messagePipeline: MessagePipeline; // [DISABLED]
  private interactionHandler: InteractionHandler;
  private groupHandler: GroupHandler;
  private ephemeralHandler: EphemeralHandler;

  constructor(botId: string, api: API) {
    this.botId = botId;
    this.api = api as any; // Cast to access listener

    // Init Handlers
    // this.messagePipeline = new MessagePipeline(); // [DISABLED]
    this.interactionHandler = new InteractionHandler();
    this.groupHandler = new GroupHandler();
    this.ephemeralHandler = new EphemeralHandler();
  }

  public start() {
    if (this.isListening) {
      console.warn(`[Listener:${this.botId}] Already listening.`);
      return;
    }

    if (!this.api.listener) {
      console.error(`[Listener:${this.botId}] ❌ API Listener not available.`);
      return;
    }

    console.log(
      `[Listener:${this.botId}] 🔌 Starting Event Listener (RAW LOGGING MODE)...`,
    );

    // 1. Clean up old listeners to prevent duplication
    this.stop();

    // 2. Register Events
    const listener = this.api.listener;

    // --- MESSAGE ---
    listener.on("message", async (msg: any) => {
      // [GUARD] Chặn ngay nếu đã tắt lắng nghe
      if (!this.isListening) return;

      // [DEBUG LOGIC] Phân loại & Log Raw
      const msgType = msg.data?.msgType || "unknown";
      const sender = msg.data?.uidFrom || "unknown";
      const thread = msg.data?.id || "unknown";

      console.log(`\n========================================`);
      console.log(`[Listener:${this.botId}] 📩 EVENT: MESSAGE`);
      console.log(`- Type: ${msgType}`);
      console.log(`- From: ${sender} | Thread: ${thread}`);
      console.log(`- Raw JSON:`, JSON.stringify(msg, null, 2));
      console.log(`========================================\n`);

      /* [DISABLED PIPELINE]
      try {
        await this.messagePipeline.process(this.botId, msg);
      } catch (e) {
        console.error(`[Listener:${this.botId}] Message Error:`, e);
      }
      */
    });

    // --- GROUP EVENTS ---
    listener.on("group_event", async (event: any) => {
      if (!this.isListening) return; // [GUARD]

      console.log(`\n========================================`);
      console.log(`[Listener:${this.botId}] 👥 EVENT: GROUP`);
      console.log(`- Type: ${event.type}`);
      console.log(`- GroupId: ${event.groupId}`);
      console.log(`- Raw JSON:`, JSON.stringify(event, null, 2));
      console.log(`========================================\n`);

      // Vẫn giữ handler nhẹ này vì nó ít gây lỗi DB phức tạp
      await this.groupHandler.handleGroupEvent(event, this.botId, this.api);
    });

    // --- INTERACTION: UNDO (Thu hồi) ---
    listener.on("undo", async (event: any) => {
      if (!this.isListening) return; // [GUARD]

      console.log(`\n========================================`);
      console.log(`[Listener:${this.botId}] ↩️ EVENT: UNDO (RECALL)`);
      console.log(`- MsgId: ${event.msgId}`);
      console.log(`- Raw JSON:`, JSON.stringify(event, null, 2));
      console.log(`========================================\n`);

      await this.interactionHandler.handleUndo(event, this.botId);
    });

    // --- INTERACTION: REACTION ---
    listener.on("reaction", async (event: any) => {
      if (!this.isListening) return; // [GUARD]

      console.log(`\n========================================`);
      console.log(`[Listener:${this.botId}] ❤️ EVENT: REACTION`);
      console.log(`- Raw JSON:`, JSON.stringify(event, null, 2));
      console.log(`========================================\n`);

      await this.interactionHandler.handleReaction(event, this.botId);
    });

    // --- EPHEMERAL: TYPING ---
    listener.on("typing", (event: any) => {
      if (!this.isListening) return; // [GUARD]
      // Typing xảy ra liên tục, log gọn hơn
      console.log(
        `[Listener:${this.botId}] ⌨️ EVENT: TYPING | User: ${event.uid} | IsTyping: ${event.isTyping}`,
      );
      // console.log(`Raw:`, JSON.stringify(event)); // Uncomment nếu cần xem full

      this.ephemeralHandler.handleTyping(event, this.botId);
    });

    // --- EPHEMERAL: SEEN ---
    listener.on("seen", (event: any) => {
      if (!this.isListening) return; // [GUARD]

      console.log(
        `[Listener:${this.botId}] 👀 EVENT: SEEN | User: ${event.uid} | Msg: ${event.msgId}`,
      );
      // console.log(`Raw:`, JSON.stringify(event));

      this.ephemeralHandler.handleSeen(event, this.botId);
    });

    // --- ERROR HANDLING ---
    listener.on("error", (error: any) => {
      console.error(`[Listener:${this.botId}] 💥 Socket Error:`, error);
    });

    // 3. Start Socket
    try {
      listener.start();
      this.isListening = true;
      console.log(`[Listener:${this.botId}] ✅ Listener STARTED (Debug Mode).`);
    } catch (e) {
      console.error(`[Listener:${this.botId}] Failed to start listener:`, e);
    }
  }

  public stop() {
    this.isListening = false; // [IMPORTANT] Set flag immediately

    if (this.api.listener) {
      try {
        this.api.listener.stop();
        this.api.listener.removeAllListeners(); // Quan trọng: Xóa hết đăng ký cũ
        console.log(`[Listener:${this.botId}] 🛑 Listener STOPPED & Cleaned.`);
      } catch (e) {
        console.warn(`[Listener:${this.botId}] Error stopping listener:`, e);
      }
    }
  }

  public getStatus() {
    return this.isListening ? "ACTIVE" : "STOPPED";
  }
}
