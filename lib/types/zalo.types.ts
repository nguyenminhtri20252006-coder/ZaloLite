/**
 * lib/types/zalo.types.ts
 * Nguồn sự thật duy nhất (SSOT).
 * [FIX] Tách biệt Standard Types khỏi Raw Zalo Types để tránh lỗi thiếu trường (href vs url).
 */

import type {
  User,
  GroupInfo,
  MessageContent as ZcaMessageContent,
  FindUserResponse as RawFindUserResponse, // Đổi tên để tránh nhầm lẫn
  CreateGroupOptions,
  GroupInfoResponse,
  GetGroupMembersInfoResponse,
  GroupMemberProfile,
  API,
  ReviewPendingMemberRequestResponse,
  GetGroupLinkDetailResponse,
} from "zca-js";

// --- UI NORMALIZED TYPES ---

// Dữ liệu User đã được chuẩn hóa cho Frontend sử dụng
export interface ZaloUserResult {
  userId: string; // Luôn có giá trị string (đã map từ uid/id)
  displayName: string; // Tên hiển thị (đã map từ display_name/name)
  zaloName: string;
  avatar: string;
  phoneNumber?: string;
  gender?: number;
  // Giữ lại raw data nếu cần debug
  raw?: unknown;
}

// Re-export type gốc dưới tên alias nếu cần
export type FindUserResponse = RawFindUserResponse;

export enum Gender {
  Male = 0,
  Female = 1,
}

export type ZBusinessPackage = {
  label?: Record<string, string> | null;
  pkgId: number;
};

export interface ZaloAPIUser {
  userId: string;
  username: string;
  displayName: string;
  zaloName: string;
  avatar: string;
  bgavatar: string;
  cover: string;
  gender: Gender;
  dob: number;
  sdob: string;
  status: string;
  phoneNumber: string;
  isFr: number;
  isBlocked: number;
  lastActionTime: number;
  lastUpdateTime: number;
  createdTs: number;
  isActive: number;
  isActivePC: number;
  isActiveWeb: number;
  isValid: number;
  key: number;
  type: number;
  userKey: string;
  accountStatus: number;
  user_mode: number;
  globalId: string;
  bizPkg: ZBusinessPackage;
  oaInfo: unknown;
  oa_status: unknown;
}
export type UserProfile = ZaloAPIUser;
export interface UserInfoResponse {
  changed_profiles: Record<string, ZaloAPIUser>;
}

export interface ZaloUserProfile {
  userId: string;
  displayName: string;
  zaloName: string;
  avatar: string;
  cover: string;
  gender: number;
  dob: number;
  sdob: string;
  status: string;
  phoneNumber?: string;
}

export interface ZaloPrivacySettings {
  blockedUsers: string[]; // List UID bị chặn nhắn tin
  blockedFeed: string[]; // List UID bị chặn xem nhật ký
}

// Type trả về của hàm getSettings (Cấu trúc giả định dựa trên ZCA behavior)
export interface ZaloSettingsResponse {
  privacy?: {
    blacklist?: string[];
    blockFeed?: string[];
  };
  // Các setting khác...
}

export interface FriendRecommendationsRecommItem {
  dataInfo: {
    userId: string;
    displayName: string;
    avatar: string;
    recommInfo: { message: string };
  };
}
export interface GetFriendRecommendationsResponse {
  recommItems: FriendRecommendationsRecommItem[];
}

// Thông tin lời mời đã gửi
export interface SentFriendRequestInfo {
  userId: string;
  displayName: string;
  avatar: string;
  fReqInfo: {
    message: string;
    time: string | number;
  };
}
export interface GetSentFriendRequestResponse {
  [key: string]: SentFriendRequestInfo;
}

// --- 4. CẤU TRÚC DỮ LIỆU NHÓM (Group) ---

export interface GroupInviteBoxParams {
  mpage?: number;
  page?: number;
  invPerPage?: number;
  mcount?: number;
}

// Type cho payload Review Pending (Duyệt thành viên) - Bị thiếu trước đây
export interface ReviewPendingMemberRequestPayload {
  members: string[];
  isApprove: boolean;
}

// Type cho cập nhật cài đặt nhóm
export interface UpdateGroupSettingsOptions {
  blockName?: boolean;
  signAdminMsg?: boolean;
  setTopicOnly?: boolean;
  enableMsgHistory?: boolean;
  joinAppr?: boolean;
  lockCreatePost?: boolean;
  lockCreatePoll?: boolean;
  lockSendMsg?: boolean;
  lockViewMember?: boolean;
  groupName?: string;
  groupDesc?: string;
}

export interface GetPendingGroupMembersResponse {
  users: {
    uid: string;
    dpn: string;
    avatar: string;
  }[];
  status?: "SUCCESS" | "PERMISSION_DENIED" | "FEATURE_DISABLED" | "ERROR";
}

