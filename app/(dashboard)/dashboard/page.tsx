/**
 * app/(dashboard)/dashboard/page.tsx
 * Trang chủ Dashboard: Hiển thị tổng quan và tiến độ học tập.
 * Đường dẫn truy cập: /dashboard
 */
import { IconBookOpen, IconCheck, IconClock } from "@/app/components/ui/Icons";

export default function DashboardHomePage() {
  // Mockup dữ liệu tiến độ (Sau này sẽ fetch từ DB)
  const stats = [
    {
      label: "Từ vựng đã học",
      value: "120",
      icon: IconCheck,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Đang ôn tập",
      value: "15",
      icon: IconClock,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
    {
      label: "Bài học mới",
      value: "3",
      icon: IconBookOpen,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Tổng quan</h1>
        <p className="text-gray-400 text-sm">
          Chào mừng quay trở lại, chúc bạn một ngày học tập hiệu quả!
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-4 shadow-lg"
          >
            <div className={`p-3 rounded-lg ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-medium uppercase">
                {stat.label}
              </p>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder cho Biểu đồ hoặc Nội dung khác */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 min-h-[300px] flex flex-col justify-center items-center text-gray-500">
          <span className="text-4xl mb-2">📈</span>
          <p>Biểu đồ tiến độ học tập sẽ hiển thị ở đây</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 min-h-[300px]">
          <h3 className="font-bold text-white mb-4">Hoạt động gần đây</h3>
          <ul className="space-y-3">
            {[1, 2, 3].map((i) => (
              <li
                key={i}
                className="flex items-center gap-3 text-sm p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-gray-300">
                  Bạn vừa ôn tập bộ từ vựng{" "}
                  <span className="text-white font-medium">Topic #{i}</span>
                </span>
                <span className="ml-auto text-gray-500 text-xs">
                  2 giờ trước
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
