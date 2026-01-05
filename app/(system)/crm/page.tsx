import { IconDatabase } from "@/app/components/ui/Icons";

export default function CrmPage() {
  return (
    <div className="h-full w-full bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl p-8 text-center animate-fade-in">
        <div className="w-16 h-16 bg-blue-900/30 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <IconDatabase className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Dữ liệu Khách hàng (CRM)
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Module quản lý danh sách khách hàng và phân loại đang được hoàn thiện.
          Vui lòng quay lại sau.
        </p>
        <div className="inline-block px-4 py-2 bg-gray-900 rounded-lg border border-gray-600">
          <span className="text-xs font-mono text-yellow-500">
            Status: COMING_SOON
          </span>
        </div>
      </div>
    </div>
  );
}
