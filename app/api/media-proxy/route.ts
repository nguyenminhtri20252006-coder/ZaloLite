import { NextRequest, NextResponse } from "next/server";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import axios from "axios";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const botId = req.nextUrl.searchParams.get("botId");

  if (!url || !botId) {
    return new NextResponse("Missing url or botId", { status: 400 });
  }

  // 1. Lấy Context của Bot để có Cookie
  const api = BotRuntimeManager.getInstance().getBotAPI(botId);
  if (!api) {
    return new NextResponse("Bot offline", { status: 503 });
  }

  // 2. Lấy Cookie & UserAgent
  // [FIX] Cast api to any to access internal request object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiInternal = api as any;
  // Giả định library structure: api.request.cookieJar.getCookieString(url)
  const cookie = apiInternal.request?.cookieJar?.getCookieString(url) || "";
  const userAgent =
    apiInternal.request?.userAgent ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  try {
    // 3. Request tới Zalo (Stream)
    const response = await axios({
      method: "get",
      url: url,
      responseType: "stream",
      headers: {
        Cookie: cookie,
        "User-Agent": userAgent,
        Referer: "https://chat.zalo.me/",
        // Forward range header for seeking support
        Range: req.headers.get("range") || undefined,
      },
      validateStatus: () => true,
    });

    // 4. Trả về Stream cho Client
    const headers = new Headers();
    if (response.headers["content-type"]) {
      headers.set("Content-Type", response.headers["content-type"]);
    }
    if (response.headers["content-length"]) {
      headers.set("Content-Length", response.headers["content-length"]);
    }
    if (response.headers["content-range"]) {
      headers.set("Content-Range", response.headers["content-range"]);
    }
    if (response.headers["accept-ranges"]) {
      headers.set("Accept-Ranges", response.headers["accept-ranges"]);
    }

    // [FIX] TypeScript issue with axios stream & NextResponse body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(response.data as any, {
      status: response.status,
      headers: headers,
    });
  } catch (error) {
    console.error("[MediaProxy] Error:", error);
    return new NextResponse("Proxy Error", { status: 500 });
  }
}
