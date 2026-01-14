/* eslint-disable @typescript-eslint/no-explicit-any */

export class TextParser {
  /**
   * Xử lý tin nhắn văn bản (Webchat/Chat.text)
   * Input: content có thể là string hoặc object chứa title & params (styles)
   */
  public static parse(data: any) {
    const content = data.content;

    // Trường hợp 1: Text đơn giản (Webchat thường)
    if (typeof content === "string") {
      return {
        text: content,
        styles: null,
      };
    }

    // Trường hợp 2: Rich Text (Có định dạng màu, bold,...)
    // data.content = { title: "text", params: "json_styles" }
    const textBody = content?.title || content?.msg || "";
    let styles = null;

    try {
      if (content?.params) {
        // params thường là chuỗi JSON stringify, cần parse ra
        const parsedParams = JSON.parse(content.params);
        if (parsedParams.styles) {
          styles = parsedParams.styles;

          // [DEBUG SERVER] Log cấu trúc Style thô để kiểm tra mapping
          console.log("------------------------------------------------");
          console.log(
            `[TextParser] 🎨 Rich Text Detected for Msg: ${data.msgId}`,
          );
          console.log(
            `[TextParser] Content: "${textBody.substring(0, 50)}..."`,
          );
          console.log(
            `[TextParser] Raw Styles:`,
            JSON.stringify(styles, null, 2),
          );
          console.log("------------------------------------------------");
        }
      }
    } catch (e) {
      // Ignore JSON parse error for params nhưng log warning nhẹ
      console.warn(
        `[TextParser] Warning: Failed to parse params for msg ${data.msgId}`,
      );
    }

    return {
      text: textBody,
      styles: styles, // Array of offsets [{start, len, st}]
    };
  }
}
