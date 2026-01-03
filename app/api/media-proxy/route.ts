import { NextRequest, NextResponse } from "next/server";

/**
 * API Proxy để bypass lỗi 403 Forbidden của Zalo CDN (hoặc Audio).
 * Usage: /api/media-proxy?url=ENCODED_URL
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing URL param", { status: 400 });
  }

  try {
    // 1. Fetch resource từ Zalo/External
    const response = await fetch(url, {
      headers: {
        // Giả lập User-Agent để tránh bị chặn
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://chat.zalo.me/",
      },
    });

    if (!response.ok) {
      console.error(
        `Proxy Fetch Error: ${response.status} ${response.statusText}`,
      );
      return new NextResponse("Failed to fetch upstream", { status: 502 });
    }

    // 2. Chuẩn bị Headers trả về
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    // Cache mạnh (1 năm) vì URL media của Zalo thường immutable
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    // 3. Stream body về Client
    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Proxy Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
