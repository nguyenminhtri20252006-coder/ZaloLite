"use client";

import { useState } from "react";
import { IconClose } from "@/app/components/ui/Icons";

export function JsonViewerModal({
  title,
  data,
  onClose,
}: {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  onClose: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-gray-900 border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white truncate pr-4">
            JSON Data: <span className="text-blue-400">{title}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <IconClose className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-0 bg-[#0d1117]">
          <pre className="p-4 text-xs sm:text-sm font-mono text-green-400 whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-all ${
              isCopied
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isCopied ? "Đã Copy!" : "Copy JSON"}
          </button>
        </div>
      </div>
    </div>
  );
}
