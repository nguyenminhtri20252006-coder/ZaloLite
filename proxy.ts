import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 1. Cấu hình Matcher (Cực kỳ quan trọng để tối ưu hiệu suất)
export const config = {
  // runtime: 'nodejs', // Mặc định ở Next.js 15+ thường là nodejs nếu không khai báo edge
  matcher: [
    /*
     * Khớp tất cả các đường dẫn trừ:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

export async function proxy(request: NextRequest) {
  // Lấy pathname để check
  const { pathname } = request.nextUrl;

  // [LOG] Kiểm tra xem Proxy có đang hoạt động không
  // Bạn sẽ thấy dòng này trong Server Console mỗi khi chuyển trang
  console.log(`[Proxy] Incoming request: ${pathname}`);

  // 2. Lấy cookie (Sử dụng cách mới)
  const sessionToken = request.cookies.get("staff_session")?.value;

  // 1. Nếu đang ở trang Login mà đã có token (giả định là còn hạn) -> Đá về Dashboard
  if (pathname.startsWith("/login") && sessionToken) {
    console.log(`[Proxy] User logged in, redirecting to /dashboard`);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. Bảo vệ các route cần đăng nhập (Dashboard, Bot Manager, Chat Live,...)
  const protectedPaths = [
    "/dashboard",
    "/bot-manager",
    "/chat_live",
    "/system",
  ];
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  if (isProtected && !sessionToken) {
    console.log(
      `[Proxy] Unauthorized access to ${pathname}, redirecting to /login`,
    );
    // Lưu URL hiện tại để redirect lại sau khi login (nếu muốn tính năng này sau này)
    const loginUrl = new URL("/login", request.url);
    // loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Thêm Header tùy chỉnh để đánh dấu request đã qua Proxy (Debug)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-proxy-active", "true");

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
