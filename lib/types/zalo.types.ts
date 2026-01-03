/**
 * lib/types/zalo.types.ts
 * Nguồn sự thật duy nhất (SSOT).
 * [UPDATED V6.3] Support Normalized Content (Data Wrapper) & Media IDs.
 */

import type {
  User,
  GroupInfo,
  MessageContent as ZcaMessageContent,
  FindUserResponse as RawFindUserResponse,
  CreateGroupOptions,
  GroupInfoResponse,
  GetGroupMembersInfoResponse,
  GroupMemberProfile,
  API,
  ReviewPendingMemberRequestResponse,
  GetGroupLinkDetailResponse,
} from "zca-js";

// --- UI NORMALIZED TYPES ---

export interface ZaloUserResult {
  userId: string;
  displayName: string;
  zaloName: string;
  avatar: string;
  phoneNumber?: string;
  gender?: number;
  raw?: unknown;
}

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
  blockedUsers: string[];
  blockedFeed: string[];
}

export interface ZaloSettingsResponse {
  privacy?: {
    blacklist?: string[];
    blockFeed?: string[];
  };
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

// --- GROUP TYPES ---

export interface GroupInviteBoxParams {
  mpage?: number;
  page?: number;
  invPerPage?: number;
  mcount?: number;
}

export interface ReviewPendingMemberRequestPayload {
  members: string[];
  isApprove: boolean;
}

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

export type QRCallbackData =
  | string
  | {
      data?: {
        image?: string;
      };
    };

// --- RAW CONTENT TYPES ---

export interface ZaloAttachmentContent {
  title?: string;
  description?: string;
  href: string;
  thumb?: string;
  url?: string;
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

// --- ACTION PARAMETER TYPES ---

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

// --- ENTITY TYPES ---

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
  // [MERGED] Added for ConversationList UI
  lastMessage?: NormalizedContent;
  unreadCount?: number;
}

export type UserCacheEntry = {
  id: string;
  name: string;
  avatar: string;
  isFriend: boolean;
  phoneNumber: string | null;
  commonGroups: Set<string>;
};

// --- RAW MESSAGE TYPES ---

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
    msgId?: string; // [FIX] Added msgId for Quote
    attach?: string;
    fromD: string;
  };
  mentions?: Array<{
    uid: string;
    pos: number;
    len: number;
  }>;
  // Các trường dynamic khác
  [key: string]: unknown;
}

export interface RawZaloMessage {
  type: number;
  threadId: string;
  isSelf: boolean;
  data: RawZaloMessageData;
}

export type ZaloMessage = RawZaloMessage;

// --- CONSTANTS & ENUMS ---

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
export type ViewState = "chat" | "manage" | "setting" | "crm" | "staff";

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

// =============================================================================
// [FIX] STANDARD TYPES & NORMALIZED CONTENT (Blueprint V6.3 Compliant)
// =============================================================================

export interface StandardSticker {
  stickerId: number; // [FIX] Renamed from id to stickerId
  cateId: number;
  type: number;
  stickerUrl?: string; // [FIX] Renamed/Added for UI display
  url?: string; // [MERGED] Added alias for ChatFrame UI compatibility
}

export interface StandardPhoto {
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  title?: string;
  description?: string;
  size?: number;
  photoId?: string; // [FIX] Added photoId for forwarding
  caption?: string; // [MERGED] Added for UI display
}

export interface StandardVideo {
  url: string;
  thumbnail: string;
  duration?: number;
  width?: number;
  height?: number;
  fileId?: string; // [FIX] Added fileId for forwarding
  caption?: string; // [MERGED] Added for UI display
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

export interface StandardFile {
  url: string;
  fileId: string;
  title: string;
  size: number;
  checksum?: string;
  name?: string; // [MERGED] Alias for title
}

// [FIX] Added StandardLocation definition
export interface StandardLocation {
  lat: number;
  long: number;
  address?: string;
}

// [FIX] Normalized Content Wrapper (Added 'location')
export type NormalizedContent =
  | { type: "text"; data: { text: string; mentions?: unknown[] } }
  | { type: "sticker"; data: StandardSticker }
  | { type: "image"; data: StandardPhoto } // [FIX] Standardized to 'image' (was photo)
  | { type: "video"; data: StandardVideo }
  | { type: "voice"; data: StandardVoice }
  | { type: "link"; data: StandardLink }
  | { type: "file"; data: StandardFile }
  | { type: "location"; data: StandardLocation } // [FIX] Added location type
  | { type: "unknown"; data: { text?: string; raw?: unknown } };

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
    relatedMsgId: string; // [FIX] Added relatedMsgId
    attach?: string;
  };
}
