/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  RefreshCw,
  UserPlus,
  X,
  Check,
  Clock,
  QrCode,
  Key,
  MessageSquare, // IconMessage
  Bot, // IconRobot
  Users, // IconUsers
  BarChart3, // IconChart
  Settings, // IconSettings
  LogOut, // IconLogout
  Database, // IconDatabase
  Search,
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  Image as ImageIcon,
  File,
  Phone,
  Video,
  Info,
  ChevronLeft,
  ChevronRight,
  Shield,
  Ban,
  UserX,
  UserCheck,
  Link,
  Trash2,
  Edit2,
  Mic,
  Loader2,
  Download,
  Play,
  Pause,
} from "lucide-react";

// Re-export với tên thống nhất để sử dụng trong app
export const IconRefresh = RefreshCw;
export const IconUserPlus = UserPlus;
export const IconClose = X;
export const IconCheck = Check;
export const IconClock = Clock;
export const IconQrCode = QrCode;
export const IconKey = Key;

// Navigation Icons
export const IconMessage = MessageSquare;
export const IconRobot = Bot;
export const IconUsers = Users;
export const IconChart = BarChart3;
export const IconSettings = Settings;
export const IconCog = Settings; // [FIX] Alias for backward compatibility
export const IconLogout = LogOut;
export const IconDatabase = Database;

// Chat UI Icons
export const IconSearch = Search;
export const IconMoreVertical = MoreVertical;
export const IconAttach = Paperclip;
export const IconEmoji = Smile;
export const IconSend = Send;
export const IconImage = ImageIcon;
export const IconFile = File;
export const IconPhone = Phone;
export const IconVideo = Video;
export const IconInfo = Info;
export const IconBack = ChevronLeft;
export const IconForward = ChevronRight;

// Action Icons
export const IconShield = Shield;
export const IconBan = Ban;
export const IconUserRemove = UserX;
export const IconUserCheck = UserCheck;
export const IconLink = Link;
export const IconTrash = Trash2;
export const IconEdit = Edit2;
export const IconMicrophone = Mic;
export const IconLoader = Loader2;
export const IconDownload = Download;
export const IconPlay = Play;
export const IconPause = Pause;

// --- AGGREGATED EXPORT FOR UI ---
// Giúp sử dụng kiểu <Icons.Microphone />
export const Icons = {
  QrCode: IconQrCode,
  Key: IconKey,
  User: Users, // Map to Users for generic user icon
  Users: IconUsers,
  Info: IconInfo,
  Send: IconSend,
  Search: IconSearch,
  Logout: IconLogout,
  Close: IconClose,
  Refresh: IconRefresh,
  ChatBubble: IconMessage,
  Cog: IconSettings,
  UserPlus: IconUserPlus,
  UserMinus: IconUserRemove,
  Check: IconCheck,
  Link: IconLink,
  Clock: IconClock,
  Phone: IconPhone,
  Robot: IconRobot,
  Microphone: IconMicrophone,
  Paperclip: IconAttach,
  Loader: IconLoader,
  Mic: Mic,
  Download: Download,
  Play: Play,
  Pause: Pause,
  Image: ImageIcon,
};
