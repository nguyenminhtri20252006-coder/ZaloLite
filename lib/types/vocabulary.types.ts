/**
 * lib/types/vocabulary.types.ts
 * Định nghĩa các kiểu dữ liệu cho module Từ Vựng (Vocabulary).
 * Tách biệt khỏi Zalo Types để dễ quản lý.
 */

/**
 * Kiểu dữ liệu cho phần giải nghĩa (explanation) trong API từ vựng
 */
export interface VocabularyExplanation {
  term: string;
  type: string;
  meaning_vi: string;
}

/**
 * Kiểu dữ liệu cho một từ (word) trong API từ vựng
 */
export interface VocabularyWord {
  word: string;
  type: string; // [NEW] Từ loại (Noun, Verb...)
  ipa: string;
  meaning: string; // Nghĩa tiếng Việt
  usage?: string; // [NEW] Cách dùng (Optional)
  example: string;
  explanation: VocabularyExplanation[]; // List giải thích con

  // Media
  wordVoice?: string; // URL âm thanh
  wordImage?: string; // URL hình ảnh
  exampleVoice?: string; // URL âm thanh
}

/**
 * Kiểu dữ liệu cho toàn bộ phản hồi (response) từ API từ vựng
 */
export interface VocabularyApiResponse {
  id: number;
  count: number;
  words: VocabularyWord[];
}

// Định nghĩa cấu trúc Template (Dùng cho template-parser)
export interface TemplateStep {
  field?: keyof VocabularyWord | "explanation_list";
  text?: string;
  styles?: string[]; // Mã style (b, i, c_...)
}
