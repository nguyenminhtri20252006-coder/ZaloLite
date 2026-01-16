/**
 * app/components/ui/JsonViewerModal.tsx
 * Modal hiển thị JSON format đẹp (Read-only)
 */
"use client";

import { IconClose } from "@/components/ui/Icons";

interface JsonViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function JsonViewerModal({
  isOpen,
  onClose,
  title,
  data,
}: JsonViewerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-scale-up">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <IconClose className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-950">
          <pre className="text-xs sm:text-sm font-mono text-green-400 whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900 rounded-b-xl flex justify-end gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(data));
              alert("Đã copy vào clipboard!");
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium"
          >
            Copy JSON
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
