import { NextRequest } from "next/server";
import { sseManager } from "@/lib/core/sse-manager";
import { getStaffSession } from "@/lib/actions/staff.actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Strict Auth Check
  // Note: SSE request không gửi qua server actions nên ta gọi hàm check session trực tiếp
  // Hàm này sẽ tự đọc cookie từ request header
  const session = await getStaffSession();

  if (!session) {
    console.warn("[SSE-Stream] 🛑 Unauthorized Connection Attempt");
    return new Response("Unauthorized", { status: 401 });
  }

  const staffId = session.id;

  const stream = new ReadableStream({
    start(controller) {
      // 2. Register Client
      sseManager.addClient(staffId, controller);

      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: connected\ndata: "ready"\n\n`));

      // 3. Cleanup
      req.signal.addEventListener("abort", () => {
        sseManager.removeClient(staffId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Encoding": "none",
    },
  });
}
