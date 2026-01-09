/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/core/listeners/handlers/interaction-handler.ts
 * Xử lý các tương tác: Thu hồi tin nhắn (Undo) & Thả tim (Reaction)
 */

import supabase from "@/lib/supabaseServer";

export class InteractionHandler {
  /**
   * Xử lý sự kiện Undo (Thu hồi tin nhắn)
   * @param event Dữ liệu thô từ socket
   * @param botId ID của Bot nhận được sự kiện
   */
  public async handleUndo(event: any, botId: string) {
    try {
      // ZCA-JS: event undo trả về { msgId: "...", ... }
      const msgId = event.msgId;

      if (!msgId) {
        console.warn(`[InteractionHandler] ⚠️ Undo event missing msgId`, event);
        return;
      }

      console.log(
        `[InteractionHandler] 🔄 Processing Undo for Msg: ${msgId} (Bot: ${botId})`,
      );

      // Update DB: Đánh dấu is_recalled = true, Xóa nội dung để bảo mật
      const { error } = await supabase
        .from("messages")
        .update({
          is_recalled: true,
          content: { text: "Tin nhắn đã được thu hồi" }, // Placeholder content
          updated_at: new Date().toISOString(),
        })
        .eq("zalo_msg_id", msgId);

      if (error) {
        console.error(
          `[InteractionHandler] ❌ Failed to recall msg ${msgId}:`,
          error.message,
        );
      } else {
        console.log(
          `[InteractionHandler] ✅ Recalled msg ${msgId} successfully.`,
        );
      }
    } catch (e: any) {
      console.error(`[InteractionHandler] Error in handleUndo:`, e);
    }
  }

  /**
   * Xử lý sự kiện Reaction (Thả cảm xúc)
   * @param event Dữ liệu thô
   */
  public async handleReaction(event: any, botId: string) {
    // Hiện tại ZCA-JS có thể trả về cấu trúc khác nhau cho reaction
    // Cần log để debug cấu trúc chính xác trước khi implement logic DB phức tạp
    console.log(
      `[InteractionHandler] ❤️ Reaction Received on Bot ${botId}:`,
      JSON.stringify(event),
    );

    // TODO: Implement Logic lưu reaction vào bảng messages (cột metadata hoặc bảng riêng)
    // Tạm thời chỉ Log để verify sự kiện
  }
}
