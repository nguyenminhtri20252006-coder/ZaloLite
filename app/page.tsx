import { redirect } from "next/navigation";

/**
 * Trang gốc (Root): Tự động chuyển hướng.
 * - Nếu chưa đăng nhập -> Middleware/Layout sẽ đá về /login.
 * - Nếu đã đăng nhập -> Vào thẳng dashboard.
 */
export default function RootPage() {
  redirect("/dashboard");
}
