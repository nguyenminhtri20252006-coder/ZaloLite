/**
 * lib/utils/message-formatter.ts
 *
 * Bộ xử lý (Processor) để chuyển đổi Dữ liệu Từ vựng + Template
 * thành nội dung tin nhắn Zalo có định dạng (Offset-based Styling).
 */
import { VocabularyWord } from "@/lib/types/vocabulary.types";
import { MessageContent } from "@/lib/types/zalo.types";

// Định nghĩa kiểu cho một bước trong Template
export type FormatStep = {
  field?: keyof VocabularyWord | "explanation_list"; // Trường dữ liệu
  text?: string; // Văn bản tĩnh
  styles?: string[]; // Danh sách style (vd: ["b", "c_db342e"])
};

// Định nghĩa kiểu cho Style Zalo
type ZaloStyle = {
  start: number;
  len: number;
  st: string;
};

/**
 * Hàm helper để lấy giá trị từ object dựa trên field name
 */
function getFieldValue(data: VocabularyWord, field: string): string {
  if (field === "explanation_list") {
    if (!data.explanation || data.explanation.length === 0) return "";
    // Định dạng danh sách giải thích: • term (type): meaning
    return data.explanation
      .map((ex) => `• ${ex.term} (${ex.type}): ${ex.meaning_vi}`)
      .join("\n");
  }
  const value = data[field as keyof VocabularyWord];
  return typeof value === "string" ? value : "";
}

/**
 * Hàm chính: Format tin nhắn
 */
export function formatVocabularyMessage(
  data: VocabularyWord,
  template: FormatStep[],
  currentIndex: number = 1,
  totalIndex: number = 1,
): MessageContent {
  // 1. Khởi tạo nội dung với chỉ mục
  // SỬA ĐỔI: Nếu totalIndex > 1 (tức là đang chạy test loạt), thêm prefix đánh dấu
  let fullText = "";
  if (totalIndex > 1) {
    fullText = `[Mẫu ${currentIndex}/${totalIndex}]\n`;
  }

  const styles: ZaloStyle[] = [];

  template.forEach((step) => {
    let contentToAdd = "";

    // 1. Xác định nội dung cần thêm (Từ dữ liệu hoặc Text tĩnh)
    if (step.text) {
      contentToAdd = step.text;
    } else if (step.field) {
      contentToAdd = getFieldValue(data, step.field);
    }

    if (!contentToAdd) return; // Bỏ qua nếu rỗng

    // 2. Tính toán vị trí (Offset)
    const startIndex = fullText.length;
    const length = contentToAdd.length;

    // 3. Cộng vào chuỗi chính
    fullText += contentToAdd;

    // 4. Áp dụng Style (nếu có)
    if (step.styles && step.styles.length > 0) {
      step.styles.forEach((st) => {
        styles.push({
          start: startIndex,
          len: length,
          st: st,
        });
      });
    }
  });

  // Trả về object MessageContent tương thích với zca-js
  return {
    msg: fullText,
    // SỬA LỖI: Ép kiểu 'any' để tránh lỗi mismatch giữa 'string' và 'TextStyle' enum của thư viện
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    styles: styles.length > 0 ? (styles as any) : undefined,
  };
}

// --- CÁC TEMPLATE MẪU (Hardcoded theo yêu cầu) ---

export const TEMPLATE_1_MINIMALIST: FormatStep[] = [
  { field: "word", styles: ["b", "f_18"] },
  { text: "\n" },
  { field: "ipa", styles: ["i", "f_13"] },
  { text: "\n\n------------\n" },
  { text: "Nghĩa: " },
  { field: "meaning", styles: ["b"] },
  { text: "\n" },
  { text: "Ví dụ: " },
  { field: "example", styles: [] },
];

