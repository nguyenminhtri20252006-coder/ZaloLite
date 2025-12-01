"use server";

/**
 * lib/actions/auth.actions.ts
 *
 * Lớp Logic (Server Actions - Lớp 2) - Nghiệp vụ Xác thực.
 * Cầu nối giữa UI (Client) và Service (Server Stateful) cho các tác vụ login/logout.
 */

import { ZaloSingletonService } from "@/lib/runtime-service";

/**
 * Kích hoạt quá trình đăng nhập QR
 */
export async function startLoginQRAction() {
  console.log("[Action] Yêu cầu startLoginQRAction...");
  // Đây là một lệnh 'void', nó chỉ kích hoạt quá trình
  // Phản hồi sẽ được gửi qua SSE
  ZaloSingletonService.getInstance().startLoginQR();
}

/**
 * Kích hoạt quá trình đăng nhập bằng Token (Session JSON)
 */
export async function startLoginWithTokenAction(tokenString: string) {
  console.log("[Action] Yêu cầu startLoginWithTokenAction...");
  if (!tokenString) {
    throw new Error("Session Token không được để trống.");
  }
  try {
    // Chỉ gọi, không trả về gì. SSE sẽ xử lý phản hồi thành công/thất bại.
    // Lỗi (vd: parse JSON, token hết hạn) sẽ được ném (throw) từ Service.
    await ZaloSingletonService.getInstance().startLoginWithToken(tokenString);
  } catch (error: unknown) {
    // Chuyển lỗi từ Service thành lỗi mà UI có thể hiển thị.
    const message =
      error instanceof Error
        ? error.message
        : "Lỗi đăng nhập token không xác định";
    console.error("[Action Error] startLoginWithTokenAction:", message);
    // Ném lỗi về cho client component (UI)
    throw new Error(message);
  }
}

/**
 * Lấy trạng thái đăng nhập hiện tại (dùng khi tải trang)
 */
export async function getLoginStatusAction() {
  return ZaloSingletonService.getInstance().getStatus();
}

/**
 * Action lấy Session Token (dùng cho copy)
 */
export async function getSessionTokenAction(): Promise<string> {
  console.log("[Action] Yêu cầu getSessionTokenAction...");
  try {
    return await ZaloSingletonService.getInstance().getSessionToken();
  } catch (error) {
    console.error("[Action Error] getSessionTokenAction:", error);
    throw new Error(
      error instanceof Error ? error.message : "Lỗi không xác định ở Action",
    );
  }
}

/**
 * Action Đăng xuất
 */
export async function logoutAction() {
  console.log("[Action] Yêu cầu logoutAction...");
  try {
    // SỬA ĐỔI: Đảm bảo gọi logout() là async (dù service hiện tại là sync)
    // để tuân thủ nếu service thay đổi trong tương lai
    await ZaloSingletonService.getInstance().logout();
  } catch (error) {
    console.error("[Action Error] logoutAction:", error);
    // Không cần ném lỗi về, vì UI sẽ reset dựa trên sự kiện SSE
  }
}
