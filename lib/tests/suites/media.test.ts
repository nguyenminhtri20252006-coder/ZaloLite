import {
  sendMessageAction,
  sendVoiceAction,
  sendVideoAction,
  sendLinkAction,
} from "@/lib/actions/chat.actions";
import {
  MessageContent,
  ThreadType,
  SendVoiceOptions,
  SendVideoOptions,
  SendLinkOptions,
} from "@/lib/types/zalo.types";

// Tạm thời define enum cục bộ nếu chưa export từ SSOT
enum TextStyle {
  Bold = "b",
  Italic = "i",
  Red = "c_db342e",
  Big = "f_18",
}

/**
 * [Suite 1] Test Styled Text
 */
export async function runTestStyledText(threadId: string, type: ThreadType) {
  console.log(`[Media Suite] Styled Text -> ${threadId}`);
  const text = "Big - Bold - Italic - Red";
  const message: MessageContent = {
    msg: text,
    styles: [
      { start: 0, len: 3, st: TextStyle.Big },
      { start: 6, len: 4, st: TextStyle.Bold },
      { start: 13, len: 6, st: TextStyle.Italic },
      { start: 22, len: 3, st: TextStyle.Red },
    ],
  };
  return sendMessageAction(message, threadId, type);
}

/**
 * [Suite 2] Test Image Attachment (Buffer)
 */
export async function runTestImageAttachment(
  threadId: string,
  type: ThreadType,
) {
  console.log(`[Media Suite] Image Attachment -> ${threadId}`);
  const imageUrl =
    "https://f21-zpc.zdn.vn/jpg/8848797253866041229/0fbba8d4891d05435c0c.jpg";

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Fetch image failed");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const message: MessageContent = {
      msg: "Kiểm thử: Gửi ảnh (Buffer)",
      attachments: [
        {
          data: buffer,
          filename: "test.jpg",
          metadata: { totalSize: buffer.length },
        },
      ],
    };
    return sendMessageAction(message, threadId, type);
  } catch (e) {
    console.error("[Media Suite] Error:", e);
    throw e;
  }
}

/**
 * [Suite 3] Test Voice (URL)
 */
export async function runTestVoice(threadId: string, type: ThreadType) {
  console.log(`[Media Suite] Voice URL -> ${threadId}`);
  const voiceUrl =
    "https://voice-aac-dl.zdn.vn/4300961803396616484/abdf77fb64b185efdca0.aac";
  return sendVoiceAction({ voiceUrl, ttl: 0 }, threadId, type);
}

/**
 * [Suite 4] Test Link Preview
 */
export async function runTestLink(threadId: string, type: ThreadType) {
  console.log(`[Media Suite] Link Preview -> ${threadId}`);
  return sendLinkAction(
    { link: "https://google.com", msg: "Test Link Preview", ttl: 0 },
    threadId,
    type,
  );
}
