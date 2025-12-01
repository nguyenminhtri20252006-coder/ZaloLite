/**
 * app/components/ui/TokenModal.tsx
 *
 * Component Modal hiển thị Session Token.
 */

export function TokenModal({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-lg rounded-lg bg-gray-800 p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
          aria-label="Đóng modal"
        >
          &times;
        </button>
        <h3 className="mb-4 text-xl font-semibold text-white">
          Session Token (JSON)
        </h3>
        <p className="mb-3 text-sm text-gray-400">
          Đây là &quot;Token&quot; (Credentials) của bạn. Hãy sao chép và lưu
          trữ nó ở một nơi an toàn (như trình quản lý mật khẩu). Đừng chia sẻ nó
          với bất kỳ ai.
        </p>
        <textarea
          readOnly
          value={token}
          className="h-40 w-full rounded-lg border border-gray-600 bg-gray-900 p-3 font-mono text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onFocus={(e) => e.target.select()}
        />
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-gray-600 py-2 px-4 font-bold text-white transition duration-200 hover:bg-gray-700"
        >
          Đã hiểu và Đóng
        </button>
      </div>
    </div>
  );
}
