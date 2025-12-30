/**
 * app/components/ui/Avatar.tsx
 * [UPDATED] Added 'size' prop support.
 */
import React from "react";

interface AvatarProps {
  src?: string | null;
  alt: string;
  isGroup?: boolean;
  size?: "sm" | "md" | "lg" | "xl"; // Thêm prop size
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  isGroup = false,
  size = "md",
  className = "",
}) => {
  const fallbackInitial = alt ? alt.charAt(0).toUpperCase() : "?";

  // Map size to dimension classes
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-base",
    xl: "w-24 h-24 text-xl", // Dùng cho DetailsPanel
  };

  const dimensions = sizeClasses[size];

  return (
    <div
      className={`relative rounded-full overflow-hidden flex-shrink-0 bg-gray-200 flex items-center justify-center border border-gray-300 ${dimensions} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className="font-bold text-gray-500">{fallbackInitial}</span>
      )}
      {/* Indicator nếu là nhóm (Optional) */}
      {isGroup && (
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-blue-500 rounded-full border-2 border-white" />
      )}
    </div>
  );
};

export default Avatar;
