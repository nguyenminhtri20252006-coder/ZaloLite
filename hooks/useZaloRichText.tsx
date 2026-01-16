/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";

// Định nghĩa cấu trúc config cho mỗi mã Style
type StyleConfig = {
  className?: string;
  style?: React.CSSProperties;
  isBlock?: boolean;
};

// --- ZALO STYLE MAPPING ---
// Map các style chuẩn (cố định)
const BASE_STYLE_MAP: Record<string, StyleConfig> = {
  // --- FONTS ---
  b: { className: "font-bold" },
  weight_bold: { className: "font-bold" },
  i: { className: "italic" },
  style_italic: { className: "italic" },
  u: { className: "underline" },
  style_underline: { className: "underline" },
  s: { className: "line-through" },

  // --- STANDARD SIZES ---
  f_1: { style: { fontSize: "11px", lineHeight: "14px" } },
  f_2: { style: { fontSize: "14px", lineHeight: "18px" } },
  f_3: { style: { fontSize: "16px", lineHeight: "20px" } },
  f_4: { style: { fontSize: "20px", fontWeight: 500, lineHeight: "26px" } },

  // --- STANDARD COLORS ---
  c_1: { style: { color: "#767a7f" } }, // Grey
  c_2: { style: { color: "#000000" }, className: "dark:text-white" }, // Black
  c_3: { style: { color: "#0068ff" } }, // Blue
  c_4: { style: { color: "#ffba00" } }, // Gold
  c_5: { style: { color: "#ff3333" } }, // Red
  c_6: { style: { color: "#44bd32" } }, // Green
  c_7: { style: { color: "#e84393" } }, // Pink
  c_8: { style: { color: "#8e44ad" } }, // Purple

  // --- BLOCKS ---
  q: {
    isBlock: true,
    className:
      "block border-l-[3px] border-[#0068ff] bg-[#f1f5f9] dark:bg-gray-800 p-2 my-1 text-[#4a5568] dark:text-gray-300 rounded-r italic",
  },
  l_1: {
    isBlock: true,
    className: "block ml-6 list-disc marker:text-gray-500",
  },
  l_2: {
    isBlock: true,
    className: "block ml-6 list-decimal marker:text-gray-500",
  },
};

export function useZaloRichText() {
  // Helper: Giải mã 1 mã style đơn lẻ (VD: "c_f27806" hoặc "b")
  const resolveSingleStyle = (code: string): StyleConfig | null => {
    // 1. Check map chuẩn trước
    if (BASE_STYLE_MAP[code]) return BASE_STYLE_MAP[code];

    // 2. Dynamic Color (c_XXXXXX)
    if (code.startsWith("c_")) {
      const hex = code.replace("c_", "");
      // Validate hex cơ bản (3 hoặc 6 ký tự)
      if (/^[0-9a-fA-F]{3,6}$/.test(hex)) {
        return { style: { color: `#${hex}` } };
      }
    }

    // 3. Dynamic Size (f_XX) -> Map tương đối ra pixel
    if (code.startsWith("f_")) {
      const sizeVal = parseInt(code.replace("f_", ""), 10);
      if (!isNaN(sizeVal)) {
        // Zalo f_XX thường là pixel size (VD: f_18 = 18px)
        return {
          style: {
            fontSize: `${sizeVal}px`,
            lineHeight: `${Math.round(sizeVal * 1.3)}px`,
          },
        };
      }
    }

    return null;
  };

  const renderZaloText = (text: string, styles: any[]) => {
    if (!text) return null;

    if (!styles || !Array.isArray(styles) || styles.length === 0) {
      const hasLink = text.match(/(https?:\/\/[^\s]+)/g);
      return hasLink
        ? text.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) =>
            part.match(/^https?:\/\//) ? (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                {part}
              </a>
            ) : (
              part
            ),
          )
        : text;
    }

    // --- ALGORITHM ---

    // B1: Map ký tự
    const charMap = text.split("").map((char) => ({
      char,
      classes: new Set<string>(),
      inlineStyles: {} as React.CSSProperties,
      blockType: null as string | null,
    }));

    // B2: Apply Styles (Có xử lý comma-separated)
    styles.forEach((styleObj) => {
      const { start, len, st } = styleObj;
      if (!st) return;

      // [FIX] Tách chuỗi style bằng dấu phẩy (VD: "c_15a85f,f_18" -> ["c_15a85f", "f_18"])
      const subStyles = st.split(",").map((s: string) => s.trim());

      subStyles.forEach((subSt: string) => {
        const config = resolveSingleStyle(subSt);

        if (config) {
          const safeStart = Math.max(0, Math.min(start, text.length));
          const safeEnd = Math.max(0, Math.min(start + len, text.length));

          for (let i = safeStart; i < safeEnd; i++) {
            if (config.isBlock) {
              charMap[i].blockType = config.className || null;
            } else {
              if (config.className) charMap[i].classes.add(config.className);
              if (config.style) {
                charMap[i].inlineStyles = {
                  ...charMap[i].inlineStyles,
                  ...config.style,
                };
              }
            }
          }
        }
      });
    });

    // B3: Render & Flush Buffer
    const elements: React.ReactNode[] = [];

    let currentBuffer = "";
    let currentSignature = "";

    let activeClasses = "";
    let activeStyleObj: React.CSSProperties = {};
    let activeBlock = null as string | null;

    const getSignature = (
      classes: Set<string>,
      styles: React.CSSProperties,
      block: string | null,
    ) => {
      const cls = Array.from(classes).sort().join("|");
      const sty = JSON.stringify(styles);
      return `${block}::${cls}::${sty}`;
    };

    const flush = (keyIdx: number) => {
      if (currentBuffer.length === 0) return;

      let content: React.ReactNode = currentBuffer;

      if (currentBuffer.includes("\n")) {
        content = currentBuffer.split("\n").map((line, idx, arr) => (
          <React.Fragment key={idx}>
            {line}
            {idx < arr.length - 1 && <br />}
          </React.Fragment>
        ));
      }

      if (activeBlock) {
        elements.push(
          <div key={`blk-${keyIdx}`} className={activeBlock}>
            <span className={activeClasses} style={activeStyleObj}>
              {content}
            </span>
          </div>,
        );
      } else {
        elements.push(
          <span
            key={`spn-${keyIdx}`}
            className={activeClasses}
            style={activeStyleObj}
          >
            {content}
          </span>,
        );
      }
    };

    for (let i = 0; i < charMap.length; i++) {
      const charData = charMap[i];
      const newSignature = getSignature(
        charData.classes,
        charData.inlineStyles,
        charData.blockType,
      );

      if (newSignature !== currentSignature) {
        flush(i);

        currentBuffer = charData.char;
        currentSignature = newSignature;

        activeClasses = Array.from(charData.classes).join(" ");
        activeStyleObj = charData.inlineStyles;
        activeBlock = charData.blockType;
      } else {
        currentBuffer += charData.char;
      }
    }

    flush(charMap.length);

    return elements;
  };

  return { renderZaloText };
}
