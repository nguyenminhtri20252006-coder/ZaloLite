import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zalo-tool CRM",
  description: "Hệ thống quản lý Zalo chuyên nghiệp",
  // [CẬP NHẬT] Cấu hình Favicon
  icons: {
    // Thêm ?v=1 để trình duyệt nhận diện là file mới, tránh cache cũ
    icon: "/logo.png?v=1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
