/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";

export function useMediaUploader(botId: string, threadId: string) {
  const [isUploading, setIsUploading] = useState(false);

  const sendMedia = async (file: File) => {
    setIsUploading(true);
    try {
      // 1. Extract Meta
      const metadata = await extractMetadata(file);

      let type = "file";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";

      console.log(`[Client] Sending ${type}...`, metadata);

      // 2. FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("botId", botId);
      formData.append("threadId", threadId);
      formData.append("metadata", JSON.stringify(metadata));

      // 3. Call API
      const res = await fetch("/api/bot/send-media", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");

      console.log("Success:", json.data);
      return true;
    } catch (e: any) {
      console.error(e);
      alert("Lỗi gửi file: " + e.message);
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const extractMetadata = (file: File): Promise<any> => {
    return new Promise((resolve) => {
      const meta: any = { fileName: file.name, fileSize: file.size };
      const url = URL.createObjectURL(file);

      if (file.type.startsWith("image/")) {
        const img = new Image();
        img.onload = () => {
          meta.width = img.naturalWidth;
          meta.height = img.naturalHeight;
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        img.src = url;
      } else if (file.type.startsWith("video/")) {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          meta.width = v.videoWidth;
          meta.height = v.videoHeight;
          meta.duration = v.duration;
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        v.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        v.src = url;
      } else if (file.type.startsWith("audio/")) {
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => {
          meta.duration = a.duration;
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        a.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        a.src = url;
      } else resolve(meta);
    });
  };

  return { sendMedia, isUploading };
}
