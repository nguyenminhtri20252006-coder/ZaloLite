/**
 * lib/types/database.types.ts
 * [UPDATED] Schema cho ZaloLite CRM v1.2 (Multi-Tenant)
 * Khớp 1:1 với file db_ZaloLite_v1.sql
 */

// --- ENUMS & CONSTANTS ---
export type StaffRole = "admin" | "staff";
export type BotPermissionType = "chat" | "auth" | "view_only";
export type SenderType = "customer" | "staff_on_bot";
export type ConversationType = "user" | "group";
export type GlobalTagType = "staff" | "customer" | "conversation";

// --- 1. STAFF & AUTH ---
export interface StaffAccount {
  id: string; // UUID
  username: string;
  password_hash: string;
  full_name: string;
  role: StaffRole;
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

// --- 2. BOTS (TENANTS) ---
export interface ZaloBotConfig {
  imei?: string;
  cookie?: any;
  userAgent?: string;
  autoLogin?: boolean;
}

export interface ZaloBotStatus {
  state: "STOPPED" | "STARTING" | "QR_WAITING" | "LOGGED_IN" | "ERROR";
  last_login?: string;
  error_message?: string;
  battery?: number; // Ví dụ thêm
}

export interface ZaloBot {
  id: string; // UUID
  global_id: string; // Zalo OA ID / User ID
  account_uuid?: string | null;
  name: string;
  avatar?: string | null;
  phone?: string | null;

  // JSONB Fields
  access_token: any; // Chứa credentials (cookie, imei, token...)
  status: ZaloBotStatus; // Metadata trạng thái phiên

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- 3. CUSTOMERS (IDENTITY) ---
export interface Customer {
  id: string; // UUID
  global_id?: string | null; // SĐT chuẩn hóa (nếu có)
  display_name: string | null;
  phone?: string | null;
  payload: any; // JSONB: tags, notes, email...
  created_at: string;
  updated_at: string;
}

export interface ZaloCustomerMapping {
  id: string;
  customer_id: string;
  bot_id: string;
  external_id: string; // Zalo UID (theo Bot context)
  last_interaction_at?: string;
  created_at: string;
}

// --- 4. CONVERSATIONS ---
export interface Conversation {
  id: string;
  global_id?: string | null; // Thread ID chung (nếu merge được)
  type: ConversationType;
  last_activity_at: string;
  metadata: {
    name?: string;
    avatar?: string;
    is_muted?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface ZaloConversationMapping {
  id: string;
  conversation_id: string;
  bot_id: string;
  external_id: string; // Zalo Thread ID
  is_active: boolean;
  created_at: string;
}

// --- 5. MESSAGES ---
export interface Message {
  id: number; // BIGINT
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string; // UUID của Customer hoặc Bot
  staff_id?: string | null; // Null nếu là tin nhắn từ khách

  content: any; // Full Zalo Message Object
  zalo_msg_id?: string | null;

  sent_at: string;
  created_at: string;
}

// --- 6. SYSTEM LOGS ---
export interface AuditLog {
  id: number;
  staff_id?: string | null;
  action_group: string;
  action_type: string;
  payload: any;
  created_at: string;
}

// --- HELPER TYPES ---
export type NewZaloBot = Omit<ZaloBot, "id" | "created_at" | "updated_at">;
export type UpdateZaloBot = Partial<NewZaloBot>;
