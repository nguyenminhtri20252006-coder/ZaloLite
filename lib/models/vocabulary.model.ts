/**
 * lib/models/vocabulary.model.ts
 *
 * (TỆP MỚI)
 * Tầng Model (Repository) cho bảng 'vocabulary_templates'.
 * Cung cấp các hàm CRUD để quản lý các template định dạng tin nhắn.
 */
import supabase from "@/lib/supabaseClient";

// --- Định nghĩa kiểu dữ liệu chi tiết ---

/**
 * Định nghĩa cấu trúc cho một bước trong template (thay thế cho 'any').
 * Ví dụ: { "field": "word", "styles": ["b", "f_18"] }
 * HOẶC: { "text": "\n", "styles": [] }
 */
export type TemplateStep = {
  field?: string; // Tên trường từ VocabularyWord (ví dụ: "word", "ipa")
  text?: string; // Văn bản tĩnh (ví dụ: "\n", " (")
  styles?: string[]; // Mảng các style (ví dụ: "b", "c_db342e")
};

/**
 * Định nghĩa cấu trúc cho media config (thay thế cho 'any').
 * Ví dụ: { "sendImage": true, "sendWordVoice": true }
 */
export type MediaConfig = {
  sendImage?: boolean;
  sendWordVoice?: boolean;
  sendExampleVoice?: boolean;
};

/**
 * Định nghĩa kiểu dữ liệu (match với SQL schema)
 * Sử dụng các kiểu cụ thể thay vì 'any'
 */
export type VocabularyTemplate = {
  id?: string; // UUID (tùy chọn khi tạo mới)
  name: string;
  // Supabase coi JSONB là 'Json', nhưng chúng ta có thể ép kiểu (cast)
  // từ các kiểu cụ thể của mình sang 'Json' khi cần.
  // Tuy nhiên, để Model Layer linh hoạt, chúng ta dùng kiểu cụ thể ở đây.
  template_structure: TemplateStep[];
  media_config?: MediaConfig;
};

/**
 * Lấy một template bằng Tên (ví dụ: "Default")
 * @param name Tên template
 */
export async function getTemplateByName(name: string) {
  const { data, error } = await supabase
    .from("vocabulary_templates")
    .select("*")
    .eq("name", name)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "No rows found"
    console.error("[Vocab Model] Lỗi getTemplateByName:", error);
    throw error;
  }
  // Trả về dữ liệu đã được ép kiểu (cast) an toàn
  return data as VocabularyTemplate | null;
}

/**
 * Tạo mới hoặc Cập nhật (Upsert) một template
 * @param template Dữ liệu template
 */
export async function upsertTemplate(template: VocabularyTemplate) {
  // Khi gửi lên Supabase, chúng ta cần đảm bảo kiểu dữ liệu
  // là 'Json' mà Supabase mong đợi.
  const upsertData = {
    ...template,
    updated_at: new Date().toISOString(),
    // SỬA LỖI: Xóa ép kiểu 'as Json'.
    // Kiểu 'TemplateStep[]' và 'MediaConfig' đã là 'Json' hợp lệ.
    template_structure: template.template_structure,
    media_config: template.media_config,
  };

  const { data, error } = await supabase
    .from("vocabulary_templates")
    .upsert(upsertData, { onConflict: "name" }) // Cập nhật nếu 'name' đã tồn tại
    .select()
    .single();

  if (error) {
    console.error("[Vocab Model] Lỗi upsertTemplate:", error);
    throw error;
  }
  // Trả về dữ liệu đã được ép kiểu (cast) an toàn
  return data as VocabularyTemplate;
}
