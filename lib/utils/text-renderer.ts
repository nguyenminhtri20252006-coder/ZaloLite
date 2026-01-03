/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/utils/text-renderer.ts
 * [CLEANUP] Removed debug logs.
 */

import { NormalizedContent } from "@/lib/types/zalo.types";

// --- 1. ZALO STYLED TEXT LOGIC (EXISTING) ---

// Định nghĩa kiểu Style từ Zalo
export interface ZaloStyle {
  start: number;
  len: number;
  st: string;
}

// Định nghĩa một đoạn văn bản sau khi xử lý
export interface StyledSegment {
  text: string;
  styles: string[];
}

function mapStyleToClass(zaloCode: string): string {
  if (zaloCode === "b") return "font-bold";
  if (zaloCode === "i") return "italic";
  if (zaloCode.startsWith("c_")) {
    const colorHex = zaloCode.replace("c_", "#");
    return `text-[${colorHex}]`;
  }
  if (zaloCode.startsWith("f_")) {
    const size = parseInt(zaloCode.replace("f_", ""), 10);
    if (size >= 20) return "text-xl";
    if (size >= 16) return "text-lg";
    if (size <= 12) return "text-xs";
    return "text-base";
  }
  return "";
}

export function processStyledText(
  text: string,
  styles?: ZaloStyle[],
): StyledSegment[] {
  if (!text) {
    return [];
  }

  if (!styles || styles.length === 0) {
    return [{ text, styles: [] }];
  }

  const points = new Set<number>();
  points.add(0);
  points.add(text.length);

  styles.forEach((s) => {
    points.add(s.start);
    points.add(s.start + s.len);
  });

  // Sắp xếp các điểm cắt
  const sortedPoints = Array.from(points).sort((a, b) => a - b);

  const segments: StyledSegment[] = [];

  // 2. Duyệt qua từng khoảng giữa các điểm cắt
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const pStart = sortedPoints[i];
    const pEnd = sortedPoints[i + 1];

    if (pStart >= pEnd) continue;

    const segmentText = text.slice(pStart, pEnd);
    const segmentStyles: string[] = [];

    // 3. Kiểm tra xem đoạn này nằm trong phạm vi style nào
    styles.forEach((s) => {
      const sEnd = s.start + s.len;
      // Nếu đoạn [pStart, pEnd] nằm hoàn toàn trong [s.start, sEnd]
      if (pStart >= s.start && pEnd <= sEnd) {
        const cssClass = mapStyleToClass(s.st);
        if (cssClass) segmentStyles.push(cssClass);
      }
    });

    segments.push({
      text: segmentText,
      styles: segmentStyles,
    });
  }

  return segments;
}

// --- 2. SNIPPET RENDERING (NEW FOR SIDEBAR) ---

export function renderSnippet(
  content: NormalizedContent | null | undefined,
): string {
  if (!content || !content.type) return "";

  switch (content.type) {
    case "text":
      return (content.data as any).text || "";

    case "image":
      return "📷 [Hình ảnh]";

    case "sticker":
      return "😊 [Nhãn dán]";

    case "voice":
      return "🎤 [Tin nhắn thoại]";

    case "video":
      return "🎥 [Video]";

    case "file":
      return `📁 [File] ${
        (content.data as any).name || (content.data as any).title || ""
      }`;

    case "link":
      return "🔗 [Liên kết]";

    case "location":
      return "📍 [Vị trí]";

    default:
      return "Tin nhắn mới";
  }
}

// --- 3. TIME FORMATTING (NEW UTILITY) ---

export function formatTime(isoString: string | undefined): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const isYesterday =
    new Date(now.setDate(now.getDate() - 1)).toDateString() ===
    date.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else if (isYesterday) {
    return "Hôm qua";
  } else {
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  }
}
