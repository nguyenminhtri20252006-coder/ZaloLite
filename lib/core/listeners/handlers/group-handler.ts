/* eslint-disable @typescript-eslint/no-explicit-any */ /**
 * lib/core/listeners/handlers/group-handler.ts
 * Xử lý các sự kiện thay đổi trong nhóm: Update Member, Poll, Pin
 */

import { ConversationService } from "@/lib/core/services/conversation-service";
import { SyncService } from "@/lib/core/services/sync-service";

export class GroupHandler {
  public async handleGroupEvent(event: any, botId: string, api: any) {
    try {
      const type = event.type; // UPDATE_MEMBER, UPDATE_BOARD, etc.
      console.log(`[GroupHandler] 👥 Event ${type} received for Bot ${botId}`);

      switch (type) {
        case "UPDATE_MEMBER":
          await this.handleUpdateMember(event, botId, api);
          break;

        case "NEW_PIN_TOPIC":
          console.log(
            `[GroupHandler] 📌 New Pin Topic in Group ${event.groupId}`,
          );
          // TODO: Update pinned status in DB
          break;

        case "UPDATE_BOARD":
          // Xử lý Poll (Bình chọn)
          if (event.data?.groupTopic?.type === 3) {
            console.log(
              `[GroupHandler] 📊 Poll Update in Group ${event.groupId}`,
            );
          }
          break;

        default:
          console.log(`[GroupHandler] Unhandled Group Event: ${type}`);
      }
    } catch (e: any) {
      console.error(`[GroupHandler] Error:`, e);
    }
  }

  private async handleUpdateMember(event: any, botId: string, api: any) {
    // Khi có người ra/vào, tốt nhất là trigger sync lại nhóm đó để đảm bảo nhất quán
    // event.groupId là ID nhóm bị thay đổi
    const groupId = event.groupId;
    if (!groupId) return;

    console.log(`[GroupHandler] 🔄 Triggering Sync for Group ${groupId}...`);

    // Gọi SyncService để sync lại thành viên của nhóm này
    // Lưu ý: Cần viết hàm sync riêng lẻ cho 1 nhóm trong SyncService để tối ưu (TODO)
    // Tạm thời Log ra để biết flow đã chạy
    console.log(
      `[GroupHandler] -> Detect member change. Should sync group ${groupId} now.`,
    );
  }
}
