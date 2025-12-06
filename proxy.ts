import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Lấy token từ cookie
  const sessionToken = request.cookies.get("staff_session")?.value;

  const { pathname } = request.nextUrl;

  // 1. Nếu đang ở trang Login mà đã có token -> Đá về Dashboard
  if (pathname.startsWith("/login") && sessionToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. Nếu đang cố vào Dashboard mà không có token -> Đá về Login
  if (pathname.startsWith("/dashboard") && !sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

// Cấu hình matcher để middleware chỉ chạy trên các route cần thiết
export const config = {
  matcher: ["/", "/login", "/dashboard/:path*"],
};
