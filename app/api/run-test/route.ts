/**
 * app/api/run-test/route.ts
 *
 * (TỆP MỚI)
 * Cổng API (Gateway) để kích hoạt logic kiểm thử từ một script bên ngoài.
 * Endpoint này nhận yêu cầu POST, gọi Lớp 2.5 (Test Actions),
 * và trả về kết quả.
 */

import { NextRequest, NextResponse } from "next/server";
// Import hàm chạy kiểm thử tổng hợp từ Lớp 2.5
import { runAllMessagingTestsAction } from "@/lib/actions/test.actions";
// Import enum ThreadType để ép kiểu chính xác
import { ThreadType } from "@/lib/types/zalo.types";

/**
 * Xử lý POST request để chạy bộ kiểm thử
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Đọc JSON body từ request
    const body = await request.json();
    const { threadId, type } = body;

    // 2. Xác thực dữ liệu đầu vào
    // (type có thể là 0, nên chúng ta kiểm tra `undefined`)
    if (!threadId || typeof type === "undefined") {
      return NextResponse.json(
        { success: false, error: "Thiếu 'threadId' hoặc 'type' trong body" },
        { status: 400 }, // 400 Bad Request
      );
    }

    // 3. Ép kiểu (type assertion) từ số (0/1) sang Enum
    // Điều này rất quan trọng để đảm bảo Lớp 3 (Service) nhận đúng loại
    const threadType: ThreadType =
      type === 0 ? ThreadType.User : ThreadType.Group;

    // 4. Gọi Lớp 2.5 (Test Actions)
    // Toàn bộ logic kiểm thử (fetch ảnh, tạo buffer, gửi voice)
    // được thực thi an toàn bên trong Server Action.
    console.log(
      `[API /run-test] Nhận được yêu cầu kiểm thử cho threadId: ${threadId}, type: ${threadType}`,
    );
    const results = await runAllMessagingTestsAction(threadId, threadType);

    // 5. Trả về kết quả thành công
    return NextResponse.json({
      success: true,
      message: "Thực thi bộ kiểm thử đa phương tiện hoàn tất.",
      results: results,
    });
  } catch (error: unknown) {
    // 6. Xử lý lỗi (nếu Lớp 2.5 hoặc Lớp 3 ném lỗi)
    console.error("[API /run-test] Lỗi nghiêm trọng khi thực thi:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }, // 500 Internal Server Error
    );
  }
}

// Đảm bảo route này luôn chạy động (dynamically)
export const dynamic = "force-dynamic";
