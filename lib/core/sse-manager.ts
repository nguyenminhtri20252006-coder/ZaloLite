/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/sse-manager.ts
 * [VERSION 10.0 - PUB/SUB & DEAD MAN SWITCH]
 * - Model: Single Connection per Staff. Pub/Sub for Topics.
 * - Security: Dead Man Switch (Retry 3 times -> Force DB Logout).
 */

import { forceLogout } from "@/lib/actions/staff.actions";

type SSEClient = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  staffId: string;
};

class SSEManager {
  // Key: staffId (Mỗi staff chỉ 1 connection chính)
  private clients: Map<string, SSEClient> = new Map();

  // Pub/Sub: Topic -> Set of StaffIDs
  private topics: Map<string, Set<string>> = new Map();

  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log("[SSE-Manager] 🔥 Initializing Pub/Sub Engine V10.0");
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
      console.log(`[SSE-Manager] Reconnecting staff: ${staffId}`);
      // Không cần delete, chỉ update controller mới
    } else {
      console.log(`[SSE-Manager] Staff connected: ${staffId}`);
    }
    this.clients.set(staffId, {
      controller,
      encoder: new TextEncoder(),
      staffId,
    });
  }

  public removeClient(staffId: string) {
    if (this.clients.has(staffId)) {
      this.clients.delete(staffId);
      console.log(`[SSE-Manager] Staff disconnected: ${staffId}`);
      // Clean up topics
      this.topics.forEach((subscribers, topic) => {
        subscribers.delete(staffId);
        if (subscribers.size === 0) this.topics.delete(topic);
      });
    }
  }

  // --- PUB/SUB ---

  public subscribe(staffId: string, topic: string) {
    if (!this.clients.has(staffId)) return; // Chỉ cho phép nếu đang connect

    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic)!.add(staffId);
    console.log(`[SSE-Manager] ${staffId} subscribed to [${topic}]`);
  }

  public unsubscribe(staffId: string, topic: string) {
    const subscribers = this.topics.get(topic);
    if (subscribers) {
      subscribers.delete(staffId);
      if (subscribers.size === 0) this.topics.delete(topic);
      console.log(`[SSE-Manager] ${staffId} unsubscribed from [${topic}]`);
    }
  }

  // --- BROADCAST WITH DEAD MAN SWITCH ---

  public async broadcast(topic: string, eventName: string, data: any) {
    const subscribers = this.topics.get(topic);
    if (!subscribers || subscribers.size === 0) return;

    // console.log(`[SSE-Manager] Broadcasting [${topic}]: ${eventName} to ${subscribers.size} clients`);

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const staffId of subscribers) {
      const client = this.clients.get(staffId);
      if (client) {
        // Gửi không chờ (Fire & Forget) nhưng có cơ chế retry riêng
        this.sendWithStrictRetry(client, payload, 1);
      }
    }
  }

  // Logic Retry: 5s -> 15s -> 40s -> KILL
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
        // 1. Remove Connection
        this.removeClient(client.staffId);
        // 2. Kill DB Session
        await forceLogout(client.staffId);
        return;
      }

      const delay = attempt === 1 ? 5000 : attempt === 2 ? 15000 : 40000;
      console.warn(
        `[SSE-Manager] ⚠️ Send failed to ${client.staffId}. Retry ${attempt}/3 in ${delay}ms...`,
      );

      await new Promise((r) => setTimeout(r, delay));
      // Đệ quy retry (nếu client vẫn còn trong map)
      if (this.clients.has(client.staffId)) {
        // Lấy controller mới nhất (phòng trường hợp reconnect)
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
