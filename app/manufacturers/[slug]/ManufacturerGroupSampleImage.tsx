"use client";

import { useState } from "react";
import Image from "next/image";

type ManufacturerGroupSampleImageProps = {
  src: string;
  alt: string;
  className?: string;
  size?: number;
};

export default function ManufacturerGroupSampleImage({
  src,
  alt,
  className = "h-11 w-11 object-contain transition duration-150 group-hover/sample:scale-[1.03]",
  size = 56,
}: ManufacturerGroupSampleImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) return null;

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      // /product-image already serves a resized webp thumbnail. Re-encoding it
      // through /_next/image exposed the same photo to Google under a second
      // URL (as a JPEG download), splitting its image-search signals.
      unoptimized={src.startsWith("/product-image/")}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
