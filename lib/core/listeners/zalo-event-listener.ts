/* eslint-disable @typescript-eslint/no-explicit-any */
import { API } from "zca-js";
import { sseManager } from "@/lib/core/sse-manager";
import { SimpleMessagePipeline } from "@/lib/core/pipelines/simple-message-pipeline";
import { InteractionHandler } from "./handlers/interaction-handler";
import { GroupHandler } from "./handlers/group-handler";
import { EphemeralHandler } from "./handlers/ephemeral-handler";
import { DebugLogger } from "@/lib/utils/debug-logger"; // Import Logger
import { AdvancedMessagePipeline } from "@/lib/core/pipelines/advanced-message-pipeline";
const USE_ADVANCED_PIPELINE = true;
export class ZaloEventListener {
  private botId: string;
  private api: any;
  private isListening: boolean = false;

  private simplePipeline: SimpleMessagePipeline;
  private advancedPipeline: AdvancedMessagePipeline;
  private interactionHandler: InteractionHandler;
  private groupHandler: GroupHandler;
  private ephemeralHandler: EphemeralHandler;

  constructor(botId: string, api: API) {
    this.botId = botId;
    this.api = api as any;
    this.simplePipeline = new SimpleMessagePipeline();
    this.advancedPipeline = new AdvancedMessagePipeline();
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

    console.log(`[Listener:${this.botId}] 🔌 Starting Event Listener...`);
    this.stop();

    const listener = this.api.listener;

    // --- MESSAGE ---
    listener.on("message", async (msg: any) => {
      if (!this.isListening) return;

      // [DEBUG LOG]
      DebugLogger.logEvent(this.botId, "MESSAGE", msg);

      try {
        if (USE_ADVANCED_PIPELINE) {
          console.log(
            `[Listener] Routing to ADVANCED Pipeline for ${this.botId}`,
          );
          await this.advancedPipeline.process(this.botId, msg);
        } else {
          console.log(
            `[Listener] Routing to SIMPLE Pipeline for ${this.botId}`,
          );
          await this.simplePipeline.process(this.botId, msg);
        }
      } catch (e) {
        console.error(`[Listener:${this.botId}] Pipeline Error:`, e);
      }
    });

    // --- GROUP EVENTS ---
    listener.on("group_event", async (event: any) => {
      if (!this.isListening) return;
      DebugLogger.logEvent(this.botId, "GROUP_EVENT", event);
      await this.groupHandler.handleGroupEvent(event, this.botId, this.api);
    });

    // --- INTERACTION ---
    listener.on("undo", async (event: any) => {
      if (!this.isListening) return;
      DebugLogger.logEvent(this.botId, "UNDO", event);
      await this.interactionHandler.handleUndo(event, this.botId);
    });

    listener.on("reaction", async (event: any) => {
      if (!this.isListening) return;
      DebugLogger.logEvent(this.botId, "REACTION", event);
      await this.interactionHandler.handleReaction(event, this.botId);
    });

    // --- EPHEMERAL ---
    listener.on("typing", (event: any) => {
      if (!this.isListening) return;
      // Typing quá nhiều nên có thể không cần log detail liên tục
      // DebugLogger.logEvent(this.botId, "TYPING", event);
      this.ephemeralHandler.handleTyping(event, this.botId);
    });

    listener.on("seen", (event: any) => {
      if (!this.isListening) return;
      this.ephemeralHandler.handleSeen(event, this.botId);
    });

    listener.on("error", (error: any) => {
      console.error(`[Listener:${this.botId}] 💥 Socket Error:`, error);
    });

    try {
      listener.start();
      this.isListening = true;
      console.log(`[Listener:${this.botId}] ✅ Listener STARTED.`);
    } catch (e) {
      console.error(`[Listener:${this.botId}] Failed to start listener:`, e);
    }
  }

  public stop() {
    this.isListening = false;
    if (this.api.listener) {
      try {
        this.api.listener.stop();
        this.api.listener.removeAllListeners();
        console.log(`[Listener:${this.botId}] 🛑 Listener STOPPED.`);
      } catch (e) {
        console.warn(`[Listener:${this.botId}] Error stopping listener:`, e);
      }
    }
  }

  public getStatus() {
    return this.isListening ? "ACTIVE" : "STOPPED";
  }
}
