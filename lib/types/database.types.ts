/**
 * lib/types/database.types.ts
 * [UPDATED] Schema cho ZaloLite CRM (Self-Healing Ready).
 * Khớp với DB Schema SQL.
 */

export type StaffRole = "admin" | "staff";
export type BotPermissionType = "chat" | "auth" | "view_only";
export type SenderType = "customer" | "staff_on_bot";
export type ConversationType = "user" | "group";

// --- STATUS TYPES ---
export interface ZaloBotStatus {
  state: "STOPPED" | "STARTING" | "QR_WAITING" | "LOGGED_IN" | "ERROR";
  last_login?: string;
  error_message?: string;
  qr_code?: string;
  last_update?: string;
}

// [UPDATED] Cấu trúc Log Health Check (Full Raw)
export interface HealthCheckLog {
  timestamp: string;
  action: "PING" | "LOGIN" | "SYNC" | "ERROR_HANDLER"; // Phân loại hành động
  status: "OK" | "FAIL";
  message: string;
  latency?: number;

  // [NEW] Chứa toàn bộ dữ liệu thô (Object Error đầy đủ hoặc Response API đầy đủ)
  raw_data?: unknown;

  // [NEW] Stack trace nếu là lỗi (để debug sâu)
  error_stack?: string;
}

// --- TABLES ---

export interface ZaloBot {
  id: string; // UUID
  global_id: string | null;
  name: string;
  avatar: string | null;
  phone: string | null;

  raw_data: unknown;
  access_token: unknown; // JSONB
  status: ZaloBotStatus; // JSONB

  is_active: boolean;
  last_activity_at: string | null;
  auto_sync_interval: number;

  // [NEW FIELD]
  health_check_log?: HealthCheckLog;

  created_at: string;
  updated_at: string;
}

export interface WorkSession {
  id: number;
  staff_id: string;
  started_at: string;
  last_ping_at: string;
  ended_at: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  session_token_hash?: string;
  created_at: string;
}

export interface StaffAccount {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  avatar: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffBotPermission {
  staff_id: string;
  bot_id: string;
  permission_type: BotPermissionType;
  assigned_at: string;
}

export interface Customer {
  id: string;
  global_id: string;
  display_name: string | null;
  avatar: string | null;
  phone: string | null;
  real_name: string | null;
  raw_data: unknown;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZaloCustomerMapping {
  id: string;
  customer_id: string;
  bot_id: string;
  external_user_id: string;
  bot_alias: string | null;
  status: unknown;
  last_interaction_at: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  global_id: string;
  type: ConversationType;
  name: string | null;
  avatar: string | null;
  raw_data: unknown;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface ZaloConversationMapping {
  id: string;
  conversation_id: string;
  bot_id: string;
  external_thread_id: string;
  status: unknown;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  bot_ids: string[];
  zalo_msg_id: string;
  sender_id: string;
  sender_type: SenderType;
  staff_id?: string | null;
  content: unknown;
  raw_content: unknown;
  msg_type: string | null;
  sent_at: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  staff_id: string | null;
  action_group: string;
  action_type: string;
  payload: unknown;
  created_at: string;
}
