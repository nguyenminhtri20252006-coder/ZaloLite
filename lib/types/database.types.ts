/**
 * lib/types/database.types.ts
 * Định nghĩa kiểu dữ liệu khớp 1:1 với schema SQL 'db_parent_online_v3.sql'.
 */

export type UserStatus = "active" | "blocked" | "inactive";
export type SystemRole = "admin" | "member" | "editor";

// 1.1. Profiles
export interface Profile {
  id: string; // UUID
  zalo_uid: string; // Legacy/Default ID
  display_name: string;
  avatar?: string | null;
  phone?: string | null;
  zalo_name?: string | null;
  email?: string | null;
  status: UserStatus;
  created_at?: string;
  updated_at?: string;
}

// 1.2. System Accounts (Custom Auth)
export interface SystemAccount {
  id: string; // UUID
  profile_id: string;
  username: string;
  password_hash: string;
  salt?: string | null;
  role: SystemRole;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// 1.3. System Sessions
export interface SystemSession {
  token: string;
  account_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
  expires_at: string;
  created_at?: string;
}

// 1.4. Zalo Apps (Multi-Tenancy)
export interface ZaloApp {
  id: string; // UUID
  oa_id: string;
  name: string;
  app_id?: string | null;
  app_secret_enc?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// 1.5. Zalo User Mappings
export interface ZaloUserMapping {
  id: string; // UUID
  profile_id: string;
  zalo_app_id: string;
  zalo_user_id: string; // UID riêng của user đối với App này
  is_followed: boolean;
  last_interaction_at?: string;
  created_at?: string;
}

// Helper Type cho việc tạo mới (bỏ qua ID và các trường default)
export type NewProfile = Omit<Profile, "id" | "created_at" | "updated_at">;
export type NewSystemAccount = Omit<
  SystemAccount,
  "id" | "created_at" | "updated_at" | "last_login_at"
>;
export type NewZaloUserMapping = Omit<
  ZaloUserMapping,
  "id" | "created_at" | "last_interaction_at"
>;
