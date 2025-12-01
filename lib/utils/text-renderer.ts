/**
 * lib/utils/text-renderer.ts
 * [CLEANUP] Removed debug logs.
 */

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
