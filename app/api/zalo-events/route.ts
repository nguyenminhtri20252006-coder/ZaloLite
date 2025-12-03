/**
 * app/api/zalo-events/route.ts
 * [DEPRECATED]
 * Endpoint này đã bị hủy bỏ do chuyển sang kiến trúc Supabase Realtime.
 * Giữ lại file trống để tránh lỗi import legacy (nếu còn sót lại ở đâu đó).
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      message: "SSE endpoint is deprecated. Please use Supabase Realtime.",
    },
    { status: 410 },
  );
}
