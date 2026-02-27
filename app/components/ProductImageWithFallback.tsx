"use client";

import { useEffect, useMemo, useState } from "react";

interface ProductImageWithFallbackProps {
  src: string;
  fallbackSrc: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
}

const PARTSON_LOGO_PATH = "/Car-parts.png";

const normalizeSrcPath = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed, "http://localhost").pathname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

export default function ProductImageWithFallback({
  src,
  fallbackSrc,
  alt,
  width,
  height,
  className,
  loading = "eager",
  decoding = "async",
}: ProductImageWithFallbackProps) {
  const noPhotoLabel =
    "\u0424\u043e\u0442\u043e \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u0432\u0456\u0434\u0441\u0443\u0442\u043d\u0454";

  const [isChecking, setIsChecking] = useState(true);
  const [imageSrc, setImageSrc] = useState("");
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const normalizedFallbackPath = useMemo(() => normalizeSrcPath(fallbackSrc), [fallbackSrc]);

  useEffect(() => {
    const candidate = (src || "").trim();
    if (!candidate) {
      queueMicrotask(() => {
        setImageSrc("");
        setShowPlaceholder(true);
        setIsChecking(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setIsChecking(true);
    });

    const probe = new window.Image();
    probe.decoding = decoding;
    probe.onload = () => {
      if (cancelled) return;
      const loadedPath = normalizeSrcPath(probe.currentSrc || probe.src || candidate);

      if (normalizedFallbackPath && loadedPath === normalizedFallbackPath) {
        setImageSrc("");
        setShowPlaceholder(true);
      } else {
        setImageSrc(candidate);
        setShowPlaceholder(false);
      }

      setIsChecking(false);
    };
    probe.onerror = () => {
      if (cancelled) return;
      setImageSrc("");
      setShowPlaceholder(true);
      setIsChecking(false);
    };
    probe.src = candidate;

    return () => {
      cancelled = true;
    };
  }, [src, normalizedFallbackPath, decoding]);

  if (isChecking) {
    return (
      <div
        className={`${className ?? ""} animate-pulse rounded-xl border border-slate-200 bg-slate-100`}
        aria-hidden
      />
    );
  }

  if (showPlaceholder) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${className ?? ""} flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50`}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <img
            src={PARTSON_LOGO_PATH}
            alt="Логотип PartsON"
            width={220}
            height={110}
            loading="lazy"
            decoding="async"
            className="h-auto w-[170px] max-w-full object-contain sm:w-[220px]"
          />
          <span className="px-3 text-xs font-medium text-slate-600">{noPhotoLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageSrc || undefined}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      onError={() => {
        setImageSrc("");
        setShowPlaceholder(true);
      }}
      className={className}
    />
  );
}
