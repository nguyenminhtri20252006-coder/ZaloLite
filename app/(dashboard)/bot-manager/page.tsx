/**
 * app/page.tsx
 *
 * Lớp Giao diện (UI Layer - Lớp 1).
 * ĐÃ TÁI CẤU TRÚC (REFACTORED) thành giao diện 4-Module.
 */
"use client";

import { useState, useEffect, useRef, useMemo, ReactNode } from "react";

// Tái cấu trúc (GĐ 1.2): Import actions từ vị trí mới
import {
  startLoginQRAction,
  startLoginWithTokenAction,
  getSessionTokenAction,
  logoutAction,
} from "@/lib/actions/auth.actions";
// SỬA ĐỔI (Lô Cache): Thêm getAllFriendsAction
import { getAllFriendsAction } from "@/lib/actions/friend.actions";
import {
  sendMessageAction,
  getAccountInfoAction,
  getThreadsAction,
  setEchoBotStateAction,
} from "@/lib/actions/chat.actions";
// THÊM MỚI (Lô Cache): Thêm scanGroupMembersAction
import { scanGroupMembersAction } from "@/lib/actions/group.actions";
// THÊM MỚI: Import action từ vựng
import { sendVocabularyMessageAction } from "@/lib/actions/vocabulary.actions";

// SỬA ĐỔI: Nhập (import) tất cả types và constants từ tệp SSOT
import {
  ZALO_EVENTS,
  type ZaloMessage,
  type AccountInfo,
  type ThreadInfo,
  type LoginState,
  type ViewState, // (GĐ 3.2)
  type UserCacheEntry, // THÊM MỚI (Lô Cache)
  type GroupMemberProfile, // THÊM MỚI (Lô Cache)
  type User, // THÊM MỚI (Lô Cache)
} from "@/lib/types/zalo.types";

// Tái cấu trúc (GĐ 1.3): Import các component con
import { TokenModal } from "@/app/components/ui/TokenModal";
import { LoginPanel } from "@/app/components/modules/LoginPanel";
import { BotInterface } from "@/app/components/BotInterface";

/**
 * Hàm trợ giúp (Lô Cache)
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Component Chính (Container)
 */
