/**
 * lib/types/database.types.ts
 * [UPDATED V2.5 Strict] Match User's V6 DB Structure.
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
    | "ACTIVE";
  error_message?: string | null;
  qr_code?: string | null;
  last_update?: string;
  debug_code?: string;
}

// --- DATABASE INTERFACE ---
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
    };
  };
}

// --- ENTITIES (MATCHING V6 SCHEMA) ---

export interface ZaloIdentity {
  id: string;
  zalo_global_id: string; // [UPDATED NAME]
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

  status: Json | null; // { state: 'STOPPED' | 'ACTIVE' | ... }
  is_active: boolean;

  is_realtime_active: boolean;
  auto_sync_interval: number;

  // [ADDED]
  health_check_log?: Json | null; // Cast về HealthCheckLog
  last_active_at?: string | null;

  created_at: string;
  updated_at: string;
}

export interface StaffBotPermission {
  id: number;
  staff_id: string;
  bot_id: string; // References zalo_bot_info.id
  permission_type: "owner" | "chat" | "view_only";
  assigned_at: string;
}

export interface Conversation {
  id: string;
  type: "private" | "group";
  global_group_id: string | null;
  name: string | null;
  avatar: string | null;
  participant_ids: string[] | null;
  raw_data: Json | null;
  last_activity_at: string;
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
  thread_id: string | null; // [ADDED]
}

export interface Message {
  id: string;
  conversation_id: string;
  zalo_msg_id: string;
  sender_identity_id: string | null;
  staff_id: string | null;

  content: Json;
  raw_content: Json | null;
  listening_bot_ids: string[] | null;

  sent_at: string;
  created_at: string;
}

export interface StaffAccount {
  id: string;
  username: string;
  full_name: string | null;
  role: "admin" | "staff";
  phone?: string | null;
  is_active: boolean;
  created_at: string;
}
