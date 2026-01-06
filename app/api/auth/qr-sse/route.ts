import { NextRequest } from "next/server";
import { sseManager } from "@/lib/core/sse-manager";

// SSE yêu cầu dynamic, không cache
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // Đăng ký kết nối vào Manager
      sseManager.addClient(sessionId, controller);

      // Gửi message chào
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: connected\ndata: "ready"\n\n`));

      // Cleanup khi client ngắt kết nối
      req.signal.addEventListener("abort", () => {
        sseManager.removeClient(sessionId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
