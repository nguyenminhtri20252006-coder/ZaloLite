"use server";

/**
 * lib/actions/test.actions.ts
 *
 * (REFACTORED)
 * Lớp Facade (Mặt tiền) cho hệ thống kiểm thử.
 * Nhiệm vụ: Nhận yêu cầu từ API/Client -> Gọi logic chi tiết trong `lib/tests/`.
 */

import { ThreadType } from "@/lib/types/zalo.types";
import { delay } from "@/lib/tests/utils";

// Import các Test Suites chi tiết
import { runVocabularyTest } from "@/lib/tests/suites/vocabulary.test";
import {
  runTestStyledText,
  runTestImageAttachment,
  runTestVoice,
  runTestLink,
} from "@/lib/tests/suites/media.test";

// --- EXPOSE CHO UI ---

// 1. Test Media Group
export async function testMediaAction(
  threadId: string,
  type: ThreadType,
  feature: "style" | "image" | "voice" | "link",
) {
  switch (feature) {
    case "style":
      return runTestStyledText(threadId, type);
    case "image":
      return runTestImageAttachment(threadId, type);
    case "voice":
      return runTestVoice(threadId, type);
    case "link":
      return runTestLink(threadId, type);
  }
}

// 2. Test Vocabulary Group
export async function testVocabularyAction(threadId: string, type: ThreadType) {
  return runVocabularyTest(threadId, type);
}

// 3. Test All (Legacy/Automation support)
export async function runAllMessagingTestsAction(
  threadId: string,
  type: ThreadType,
) {
  console.log(`[Test Action] Running ALL tests for ${threadId}`);
  await runTestStyledText(threadId, type);
  await delay(1000);
  await runTestImageAttachment(threadId, type);
  await delay(1000);
  await runVocabularyTest(threadId, type);
  return { success: true };
}
