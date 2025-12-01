/**
 * app/api/zalo-events/route.ts
 *
 * Endpoint Server-Sent Events (SSE).
 * Lắng nghe `globalZaloEmitter` và đẩy (push) sự kiện xuống client.
 */
import { globalZaloEmitter, ZALO_EVENTS } from "@/lib/event-emitter";
import { ZaloSingletonService } from "@/lib/runtime-service";
import { NextRequest } from "next/server";

// Hàm trợ giúp để gửi dữ liệu SSE
function createSSEStream(controller: ReadableStreamDefaultController) {
  const encoder = new TextEncoder();

  // LỖI: Thay thế 'any' bằng 'unknown'
  const sendEvent = (eventName: string, data: unknown) => {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(message));
  };

  const sendRawEvent = (eventName: string, rawData: string) => {
    const message = `event: ${eventName}\ndata: ${rawData}\n\n`;
    controller.enqueue(encoder.encode(message));
  };

  // --- Lắng nghe các sự kiện từ Singleton Service ---
  const onQrGenerated = (qrBase64: string) => {
    // SỬA LỖI (KẾ HOẠCH E/F): Gửi thẳng string base64, không bọc object
    sendRawEvent(ZALO_EVENTS.QR_GENERATED, qrBase64);
  };

  const onLoginSuccess = () => {
    sendEvent(ZALO_EVENTS.LOGIN_SUCCESS, { message: "Đăng nhập thành công!" });
  };

  const onLoginFailure = (error: string) => {
    sendEvent(ZALO_EVENTS.LOGIN_FAILURE, { error: error });
  };

  // LỖI: Thay thế 'any' bằng 'unknown'
  const onNewMessage = (msg: unknown) => {
    sendEvent(ZALO_EVENTS.NEW_MESSAGE, msg);
  };

  // LỖI: Thay thế 'any' bằng 'unknown'
  const onStatusUpdate = (status: unknown) => {
    sendEvent(ZALO_EVENTS.STATUS_UPDATE, status);
  };

  // Đăng ký (subscribe) các listener
  globalZaloEmitter.on(ZALO_EVENTS.QR_GENERATED, onQrGenerated);
  globalZaloEmitter.on(ZALO_EVENTS.LOGIN_SUCCESS, onLoginSuccess);
  globalZaloEmitter.on(ZALO_EVENTS.LOGIN_FAILURE, onLoginFailure);
  globalZaloEmitter.on(ZALO_EVENTS.NEW_MESSAGE, onNewMessage);
  globalZaloEmitter.on(ZALO_EVENTS.STATUS_UPDATE, onStatusUpdate);

  // Trả về một hàm dọn dẹp (cleanup)
  return () => {
    console.log("[SSE] Client đã ngắt kết nối. Đang dọn dẹp listeners...");
    globalZaloEmitter.off(ZALO_EVENTS.QR_GENERATED, onQrGenerated);
    globalZaloEmitter.off(ZALO_EVENTS.LOGIN_SUCCESS, onLoginSuccess);
    globalZaloEmitter.off(ZALO_EVENTS.LOGIN_FAILURE, onLoginFailure);
    globalZaloEmitter.off(ZALO_EVENTS.NEW_MESSAGE, onNewMessage);
    globalZaloEmitter.off(ZALO_EVENTS.STATUS_UPDATE, onStatusUpdate);
  };
}

export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": KẾT NỐI SSE ĐƯỢT THIẾT LẬP\n\n"));

      // Gửi trạng thái hiện tại ngay khi kết nối
      const currentStatus = ZaloSingletonService.getInstance().getStatus();
      controller.enqueue(
        encoder.encode(
          `event: ${ZALO_EVENTS.STATUS_UPDATE}\ndata: ${JSON.stringify(
            currentStatus,
          )}\n\n`,
        ),
      );

      const cleanup = createSSEStream(controller);

      request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      console.log("[SSE] Stream bị hủy.");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";
