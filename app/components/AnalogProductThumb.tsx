"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

type AnalogProductThumbProps = {
  src?: string;
  alt: string;
  disableDirectFetch?: boolean;
  pending?: boolean;
};

const IMAGE_FALLBACK_PATH = "/car-parts-fullwidth.png";

const withStrictMode = (src: string) => {
  if (!src) return src;
  return src.includes("?") ? `${src}&strict=1` : `${src}?strict=1`;
};

export default function AnalogProductThumb({
  src = "",
  alt,
  disableDirectFetch = false,
  pending = false,
}: AnalogProductThumbProps) {
  const [hasError, setHasError] = useState(false);
  const [useRelaxedSrc, setUseRelaxedSrc] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const strictSrc = useMemo(() => {
    if (disableDirectFetch) return src;
    return withStrictMode(src);
  }, [disableDirectFetch, src]);
  const activeSrc = disableDirectFetch ? src : useRelaxedSrc ? src : strictSrc;

  useEffect(() => {
    setHasError(false);
    setUseRelaxedSrc(false);
    setIsLoaded(false);
  }, [disableDirectFetch, src]);

  if (pending) {
    return <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200" />;
  }

  if (!activeSrc) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef3f7_60%,#e2e8f0_100%)] px-2 text-center">
        <div className="absolute inset-x-2 top-2 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
        <ImageOff
          className="relative h-5 w-5 text-slate-400/90 sm:h-6 sm:w-6"
          strokeWidth={1.7}
          aria-hidden="true"
        />
        <span className="relative mt-1.5 text-[8.5px] font-bold uppercase tracking-[0.16em] leading-tight text-slate-500">
          Зображення відсутнє
        </span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef3f7_60%,#e2e8f0_100%)] px-2 text-center">
        <div className="absolute inset-x-2 top-2 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
        <ImageOff
          className="relative h-5 w-5 text-slate-400/90 sm:h-6 sm:w-6"
          strokeWidth={1.7}
          aria-hidden="true"
        />
        <span className="relative mt-1.5 text-[8.5px] font-bold uppercase tracking-[0.16em] leading-tight text-slate-500">
          Зображення відсутнє
        </span>
      </div>
    );
  }

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200" />
      )}
      <Image
        src={activeSrc}
        alt={alt}
        fill
        sizes="64px"
        fetchPriority="high"
        decoding="sync"
        className={`object-cover transition-opacity duration-150 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={(event) => {
          const currentTarget = event.currentTarget as HTMLImageElement;
          const currentPath = (() => {
            try {
              return new URL(currentTarget.currentSrc || currentTarget.src, window.location.href)
                .pathname
                .toLowerCase();
            } catch {
              return "";
            }
          })();

          if (currentPath !== IMAGE_FALLBACK_PATH) {
            setIsLoaded(true);
            return;
          }

          if (!disableDirectFetch && !useRelaxedSrc && src) {
            setUseRelaxedSrc(true);
            setIsLoaded(false);
            return;
          }

          setHasError(true);
        }}
        onError={() => {
          if (!disableDirectFetch && !useRelaxedSrc && src) {
            setUseRelaxedSrc(true);
            setIsLoaded(false);
            return;
          }
          setHasError(true);
        }}
      />
    </>
  );
}