export const TEMPLATE_2_ACADEMIC: FormatStep[] = [
  { text: "📚 Học từ mỗi ngày\n\n", styles: ["b", "c_15a85f"] },
  { text: "🇬🇧 " },
  { field: "word", styles: ["b", "f_18", "c_0a52a6"] },
  { text: "\n" },
  { text: "🇻🇳 " },
  { field: "meaning", styles: ["i", "c_f27806"] },
  { text: "\n\n" },
  { text: "📝 Example:\n", styles: ["b"] },
  { field: "example", styles: [] },
  { text: "\n\n" },
  { text: "💡 Giải thích:\n", styles: ["b"] },
  { field: "explanation_list", styles: [] }, // Zalo list style (lst_1) hơi kén, để text thường cho an toàn
];

export const TEMPLATE_3_FLASHCARD: FormatStep[] = [
  { text: "🔥 TỪ VỰNG CẦN NHỚ 🔥\n\n", styles: ["b", "c_db342e", "f_13"] },
  { field: "word", styles: ["b", "f_18"] }, // Uppercase xử lý ở data đầu vào nếu cần
  { text: "\n(" },
  { field: "meaning", styles: ["i"] },
  { text: ")\n\n" },
  { text: "🔊 IPA: " },
  { field: "ipa", styles: ["f_13"] },
  { text: "\n\n👉 Câu ví dụ:\n", styles: ["b"] },
  { field: "example", styles: [] },
];

// --- CÁC TEMPLATE MỚI (GĐ 2) ---

export const TEMPLATE_4_CONVERSATIONAL: FormatStep[] = [
  { text: "👋 ", styles: [] },
  { text: "Chào bạn! Từ mới hôm nay là:\n\n", styles: ["b"] },
  { text: "✨ " },
  { field: "word", styles: ["b", "f_18", "c_0a52a6"] }, // Xanh dương đậm
  { text: " ✨\n" },
  { field: "ipa", styles: ["i", "f_13"] },
  { text: "\n\n🤔 " },
  { text: "Nghĩa là gì nhỉ?\n", styles: ["b"] },
  { text: "➥ " },
  { field: "meaning", styles: ["i"] },
  { text: "\n\n🗣️ " },
  { text: "Thử nói câu này xem:\n", styles: ["b"] },
  { text: '"', styles: [] },
  { field: "example", styles: [] },
  { text: '"', styles: [] },
];

export const TEMPLATE_5_MODERN_UI: FormatStep[] = [
  { text: "➖➖➖➖➖➖➖➖\n", styles: [] }, // Tạm bỏ c_gray vì sợ không hỗ trợ
  { text: "💎 " },
  { text: "WORD OF THE DAY\n", styles: ["b", "f_13"] },
  { text: "➖➖➖➖➖➖➖➖\n\n", styles: [] },
  { text: "🎯 " },
  { field: "word", styles: ["b", "f_18", "c_15a85f"] }, // Xanh lá
  { text: "\n" },
  { text: "🔉 " },
  { field: "ipa", styles: ["i"] },
  { text: "\n\n💡 " },
  { text: "Ý nghĩa:\n", styles: ["b"] },
  { field: "meaning", styles: [] },
  { text: "\n\n📢 " },
  { text: "Ví dụ mẫu:\n", styles: ["b"] },
  { field: "example", styles: [] },
  { text: "\n➖➖➖➖➖➖➖➖" },
];

export const TEMPLATE_6_DICTIONARY: FormatStep[] = [
  { text: "📖 " },
  { text: "TỪ ĐIỂN ANH - VIỆT\n", styles: ["b", "c_db342e"] }, // Đỏ
  { text: "────────────────\n", styles: [] },
  { text: "🔵 " },
  { field: "word", styles: ["b", "f_18"] },
  { text: "  (noun)\n\n", styles: ["i", "f_13"] }, // Giả định type
  { text: "🔹 " },
  { text: "Phát âm: ", styles: ["b"] },
  { field: "ipa", styles: [] },
  { text: "\n" },
  { text: "🔹 " },
  { text: "Định nghĩa: ", styles: ["b"] },
  { field: "meaning", styles: [] },
  { text: "\n\n🔰 " },
  { text: "Ví dụ minh họa:\n", styles: ["b"] },
  { field: "example", styles: ["i"] }, // Ví dụ in nghiêng cho đẹp
  { text: "\n\n🧩 " },
  { text: "Giải thích thêm:\n", styles: ["b"] },
  { field: "explanation_list", styles: [] },
];
