/**
 * app/components/ui/Avatar.tsx
 * [MERGED]
 * - Preserves: size prop, isGroup logic, default gray style (legacy).
 * - Adds: name prop, colorful backgrounds (for ChatFrame), onError fallback state.
 */
import React, { useState } from "react";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string; // [ADDED] Cho phép truyền tên để sinh màu/initials
  isGroup?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "",
  name,
  isGroup = false,
  size = "md",
  className = "",
  ...props
}) => {
  const [imgError, setImgError] = useState(false);

  // 1. Logic Dimensions (Legacy)
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-base",
    xl: "w-24 h-24 text-xl",
  };
  const dimensions = sizeClasses[size];

  // 2. Logic Initials & Color (Updated)
  // Ưu tiên dùng 'name' để lấy ký tự đầu và màu sắc (cho ChatFrame đẹp hơn)
  // Nếu không có 'name', fallback về 'alt' và màu xám (cho các phần cũ)
  const effectiveName = name || alt || "?";
  const initial = effectiveName.charAt(0).toUpperCase();

  const getBgColor = (str: string) => {
    // Nếu chỉ có alt mà không có name, dùng style cũ (xám) để an toàn
    if (!name) return "bg-gray-200 text-gray-500";

    const bgColors = [
      "bg-red-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
    ];
    const index = str.charCodeAt(0) % bgColors.length;
    return `${bgColors[index]} text-white`;
  };

  const colorClass = getBgColor(effectiveName);

  return (
    <div
      className={`relative rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-300 ${dimensions} ${colorClass} ${className}`}
      {...props}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt || name || "Avatar"}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="font-bold">{initial}</span>
      )}

      {/* Indicator nếu là nhóm */}
      {isGroup && (
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-blue-500 rounded-full border-2 border-white" />
      )}
    </div>
  );
};

export default Avatar;
