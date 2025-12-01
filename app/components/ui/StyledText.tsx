"use client";

import { useMemo } from "react";
import { processStyledText, ZaloStyle } from "@/lib/utils/text-renderer";

/**
 * app/components/ui/StyledText.tsx
 * Component hiển thị văn bản có định dạng (Bold, Color, Size).
 */

export function StyledText({
  text,
  styles,
  className = "",
}: {
  text: string;
  styles?: ZaloStyle[];
  className?: string;
}) {
  // Sử dụng useMemo để tránh tính toán lại không cần thiết khi re-render
  const segments = useMemo(
    () => processStyledText(text, styles),
    [text, styles],
  );

  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, index) => {
        // Gộp các class style lại
        // Lưu ý: Tailwind arbitrary values (như text-[#...]) cần cấu hình đúng hoặc dùng style inline
        // Để an toàn, ta xử lý riêng phần màu sắc nếu là hex code
        const colorStyle = seg.styles.find((s) => s.startsWith("text-[#"));
        const otherClasses = seg.styles
          .filter((s) => !s.startsWith("text-[#"))
          .join(" ");

        // Trích xuất mã màu từ chuỗi "text-[#...]" -> "#..."
        const inlineColor = colorStyle
          ? colorStyle.match(/text-\[(#[0-9a-fA-F]+)\]/)?.[1]
          : undefined;

        return (
          <span
            key={index}
            className={otherClasses}
            style={inlineColor ? { color: inlineColor } : undefined}
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}
