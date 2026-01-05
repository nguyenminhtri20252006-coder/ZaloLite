/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/actions/staff.actions";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import supabase from "@/lib/supabaseServer";

/**
 * POST /api/bot/send-message
 * Gửi tin nhắn qua Bot (Support Offline Socket)
 * Body: { botId, targetId, message, type: 'text'|'image', quota? }
 */
export async function POST(req: Request) {
  try {
    // 1. Security Check (Internal Use Only)
    // Nếu muốn mở cho bên thứ 3, check API Key ở header thay vì Session
    const session = await getStaffSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { botId, targetId, message, type = "text" } = body;

    if (!botId || !targetId || !message) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 },
      );
    }

    // 2. Get Runtime
    const manager = BotRuntimeManager.getInstance();

    // Check nếu Bot chưa init
    // Lưu ý: getBotAPI sẽ throw error nếu bot chưa sẵn sàng
    // Logic yêu cầu: Bot status LOGGED_IN hoặc ACTIVE đều được gửi
    let api;
    try {
      api = manager.getBotAPI(botId);
    } catch (e) {
      return NextResponse.json(
        { success: false, error: "Bot offline or not initialized" },
        { status: 503 },
      );
    }

    // 3. Send Logic
    let sentMsg;
    if (type === "text") {
      sentMsg = await api.sendMessage(message, targetId, 1); // 1 = MessageType.Text
    } else if (type === "image") {
      // Cần logic upload ảnh nếu message là buffer hoặc path
      // Tạm thời support text link hoặc base64 tùy thư viện
      // Giả sử message là url
      return NextResponse.json(
        {
          success: false,
          error: "Image sending not fully implemented via API yet",
        },
        { status: 501 },
      );
    }

    // 4. Manual Log to Database (Quan trọng khi Realtime OFF)
    // Vì khi Realtime OFF, Bot sẽ không bắt được sự kiện "own_message" để lưu DB
    // Ta phải lưu tay.

    // Tìm conversation_id
    // Logic tìm conversation khá phức tạp (User vs Group).
    // Để đơn giản, ta tìm conversation có global_group_id = targetId (Group)
    // HOẶC conversation private chứa cả Bot và Target

    // Cách nhanh nhất: Tìm trong bảng conversations
    // (Đây là logic đơn giản hóa, thực tế cần check kỹ loại chat)
    let convId = null;

    // Thử tìm Group
    const { data: grp } = await supabase
      .from("conversations")
      .select("id")
      .eq("global_group_id", targetId)
      .single();
    if (grp) convId = grp.id;
    else {
      // Tìm Private: Cần query phức tạp hơn qua conversation_members
      // Tạm thời nếu không tìm thấy conv, ta bỏ qua bước log hoặc tạo mới conv (SyncService logic)
    }

    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId,
        zalo_msg_id: sentMsg.msgId || `api_${Date.now()}`,
        sender_identity_id: botId,
        content: { text: message },
        sent_at: new Date().toISOString(),
        sender_type: "bot",
      });

      // Update last_message for conversation
      await supabase
        .from("conversations")
        .update({
          last_message: { text: message, senderId: botId, ts: Date.now() },
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", convId);
    }

    return NextResponse.json({ success: true, data: sentMsg });
  } catch (error: any) {
    console.error("[API Send] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
