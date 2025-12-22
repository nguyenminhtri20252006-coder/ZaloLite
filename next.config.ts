import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  experimental: {
    // serverActions nằm trong experimental trong các bản Next.js mới nhất (14+)
    // trước khi hoàn toàn stable ở top-level (dự kiến Next.js tương lai)
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
