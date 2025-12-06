import { redirect } from "next/navigation";

/**
 * Trang gốc (Root):
 * Theo yêu cầu mới: Mặc định chuyển hướng về trang đăng nhập (/login).
 * Người dùng sẽ chỉ vào được Dashboard sau khi đăng nhập thành công.
 */
export default function RootPage() {
  redirect("/login");
}
