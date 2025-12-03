import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone", // [QUAN TRỌNG] Bật chế độ này để tối ưu cho Docker
  images: {
    // Cấu hình cho phép load ảnh từ Zalo CDN
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.zalo.me",
      },
      {
        protocol: "https",
        hostname: "**.zadn.vn",
      },
    ],
  },
};

export default nextConfig;
