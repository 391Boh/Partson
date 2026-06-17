"use client";

import { useState } from "react";
import Image from "next/image";

type ManufacturerGroupSampleImageProps = {
  src: string;
  alt: string;
};

export default function ManufacturerGroupSampleImage({
  src,
  alt,
}: ManufacturerGroupSampleImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) return null;

  return (
    <Image
      src={src}
      alt={alt}
      width={56}
      height={56}
      sizes="48px"
      onError={() => setFailed(true)}
      className="h-11 w-11 object-contain transition duration-150 group-hover/sample:scale-[1.03]"
    />
  );
}
