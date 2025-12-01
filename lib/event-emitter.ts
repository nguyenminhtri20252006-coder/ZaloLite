/**
 * lib/event-emitter.ts
 *
 * Tạo một instance EventEmitter toàn cục (singleton) để cho phép
 * Service Layer (Stateful) và API Routes (Stateless/Stream)
 * giao tiếp với nhau trong cùng một tiến trình Node.js.
 */
import { EventEmitter } from "events";
// SỬA ĐỔI: Nhập hằng số từ tệp types
import { ZALO_EVENTS } from "@/lib/types/zalo.types";

// --- SỬA LỖI KIẾN TRÚC: Đảm bảo Singleton trong môi trường Next.js ---

// 1. Mở rộng 'globalThis' để thêm 'zaloEmitter' (cho TypeScript)
const customGlobal = globalThis as typeof globalThis & {
  zaloEmitter: EventEmitter;
};

// 2. Khởi tạo Singleton cho Emitter
// Nếu instance chưa tồn tại trên globalThis, tạo nó.
if (!customGlobal.zaloEmitter) {
  console.log(
    "[Global] Đang khởi tạo globalZaloEmitter (Singleton) lần đầu...",
  );
  customGlobal.zaloEmitter = new EventEmitter();
  // Tăng giới hạn listener mặc định (10) đề phòng nhiều tab/kết nối SSE
  customGlobal.zaloEmitter.setMaxListeners(50);
}

// 3. Luôn export instance toàn cục (global)
// Đây là instance duy nhất sẽ được chia sẻ
export const globalZaloEmitter = customGlobal.zaloEmitter;

// --- Kết thúc sửa lỗi kiến trúc ---

// XÓA: Di chuyển định nghĩa ZALO_EVENTS sang tệp types
// export const ZALO_EVENTS = { ... };

// THÊM MỚI: Export lại ZALO_EVENTS từ tệp types để các tệp khác
// (như zalo-events/route.ts) không bị lỗi import
export { ZALO_EVENTS };
