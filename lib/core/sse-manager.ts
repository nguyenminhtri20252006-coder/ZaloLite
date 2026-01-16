/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/sse-manager.ts
 * [VERSION 11.1 - DEBUG LOGGING]
 * - Added: Detailed logs for Multicast to trace missing events.
 */

import { forceLogout } from "@/lib/actions/staff.actions";

type SSEClient = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  staffId: string;
};

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private topics: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log(
      "[SSE-Manager] 🔥 Initializing Pub/Sub Engine V11.1 (Debug Mode)",
    );
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      for (const [id, client] of this.clients.entries()) {
        try {
          client.controller.enqueue(client.encoder.encode(`: ping\n\n`));
        } catch (e) {
          this.removeClient(id);
        }
      }
    }, 15000);
  }

  // --- CONNECTION MANAGEMENT ---

  public addClient(
    staffId: string,
    controller: ReadableStreamDefaultController,
  ) {
    if (this.clients.has(staffId)) {
      console.log(`[SSE-Manager] 🔄 Reconnecting staff: ${staffId}`);
    } else {
      console.log(`[SSE-Manager] ➕ Staff connected: ${staffId}`);
    }
    this.clients.set(staffId, {
      controller,
      encoder: new TextEncoder(),
      staffId,
    });

    // [DEBUG] Log total clients
    console.log(`[SSE-Manager] Total Active Clients: ${this.clients.size}`);
  }

  public removeClient(staffId: string) {
    if (this.clients.has(staffId)) {
      this.clients.delete(staffId);
      console.log(`[SSE-Manager] ➖ Staff disconnected: ${staffId}`);
      this.topics.forEach((subscribers, topic) => {
        subscribers.delete(staffId);
        if (subscribers.size === 0) this.topics.delete(topic);
      });
    }
  }

  public subscribe(staffId: string, topic: string) {
    if (!this.clients.has(staffId)) return;
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic)!.add(staffId);
  }

  public unsubscribe(staffId: string, topic: string) {
    const subscribers = this.topics.get(topic);
    if (subscribers) {
      subscribers.delete(staffId);
      if (subscribers.size === 0) this.topics.delete(topic);
    }
  }

  // --- DISPATCHING (CORE) ---

  public multicast(userIDs: string[], event: string, data: any) {
    if (!userIDs || userIDs.length === 0) {
      console.warn(`[SSE-Manager] ⚠️ Multicast called with empty user list.`);
      return;
    }

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let sentCount = 0;
    const targetsFound: string[] = [];
    const targetsMissing: string[] = [];

    userIDs.forEach((staffId) => {
      const client = this.clients.get(staffId);
      if (client) {
        this.sendWithStrictRetry(client, payload, 1);
        sentCount++;
        targetsFound.push(staffId);
      } else {
        targetsMissing.push(staffId);
      }
    });

    console.log(
      `[SSE-Manager] 🚀 Multicast [${event}] | Success: ${sentCount}/${
        userIDs.length
      } | Targets: [${targetsFound.join(
        ", ",
      )}] | Missing: [${targetsMissing.join(", ")}]`,
    );
  }

  public async broadcast(topic: string, eventName: string, data: any) {
    const subscribers = this.topics.get(topic);
    if (!subscribers || subscribers.size === 0) return;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const staffId of subscribers) {
      const client = this.clients.get(staffId);
      if (client) {
        this.sendWithStrictRetry(client, payload, 1);
      }
    }
  }

  private async sendWithStrictRetry(
    client: SSEClient,
    payload: string,
    attempt: number,
  ) {
    try {
      client.controller.enqueue(client.encoder.encode(payload));
    } catch (error) {
      if (attempt > 3) {
        console.error(
          `[SSE-Manager] ☠️ CLIENT DEAD: ${client.staffId}. Force Logout.`,
        );
        this.removeClient(client.staffId);
        await forceLogout(client.staffId);
        return;
      }

      const delay = attempt === 1 ? 5000 : attempt === 2 ? 15000 : 40000;
      await new Promise((r) => setTimeout(r, delay));
      if (this.clients.has(client.staffId)) {
        const currentClient = this.clients.get(client.staffId);
        if (currentClient)
          this.sendWithStrictRetry(currentClient, payload, attempt + 1);
      }
    }
  }
}

const globalAny: any = global;
if (!globalAny.sseManager) globalAny.sseManager = new SSEManager();
export const sseManager = globalAny.sseManager as SSEManager;
