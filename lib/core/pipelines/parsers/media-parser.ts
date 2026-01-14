/* eslint-disable @typescript-eslint/no-explicit-any */

export class MediaParser {
  /**
   * Xử lý Ảnh, Video, Voice, File, Link, Doodle
   */

  public static parseImage(data: any) {
    const c = data.content || {};
    let params: any = {};
    try {
      params = c.params ? JSON.parse(c.params) : {};
    } catch {}

    // Doodle cũng là ảnh
    return {
      url: c.href || c.url || c.normalUrl, // Ưu tiên href (Full HD)
      thumb: c.thumb || c.thumbnail,
      caption: c.description || c.caption || "",
      width: Number(params.width || c.width || 0),
      height: Number(params.height || c.height || 0),
      // Doodle params
      isDoodle: data.msgType === "chat.doodle",
    };
  }

  public static parseVoice(data: any) {
    const c = data.content || {};
    let duration = 0;
    try {
      const p = c.params ? JSON.parse(c.params) : {};
      duration = Number(p.duration || 0);
    } catch {}

    return {
      url: c.href || c.url, // .aac link
      duration: duration, // milliseconds (Zalo thường trả về ms)
    };
  }

  public static parseVideo(data: any) {
    const c = data.content || {};
    let duration = 0;
    try {
      const p = c.params ? JSON.parse(c.params) : {};
      duration = Number(p.duration || 0);
    } catch {}

    return {
      url: c.href || c.url,
      thumb: c.thumb,
      duration: duration,
      caption: c.description || "",
    };
  }

  public static parseFile(data: any) {
    const c = data.content || {};
    let size = 0;
    let ext = "";
    let checksum = "";

    try {
      const p = c.params ? JSON.parse(c.params) : {};
      size = Number(p.fileSize || 0);
      ext = p.fileExt || "";
      checksum = p.checksum || "";
    } catch {}

    return {
      url: c.href || c.url, // Link tải file
      fileName: c.title || c.name || "File đính kèm",
      fileSize: size,
      fileType: ext,
      checksum: checksum,
    };
  }

  public static parseLink(data: any) {
    const c = data.content || {};
    return {
      url: c.href || c.url,
      title: c.title || "",
      thumb: c.thumb || "",
      description: c.description || c.desc || "",
    };
  }
}
