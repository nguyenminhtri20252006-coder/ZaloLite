"use client";

/**
 * app/components/ui/Avatar.tsx
 *
 * Component Avatar (hiển thị ảnh hoặc fallback)
 */
import { useState } from "react";
import { IconUser, IconUsers } from "./Icons";

export function Avatar({
  src,
  alt,
  isGroup = false,
}: {
  src: string;
  alt: string;
  isGroup?: boolean;
}) {
  const [error, setError] = useState(false);
  const Icon = isGroup ? IconUsers : IconUser;

  if (error || !src) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-600 object-cover">
        <Icon className="h-6 w-6 text-gray-400" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-10 w-10 rounded-full object-cover"
      onError={() => setError(true)}
    />
  );
}
