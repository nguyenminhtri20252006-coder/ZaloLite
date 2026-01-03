/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/types/database.types.ts
 * [MERGED V6.5.1]
 * - Removed 'zalo_customer_mappings' from Database Interface (Database Consistency).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// --- [NEW] HEALTH CHECK TYPES ---
export interface HealthCheckLog {
  timestamp: string;
  action: "PING" | "LOGIN" | "SYNC" | "ERROR_HANDLER";
  status: "OK" | "FAIL";
  message: string;
  latency?: number;
  raw_data?: unknown;
  error_stack?: string;
}

export interface ZaloBotStatus {
  state:
    | "STOPPED"
    | "STARTING"
    | "QR_WAITING"
    | "LOGGED_IN"
    | "ERROR"
    | "ACTIVE"
    | "QR_SCAN";
  error_message?: string | null;
  qr_code?: string | null;
  last_update?: string;
  debug_code?: string;
  message?: string;
}

// --- DATABASE INTERFACE (Supabase Generated) ---
export interface Database {
  public: {
    Tables: {
      zalo_identities: {
        Row: ZaloIdentity;
        Insert: Partial<ZaloIdentity>;
        Update: Partial<ZaloIdentity>;
      };
      zalo_bot_info: {
        Row: ZaloBotInfo;
        Insert: Partial<ZaloBotInfo>;
        Update: Partial<ZaloBotInfo>;
      };
      staff_bot_permissions: {
        Row: StaffBotPermission;
        Insert: Partial<StaffBotPermission>;
        Update: Partial<StaffBotPermission>;
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation>;
        Update: Partial<Conversation>;
      };
      conversation_members: {
        Row: ConversationMember;
        Insert: Partial<ConversationMember>;
        Update: Partial<ConversationMember>;
      };
      messages: {
        Row: Message;
        Insert: Partial<Message>;
        Update: Partial<Message>;
      };
      staff_accounts: {
        Row: StaffAccount;
        Insert: Partial<StaffAccount>;
        Update: Partial<StaffAccount>;
      };
      // [REMOVED] Table 'zalo_customer_mappings' not in DB
    };
  };
}

// --- RAW ENTITIES (MATCHING V6 SCHEMA) ---

export interface ZaloIdentity {
  id: string;
  zalo_global_id: string;
  type: "system_bot" | "user" | "stranger" | "customer";

  display_name: string | null;
  avatar: string | null;

  ref_bot_id: string | null; // References zalo_bot_info.id
  ref_cus_profile_id: string | null;

  raw_data: Json | null;
  is_friend: boolean;

  created_at: string;
  updated_at: string;
}

export interface ZaloBotInfo {
  id: string; // UUID
  app_id: string | null;
  name: string;

  access_token: Json | null;
  secret_key: string | null;
  refresh_token?: string;

  status: Json | null; // Cast về ZaloBotStatus
  is_active: boolean;

  is_realtime_active: boolean;
  auto_sync_interval: number;

  health_check_log?: Json | null;
  last_active_at?: string | null;

  avatar?: string; // [Virtual/Joined]

  created_at: string;
  updated_at: string;
}

export interface StaffBotPermission {
  id: number;
  staff_id: string;
  bot_id: string;
  permission_type: "owner" | "chat" | "view_only";
  assigned_at: string;
}

export interface Conversation {
  id: string;
  type: "private" | "group"; // Map từ DB (text)
  global_group_id: string | null;
  name: string | null;
  avatar: string | null;
  participant_ids: string[] | null;
  raw_data: Json | null;
  last_activity_at: string;

  last_message?: Json; // [Added] Field jsonb lưu snippet tin nhắn cuối

  created_at: string;
  updated_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  identity_id: string;
  role: string;
  settings: Json | null;
  last_seen_msg_id: number | null;
  joined_at: string;
  thread_id: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  zalo_msg_id: string;
  sender_identity_id: string | null;
  staff_id: string | null;

  content: Json; // NormalizedContent
  raw_content: Json | null;
  listening_bot_ids: string[] | null;

  sent_at: string;
  created_at: string;

  // [UI EXTENSIONS] Các trường này cần thiết cho ChatFrame/Action
  // Có thể là column thật hoặc computed/joined từ query
  sender_type?: "customer" | "bot" | "staff";
  bot_send_id?: string | null;
  sender_id?: string; // Alias cho sender_identity_id trong UI logic

  // Virtual Relations (khi query join)
  sender_identity?: {
    id: string;
    name: string;
    display_name: string;
    avatar: string;
    type?: string;
  };
  staff_accounts?: {
    full_name: string;
    avatar: string;
  };
}

export interface StaffAccount {
  id: string;
  username: string;
  full_name: string | null;
  role: "admin" | "staff";
  phone?: string | null;
  password_hash?: string; // [Internal]
  is_active: boolean;
  created_at: string;
  avatar?: string | null;
}

// [NOTE] Interface kept for potential future use or local type casting
export interface ZaloCustomerMapping {
  bot_id: string;
  customer_id: string;
  status: "friend" | "stranger" | "blocked";
  last_interaction_at: string;
  bot_alias?: string;
}

// --- DOMAIN/UI ALIAS TYPES (Compatibility Layer) ---

// [ZaloBot] Dùng cho BotInterface, BotManagerPanel
export interface ZaloBot extends Omit<ZaloBotInfo, "status" | "access_token"> {
  status: ZaloBotStatus;
  access_token: any; // Allow flexible token structure
  avatar?: string;
}

// [Customer] Dùng cho CRM
export interface Customer {
  id: string; // UUID (ZaloIdentity ID)
  zalo_user_id: string; // zalo_global_id
  display_name: string;
  avatar: string;
  phone?: string;
  tags?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}
