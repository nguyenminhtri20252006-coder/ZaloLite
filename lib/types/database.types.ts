/**
 * lib/types/database.types.ts
 * [UPDATED] Schema cho ZaloLite CRM v2.0 (Consolidated Architecture)
 * Khớp 1:1 với file db_ZaloLite_v2.sql
 * NOTE: Sử dụng 'unknown' thay vì 'any' cho dữ liệu JSONB chưa xác định cấu trúc.
 */

// --- ENUMS & CONSTANTS ---
export type StaffRole = "admin" | "staff";
export type BotPermissionType = "chat" | "auth" | "view_only";
export type SenderType = "customer" | "staff_on_bot";
export type ConversationType = "user" | "group";

// --- 7. WORK SESSIONS (TRACKING) ---
export interface WorkSession {
  id: number; // BIGINT
  staff_id: string;
  started_at: string;
  last_ping_at: string;
  ended_at: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

// ... (Giữ nguyên các type khác)
export interface StaffAccount {
  id: string; // UUID
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

// --- 2. ZALO BOTS (TENANTS) ---
export interface ZaloBotStatus {
  state: "STOPPED" | "STARTING" | "QR_WAITING" | "LOGGED_IN" | "ERROR";
  last_login?: string;
  error_message?: string;
  qr_code?: string;
  last_update?: string;
}

export interface ZaloBot {
  id: string; // UUID
  global_id: string | null; // Zalo User ID (Unique)
  name: string;
  avatar: string | null;
  phone: string | null;

  raw_data: unknown;
  access_token: unknown;
  status: ZaloBotStatus;

  // [NEW FIELDS]
  last_activity_at: string | null; // Thời gian tương tác/sync cuối cùng
  auto_sync_interval: number; // Chu kỳ sync tự động (phút), 0 = tắt

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- 3. CUSTOMERS (SINGLE VIEW) ---
export interface Customer {
  id: string; // UUID
  global_id: string; // Zalo UID (Global Unique)

  // Normalized Info (Cho UI)
  display_name: string | null;
  avatar: string | null;
  phone: string | null;
  real_name: string | null;

  // Raw & CRM Data
  raw_data: unknown;
  tags: string[] | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// Mapping Table: Bot <-> Customer
export interface ZaloCustomerMapping {
  id: string;
  customer_id: string;
  bot_id: string;
  external_user_id: string; // ID mà Bot nhìn thấy (có thể khác Global ID trong ngữ cảnh OA)
  bot_alias: string | null;
  status: unknown; // { is_friend: boolean, is_blocked: boolean ... }
  last_interaction_at: string;
  created_at: string;
}

// --- 4. CONVERSATIONS (UNIFIED) ---
export interface Conversation {
  id: string; // UUID
  global_id: string; // Thread ID (Group ID hoặc User ID)
  type: ConversationType;

  // Normalized Info
  name: string | null;
  avatar: string | null;

  raw_data: unknown; // Metadata gốc của nhóm

  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

// Mapping Table: Bot <-> Conversation
export interface ZaloConversationMapping {
  id: string;
  conversation_id: string;
  bot_id: string;
  external_thread_id: string; // Thread ID theo ngữ cảnh Bot
  status: unknown; // { is_admin: boolean, status: 'active'|'left' ... }
  created_at: string;
}

// --- 5. MESSAGES (DEDUPLICATED) ---
export interface Message {
  id: number; // BIGINT
  conversation_id: string;

  // [CRITICAL] Mảng các Bot đã thấy tin nhắn này
  bot_ids: string[]; // UUID[]

  zalo_msg_id: string; // Logic Key

  sender_id: string; // Global ID của người gửi
  sender_type: SenderType;
  staff_id?: string | null; // Nếu staff gửi

  content: unknown; // Normalized JSON for UI
  raw_content: unknown; // Original Zalo Payload
  msg_type: string | null;

  sent_at: string;
  created_at: string;
}

// --- 6. LOGS ---
export interface AuditLog {
  id: number;
  staff_id: string | null;
  action_group: string;
  action_type: string;
  payload: unknown;
  created_at: string;
}
