/* eslint-disable @typescript-eslint/no-explicit-any */

export class InteractionParser {
  /**
   * Xử lý Sticker, Reaction
   */

  public static parseSticker(data: any) {
    const c = data.content || {};
    return {
      stickerId: Number(c.id) || 0,
      cateId: Number(c.cateId || c.catId) || 0,
      type: Number(c.type) || 1,
      url: c.url || c.stickerUrl || null, // Zalo có thể trả về null, Client phải tự resolve theo cateId/stickerId
    };
  }

  public static parseReaction(data: any) {
    // chat.reaction & chat.reaction(undo)
    const c = data.content || {};

    // Reaction Undo thường có rType = -1 hoặc logic riêng
    // Zalo JSON: "rType": 32 (Like), "rIcon": ":o"
    // Zalo Undo: "rType": -1

    return {
      icon: c.rIcon || "",
      type: Number(c.rType),
      sourceMsgId: c.rMsg && c.rMsg[0] ? String(c.rMsg[0].cMsgID) : "", // ID tin nhắn bị react
      senderUid: String(data.uidFrom),
      isUndo: Number(c.rType) === -1,
    };
  }
}