export default function BotControlPanel() {
  // Trạng thái chung
  const [loginState, setLoginState] = useState<LoginState>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Trạng thái Đăng nhập
  const [loginMethod, setLoginMethod] = useState<"qr" | "token">("qr");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [sessionTokenForCopy, setSessionTokenForCopy] = useState<string | null>(
    null,
  );
  const [showTokenModal, setShowTokenModal] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState<boolean>(false);
  // SỬA ĐỔI: Đổi tên isSending -> isLoggingIn (để rõ ràng hơn)
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Trạng thái Dữ liệu (State của Ứng dụng)
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isEchoBotEnabled, setIsEchoBotEnabled] = useState(false);

  // THÊM MỚI: Trạng thái cho User Cache (Lô 2)
  const [userCache, setUserCache] = useState<Record<string, UserCacheEntry>>(
    {},
  );
  const [scannedGroups, setScannedGroups] = useState<Set<string>>(new Set());
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>("");

  // THÊM MỚI: Trạng thái cho Giai đoạn 3
  const [view, setView] = useState<ViewState>("chat"); // ('chat' | 'manage')

  // THÊM MỚI: Trạng thái Module 1
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [isLoadingAccountInfo, setIsLoadingAccountInfo] = useState(false);

  // Trạng thái UI
  const [searchTerm, setSearchTerm] = useState("");
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  // THÊM MỚI: State cho các hành động gửi (để tránh xung đột)
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSendingVocab, setIsSendingVocab] = useState(false);

  // Ref cho EventSource
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- Logic Lọc/Tìm kiếm (Mới) ---
  const filteredThreads = useMemo(() => {
    return threads.filter((thread) =>
      thread.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [threads, searchTerm]);

  // THÊM MỚI (Lô Cache): Hàm quét bạn bè (chạy 1 lần)
  const loadInitialFriends = async () => {
    console.log("[UI Cache] Đang tải lớp cache cơ sở (Bạn bè)...");
    try {
      const friendsList: User[] = await getAllFriendsAction();
      const friendCache: Record<string, UserCacheEntry> = {};

      friendsList.forEach((friend) => {
        friendCache[friend.userId] = {
          id: friend.userId,
          name: friend.displayName || friend.zaloName,
          avatar: friend.avatar,
          isFriend: true,
          phoneNumber: friend.phoneNumber || null, // Chỉ bạn bè mới có SĐT
          commonGroups: new Set(), // Sẽ được cập nhật sau
        };
      });

      setUserCache(friendCache);
      console.log(
        `[UI Cache] Đã tải xong lớp cache cơ sở: ${friendsList.length} bạn bè.`,
      );
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Lỗi không xác định";
      setErrorMessage(`Lỗi nghiêm trọng khi tải danh sách bạn bè: ${errorMsg}`);
    }
  };

  // THÊM MỚI (Lô Cache): Hàm quét 1 nhóm (lười biếng hoặc thủ công)
  const scanSingleGroup = async (groupId: string, groupName: string) => {
    if (scannedGroups.has(groupId)) {
      console.log(`[UI Cache] Bỏ qua nhóm đã quét: ${groupName}`);
      return; // Đã quét, bỏ qua
    }
    console.log(`[UI Cache] Đang quét thành viên nhóm: ${groupName}...`);
    let profiles: Record<string, GroupMemberProfile> = {};
    try {
      profiles = await scanGroupMembersAction(groupId);
    } catch (e) {
      console.error(
        `[UI Cache] Lỗi khi quét nhóm ${groupName} (ID: ${groupId}):`,
        e,
      );
      // Gắn cờ đã quét để không thử lại (tránh lặp lỗi)
      setScannedGroups((prev) => new Set(prev).add(groupId));
      return; // Bỏ qua nếu lỗi
    }

    // Hợp nhất (merge) kết quả vào state
    setUserCache((prevCache) => {
      const newCache = { ...prevCache };

      Object.values(profiles).forEach((profile) => {
        const existingEntry = newCache[profile.id];

        if (existingEntry) {
          // Người dùng đã tồn tại (có thể là bạn bè) -> Chỉ cập nhật nhóm chung
          existingEntry.commonGroups.add(groupId);
          // Cập nhật avatar/tên nếu cần (profile nhóm có thể mới hơn)
          existingEntry.name = profile.displayName || existingEntry.name;
          existingEntry.avatar = profile.avatar || existingEntry.avatar;
        } else {
          // Người dùng mới (người lạ) -> Thêm mới vào cache
          newCache[profile.id] = {
            id: profile.id,
            name: profile.displayName,
            avatar: profile.avatar,
            isFriend: false,
            phoneNumber: null, // Người lạ không có SĐT
            commonGroups: new Set([groupId]),
          };
        }
      });
      return newCache;
    });

    // Đánh dấu nhóm này là đã quét
    setScannedGroups((prev) => new Set(prev).add(groupId));
    console.log(
      `[UI Cache] Quét xong nhóm: ${groupName}. Tổng cache: ${
        Object.keys(userCache).length
      } người.`,
    );
  };

  // THÊM MỚI (Lô Cache): Hàm quét thủ công
  const handleStartManualScan = async () => {
    if (isScanningAll) return;
    setIsScanningAll(true);
    setScanStatus("Bắt đầu quét toàn bộ...");
    setErrorMessage(null);

    const groupsToScan = threads.filter((t) => t.type === 1);
    let count = 0;

    for (const group of groupsToScan) {
      count++;
      setScanStatus(
        `(${count}/${groupsToScan.length}) Đang quét: ${group.name}...`,
      );

      // Chỉ quét nếu nhóm này chưa được quét trước đó
      if (!scannedGroups.has(group.id)) {
        await scanSingleGroup(group.id, group.name);
        // Logic delay 2 giây của bạn
        setScanStatus(
          `(${count}/${groupsToScan.length}) Đã quét ${group.name}. Tạm nghỉ 2 giây...`,
        );
        await delay(2000);
      } else {
        setScanStatus(
          `(${count}/${groupsToScan.length}) Bỏ qua nhóm đã quét: ${group.name}`,
        );
      }
    }

    setScanStatus(
      `Hoàn tất! Đã quét ${groupsToScan.length} nhóm. Tổng cache: ${
        Object.keys(userCache).length
      } người.`,
    );
    setIsScanningAll(false);
  };

  const handleFetchThreads = async () => {
    console.log("[UI] Đang tải danh sách hội thoại...");
    setIsLoadingThreads(true);
    setThreads([]);
    setSelectedThread(null);
    setErrorMessage(null);

    try {
      const threadList = await getThreadsAction();

      console.log(`[UI] Tải thành công ${threadList.length} hội thoại.`);
      threadList.sort((a, b) => {
        if (a.type !== b.type) {
          return b.type - a.type;
        }
        return a.name.localeCompare(b.name);
      });

      setThreads(threadList);
    } catch (error) {
      console.error("[UI] Lỗi khi tải danh sách hội thoại:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Lỗi không xác định";
      setErrorMessage(
        `Lỗi khi tải danh sách hội thoại: ${errorMsg}. Vui lòng thử lại.`,
      );
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const handleFetchAccountInfo = async () => {
    setIsLoadingAccountInfo(true);
    setErrorMessage(null);
    try {
      const info = await getAccountInfoAction();
      setAccountInfo(info);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Lỗi không xác định";
      setErrorMessage(`Lỗi tải thông tin tài khoản: ${errorMsg}`);
    } finally {
      setIsLoadingAccountInfo(false);
    }
  };

  // --- Quản lý Kết nối SSE (useEffect chính) ---
  useEffect(() => {
    if (eventSourceRef.current) {
      return;
    }

    console.log("Thiết lập kết nối SSE...");
    eventSourceRef.current = new EventSource("/api/zalo-events");
    const eventSource = eventSourceRef.current;

    eventSource.onopen = () => console.log("Kết nối SSE đã mở.");
    eventSource.onerror = (err) => {
      console.error("Lỗi EventSource:", err);
      setLoginState("ERROR");
      setErrorMessage("Mất kết nối với máy chủ (SSE).");
      eventSource.close();
    };

    // Hàm xử lý chung
    const handleSSEMessage = (eventName: string, data: unknown) => {
      console.log(`[SSE] Nhận: ${eventName}`, data);

      switch (eventName) {
        case ZALO_EVENTS.STATUS_UPDATE:
          if (data && typeof data === "object" && "loginState" in data) {
            const newLoginState = (data as { loginState: LoginState })
              .loginState;
            setLoginState(newLoginState || "IDLE");

            // QUAN TRỌNG: Xử lý khi nhận được tin logout từ server
            if (newLoginState === "IDLE" || newLoginState === "ERROR") {
              console.log(
                "[SSE] Nhận trạng thái IDLE/ERROR từ server, đang reset UI...",
              );
              setAccountInfo(null);
              setThreads([]);
              setMessages([]);
              setSelectedThread(null);
              setQrCode(null);
              setIsLoggingIn(false); // SỬA ĐỔI: Đổi tên
              setSessionTokenForCopy(null);
              setView("chat"); // Reset view về chat
              setUserCache({});
              setScannedGroups(new Set());
              setIsScanningAll(false);
              setScanStatus("");
            }

            if (
              "error" in data &&
              data.error &&
              typeof data.error === "string"
            ) {
              setErrorMessage(data.error);
            }
          }
          break;
        case ZALO_EVENTS.QR_GENERATED:
          if (data && typeof data === "string") {
            setQrCode(data);
          }
          break;
        case ZALO_EVENTS.LOGIN_SUCCESS:
          setLoginState("LOGGED_IN");
          setQrCode(null);
          setErrorMessage(null);
          setIsLoggingIn(false); // SỬA ĐỔI: Đổi tên
          setTokenInput("");
          handleFetchAccountInfo();
          handleFetchThreads();
          loadInitialFriends();
          break;
        case ZALO_EVENTS.LOGIN_FAILURE:
          const errorMsg =
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Lỗi đăng nhập không xác định";
          setErrorMessage(errorMsg);
          setLoginState("ERROR");
          setQrCode(null);
          setIsLoggingIn(false); // SỬA ĐỔI: Đổi tên
          break;
        case ZALO_EVENTS.NEW_MESSAGE:
          if (
            data &&
            typeof data === "object" &&
            "threadId" in data &&
            "data" in data
          ) {
            setMessages((prevMessages) => [
              ...prevMessages, // Sửa lỗi: Thêm tin nhắn mới vào CUỐI mảng
              data as ZaloMessage,
            ]);
          } else {
            console.warn(
              "Nhận được new_message nhưng cấu trúc không hợp lệ:",
              data,
            );
          }
          break;
        case ZALO_EVENTS.SESSION_GENERATED:
          if (data && typeof data === "string") {
            setSessionTokenForCopy(data);
          }
          break;
      }
    };

    // Thêm các Event Listeners
    const addJsonListener = (eventName: string) => {
      eventSource.addEventListener(eventName, (event) => {
        try {
          const data = JSON.parse(event.data);
          handleSSEMessage(eventName, data);
        } catch (e) {
          console.error(
            `Lỗi parse JSON cho sự kiện ${eventName}:`,
            e,
            event.data,
          );
        }
      });
    };

    // QR là string thô, không phải JSON
    eventSource.addEventListener(ZALO_EVENTS.QR_GENERATED, (event) => {
      handleSSEMessage(ZALO_EVENTS.QR_GENERATED, event.data);
    });
    // Session (token) là string thô (đã JSON.stringify từ service)
    eventSource.addEventListener(ZALO_EVENTS.SESSION_GENERATED, (event) => {
      handleSSEMessage(ZALO_EVENTS.SESSION_GENERATED, event.data);
    });

    // Các sự kiện còn lại là JSON
    addJsonListener(ZALO_EVENTS.STATUS_UPDATE);
    addJsonListener(ZALO_EVENTS.LOGIN_SUCCESS);
    addJsonListener(ZALO_EVENTS.LOGIN_FAILURE);
    addJsonListener(ZALO_EVENTS.NEW_MESSAGE);

    // Dọn dẹp
    return () => {
      console.log("Đóng kết nối SSE.");
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []); // Chỉ chạy 1 lần

  // THÊM MỚI (Lô Cache): useEffect cho "Lazy Scan"
  useEffect(() => {
    // Chỉ chạy "lazy scan" nếu:
    // 1. Đã chọn 1 thread
    // 2. Thread đó là nhóm
    // 3. Chúng ta KHÔNG đang trong quá trình "quét thủ công"
    if (selectedThread && selectedThread.type === 1 && !isScanningAll) {
      // Hàm scanSingleGroup có sẵn logic kiểm tra "đã quét chưa"
      scanSingleGroup(selectedThread.id, selectedThread.name);
    }
  }, [selectedThread, isScanningAll]); // Phụ thuộc: selectedThread và isScanningAll

  // --- Các Hàm Xử lý Tương tác (Actions) ---

  const handleStartLoginQR = () => {
    setLoginState("LOGGING_IN");
    setErrorMessage(null);
    setQrCode(null);
    setIsLoggingIn(true); // SỬA ĐỔI: Đổi tên
    startLoginQRAction();
  };

  const handleStartLoginWithToken = async () => {
    if (isLoggingIn || !tokenInput) return; // SỬA ĐỔI: Đổi tên
    setLoginState("LOGGING_IN");
    setErrorMessage(null);
    setQrCode(null);
    setIsLoggingIn(true); // SỬA ĐỔI: Đổi tên
    try {
      await startLoginWithTokenAction(tokenInput);
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : "Lỗi không xác định";
      setLoginState("ERROR");
      setErrorMessage(`Lỗi đăng nhập token: ${errorMsg}`);
      setIsLoggingIn(false); // SỬA ĐỔI: Đổi tên
    }
  };
  const handleLogout = async () => {
    console.log("[UI] Yêu cầu đăng xuất...");
    setErrorMessage(null);

    setLoginState("IDLE");
    setAccountInfo(null);
    setThreads([]);
    setMessages([]);
    setSelectedThread(null);
    setQrCode(null);
    setIsLoggingIn(false); // SỬA ĐỔI: Đổi tên
    setSessionTokenForCopy(null);
    setView("chat"); // Reset view
    setUserCache({});
    setScannedGroups(new Set());
    setIsScanningAll(false);
    setScanStatus("");

    // 2. Gọi Server Action (không cần await, chạy nền)
    logoutAction();
  };

  const handleCopyToken = async () => {
    setIsCopying(true);
    setErrorMessage(null);
    let tokenToCopy = sessionTokenForCopy;

    if (!tokenToCopy) {
      try {
        tokenToCopy = await getSessionTokenAction();
        setSessionTokenForCopy(tokenToCopy);
      } catch (error: unknown) {
        setErrorMessage("Không thể lấy session token. Vui lòng đăng nhập lại.");
        setIsCopying(false);
        return;
      }
    }

    try {
      const tempTextArea = document.createElement("textarea");
      tempTextArea.value = tokenToCopy!;
      document.body.appendChild(tempTextArea);
      tempTextArea.select();
      document.execCommand("copy");
      document.body.removeChild(tempTextArea);
      setShowTokenModal(true);
    } catch (err) {
      setShowTokenModal(true);
    } finally {
      setIsCopying(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedThread) {
      setErrorMessage("Lỗi: Không có hội thoại nào được chọn.");
      return;
    }
    setErrorMessage(null);
    setIsSendingMessage(true);

    try {
      const result = await sendMessageAction(
        content,
        selectedThread.id,
        selectedThread.type,
      );

      if (!result.success) {
        setErrorMessage(result.error || "Gửi thất bại");
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Lỗi gửi tin nhắn",
      );
    } finally {
      setIsSendingMessage(false);
    }
  };

  // THÊM MỚI: Handler cho Gửi Từ vựng
  const handleSendVocabulary = async (topic: string, type: 0 | 1) => {
    if (!selectedThread) {
      setErrorMessage("Lỗi: Phải chọn một hội thoại để gửi từ vựng.");
      return;
    }
    setErrorMessage(null);
    setIsSendingVocab(true);

    try {
      // SỬA ĐỔI: Truyền `type` xuống Action
      await sendVocabularyMessageAction(selectedThread.id, topic, type);
      // Không cần làm gì khi thành công, tin nhắn sẽ tự gửi
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Lỗi gửi từ vựng",
      );
    } finally {
      setIsSendingVocab(false);
    }
  };

  const handleToggleEchoBot = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const isEnabled = e.target.checked;
    setIsEchoBotEnabled(isEnabled);
    try {
      await setEchoBotStateAction(isEnabled);
    } catch (error) {
      setErrorMessage("Lỗi khi cập nhật trạng thái Bot Nhại.");
      setIsEchoBotEnabled(!isEnabled);
    }
  };

  // Hàm render trạng thái (cho Login Panel)
  const renderStatus = () => {
    let color = "text-gray-400";
    let text = "ĐANG TẢI...";
    switch (loginState) {
      case "IDLE":
        color = "text-yellow-400";
        text = "CHƯA KẾT NỐI";
        break;
      case "LOGGING_IN":
        color = "text-blue-400";
        text =
          loginMethod === "qr"
            ? "ĐANG CHỜ QUÉT QR..."
            : "ĐANG ĐĂNG NHẬP BẰNG TOKEN...";
        break;
      case "LOGGED_IN":
        color = "text-green-400";
        text = "ĐÃ ĐĂNG NHẬP";
        break;
      case "ERROR":
        color = "text-red-400";
        text = "LỖI KẾT NỐI/ĐĂNG NHẬP";
        break;
    }
    return <span className={`font-bold ${color}`}>{text}</span>;
  };

  // --- JSX RENDER CHÍNH ---

  // 1. Hiển thị Modal (nếu cần)
  if (showTokenModal && sessionTokenForCopy) {
    return (
      <TokenModal
        token={sessionTokenForCopy}
        onClose={() => setShowTokenModal(false)}
      />
    );
  }

  // 2. Hiển thị Panel Đăng nhập (nếu chưa đăng nhập)
  if (loginState !== "LOGGED_IN") {
    return (
      <LoginPanel
        loginState={loginState}
        loginMethod={loginMethod}
        qrCode={qrCode}
        isSending={isLoggingIn} // SỬA ĐỔI: Đổi tên
        onLoginMethodChange={setLoginMethod}
        onTokenChange={setTokenInput}
        onStartLoginQR={handleStartLoginQR}
        onStartLoginToken={handleStartLoginWithToken}
        tokenInput={tokenInput}
        renderStatus={renderStatus}
      />
    );
  }

  // 3. Hiển thị Giao diện Chat chính (đã đăng nhập)
  return (
    <BotInterface
      // State & Handlers cho Module 1 (Menu)
      accountInfo={accountInfo}
      onCopyToken={handleCopyToken}
      isCopying={isCopying}
      isExpanded={isMenuExpanded}
      onToggleMenu={() => setIsMenuExpanded(!isMenuExpanded)}
      onLogout={handleLogout}
      onFetchAccountInfo={handleFetchAccountInfo}
      isLoadingAccountInfo={isLoadingAccountInfo}
      // (GĐ 3.2) Props cho Tabs (View)
      currentView={view}
      onChangeView={setView}
      // State & Handlers cho Module 2 (List)
      filteredThreads={filteredThreads}
      selectedThread={selectedThread}
      onSelectThread={(thread) => {
        setSelectedThread(thread);
      }}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onFetchThreads={handleFetchThreads}
      isLoadingThreads={isLoadingThreads}
      // Props cho Module 3 (Chat)
      // SỬA LỖI: Thêm lại prop 'thread' bị thiếu
      thread={selectedThread}
      messages={messages.filter((m) => m.threadId === selectedThread?.id)}
      onSendMessage={handleSendMessage}
      isEchoBotEnabled={isEchoBotEnabled}
      onToggleEchoBot={handleToggleEchoBot}
      // THÊM MỚI: Props cho Gửi Từ vựng
      onSendVocabulary={handleSendVocabulary}
      isSendingMessage={isSendingMessage}
      isSendingVocab={isSendingVocab}
      // State & Handlers cho Module 4 (Details)
      threadForDetails={selectedThread}
      isDetailsPanelOpen={isDetailsPanelOpen}
      onToggleDetails={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)}
      threads={threads}
      onRefreshThreads={handleFetchThreads}
      onClearSelectedThread={() => setSelectedThread(null)}
      // State & Handlers cho Lỗi
      errorMessage={errorMessage}
      onClearError={() => setErrorMessage(null)}
      // THÊM MỚI: Truyền handler set lỗi xuống
      onSetError={(msg) => setErrorMessage(msg)}
      // THÊM MỚI (Lô Cache): Truyền props cache
      userCache={userCache}
      onStartManualScan={handleStartManualScan}
      isScanningAll={isScanningAll}
      scanStatus={scanStatus}
    />
  );
}
