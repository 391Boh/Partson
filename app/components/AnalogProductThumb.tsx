"use client";

import { useEffect, useMemo, useState } from "react";

import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";

type AnalogProductThumbProps = {
  src?: string;
  alt: string;
  disableDirectFetch?: boolean;
  pending?: boolean;
};

const IMAGE_FALLBACK_PATH = PRODUCT_IMAGE_FALLBACK_PATH.toLowerCase();

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

  const placeholder = (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50 p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PRODUCT_IMAGE_FALLBACK_PATH}
        alt=""
        loading="lazy"
        decoding="async"
        width={96}
        height={96}
        className="h-full w-full object-contain opacity-80"
        aria-hidden="true"
      />
    </div>
  );

  if (pending || !activeSrc || hasError) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-slate-50">
        {placeholder}
      </div>
    );
  }

  return (
    <>
      {!isLoaded ? placeholder : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={activeSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={96}
        height={96}
        className={`h-full w-full object-contain transition-opacity duration-150 ${
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