// Type cho QR Callback
export type QRCallbackData =
  | string
  | {
      data?: {
        image?: string;
      };
    };

// --- 1. RAW CONTENT TYPES (Dữ liệu thô từ Zalo - Dùng cho UI hiển thị tin nhắn nhận được) ---

export interface ZaloAttachmentContent {
  title?: string;
  description?: string;
  href: string;
  thumb?: string;
  url?: string; // Fallback
}

export interface ZaloStickerContent {
  id: number;
  cateId: number;
  url?: string;
  type?: number;
}

export interface ZaloVoiceContent {
  href: string;
  duration?: number;
}

export interface ZaloVideoContent {
  href: string;
  thumb?: string;
  duration?: number;
  width?: number;
  height?: number;
}

// --- 2. ACTION PARAMETER TYPES ---

export interface SendVoiceOptions {
  voiceUrl: string;
  ttl?: number;
}

export interface SendVideoOptions {
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  width: number;
  height: number;
  msg?: string;
  ttl?: number;
}

export interface SendLinkOptions {
  link: string;
  msg?: string;
  ttl?: number;
}

// --- 3. ENTITY TYPES ---

export interface AccountInfo {
  userId: string;
  displayName: string;
  avatar: string;
}

export interface ThreadInfo {
  id: string;
  uuid?: string;
  name: string;
  avatar: string;
  type: 0 | 1;
  lastActivity?: string;
}

export type UserCacheEntry = {
  id: string;
  name: string;
  avatar: string;
  isFriend: boolean;
  phoneNumber: string | null;
  commonGroups: Set<string>;
};

// --- 4. RAW & STANDARD MESSAGE TYPES ---

export interface RawZaloMessageData {
  msgId: string;
  cliMsgId: string;
  msgType: string;
  uidFrom: string;
  dName: string;
  ts: string;
  content: unknown;
  quote?: {
    ownerId: string;
    msg: string;
    attach?: string;
    fromD: string;
  };
  mentions?: Array<{
    uid: string;
    pos: number;
    len: number;
  }>;
}

export interface RawZaloMessage {
  type: number;
  threadId: string;
  isSelf: boolean;
  data: RawZaloMessageData;
}

// [FIX] RESTORE LEGACY ALIAS (Quan trọng cho ChatFrame)
export type ZaloMessage = RawZaloMessage;

// --- 7. CONSTANTS & ENUMS ---

export const ZALO_EVENTS = {
  QR_GENERATED: "qr_generated",
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILURE: "login_failure",
  NEW_MESSAGE: "new_message",
  STATUS_UPDATE: "status_update",
  SESSION_GENERATED: "session_generated",
} as const;

export enum ThreadType {
  User = 0,
  Group = 1,
}

export type LoginState = "IDLE" | "LOGGING_IN" | "LOGGED_IN" | "ERROR";

// [FIX] Update ViewState để hỗ trợ CRM
export type ViewState = "chat" | "manage" | "setting" | "crm" | "staff";

// --- 6. EXPORTS & STANDARD TYPES ---

export type MessageContent = ZcaMessageContent;

export type {
  User,
  ZcaMessageContent,
  GroupInfo,
  RawFindUserResponse,
  CreateGroupOptions,
  GroupInfoResponse,
  GetGroupMembersInfoResponse,
  GroupMemberProfile,
  API,
  ReviewPendingMemberRequestResponse,
  GetGroupLinkDetailResponse,
};

// [FIX] STANDARD TYPES (Dữ liệu chuẩn hóa nội bộ - Dùng cho Pipeline & Sender Service)
// Đã ngắt kế thừa từ Raw Types để tránh lỗi 'missing href'

export interface StandardSticker {
  id: number;
  cateId: number;
  type: number;
  url?: string;
}

export interface StandardPhoto {
  url: string;
  thumbnail: string;
  // [FIX] Thêm các trường này để khớp với logic parser
  width: number;
  height: number;
  title?: string;
  description?: string;
  size?: number;
}

export interface StandardVideo {
  url: string;
  thumbnail: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface StandardVoice {
  url: string;
  duration?: number;
}

export interface StandardLink {
  url: string;
  title: string;
  description: string;
  thumbnail?: string;
}

// Normalized Content Union
export type NormalizedContent =
  | { type: "text"; text: string; mentions?: unknown[] }
  | { type: "sticker"; data: StandardSticker }
  | { type: "photo"; data: StandardPhoto }
  | { type: "video"; data: StandardVideo }
  | { type: "voice"; data: StandardVoice }
  | { type: "link"; data: StandardLink }
  | { type: "unknown"; raw: unknown };

export interface StandardMessage {
  msgId: string;
  threadId: string;
  isGroup: boolean;
  type: number;
  isSelf: boolean;
  sender: {
    uid: string;
    name: string;
    avatar?: string;
  };
  timestamp: number;
  content: NormalizedContent;
  quote?: {
    text: string;
    senderId: string;
    attach?: string;
  };
}
