"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";

import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import {
  clearProductImageMissing,
  clearProductImageSuccess,
  readProductImageMissing,
  readProductImageSuccess,
  writeProductImageMissing,
  writeProductImageSuccess,
} from "app/lib/product-image-client";

type AnalogProductThumbProps = {
  src?: string;
  alt: string;
  disableDirectFetch?: boolean;
  pending?: boolean;
  retrySrc?: string;
  finalRetrySrc?: string;
  productCode?: string;
  articleHint?: string;
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
  retrySrc = "",
  finalRetrySrc = "",
  productCode = "",
  articleHint = "",
}: AnalogProductThumbProps) {
  const [hasError, setHasError] = useState(false);
  const [useRelaxedSrc, setUseRelaxedSrc] = useState(false);
  const [retryStep, setRetryStep] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cachedSrc, setCachedSrc] = useState("");
  const normalizedProductCode = (productCode || "").trim();
  const normalizedArticleHint = (articleHint || "").trim();
  const sourceSrc = cachedSrc || src;
  const strictSrc = useMemo(() => {
    if (disableDirectFetch) return sourceSrc;
    return withStrictMode(sourceSrc);
  }, [disableDirectFetch, sourceSrc]);
  const activeSrc =
    retryStep === 2 && finalRetrySrc
      ? finalRetrySrc
      : retryStep === 1 && retrySrc
        ? retrySrc
        : disableDirectFetch
          ? sourceSrc
          : useRelaxedSrc
            ? sourceSrc
            : strictSrc;

  useEffect(() => {
    const cachedImageSrc = normalizedProductCode
      ? readProductImageSuccess(normalizedProductCode, normalizedArticleHint || undefined)
      : null;
    const cachedMissing = normalizedProductCode
      ? readProductImageMissing(normalizedProductCode, normalizedArticleHint || undefined)
      : false;

    setCachedSrc(cachedImageSrc || "");
    setHasError(false);
    setUseRelaxedSrc(false);
    setRetryStep(0);
    setIsLoaded(Boolean(cachedImageSrc));

    if (!cachedImageSrc && cachedMissing && !src) {
      setHasError(true);
    }
  }, [
    disableDirectFetch,
    finalRetrySrc,
    normalizedArticleHint,
    normalizedProductCode,
    retrySrc,
    src,
  ]);

  const tryNextSource = () => {
    if (retryStep === 0 && retrySrc && retrySrc !== activeSrc) {
      if (cachedSrc) setCachedSrc("");
      setRetryStep(1);
      setIsLoaded(false);
      return true;
    }

    if (retryStep <= 1 && finalRetrySrc && finalRetrySrc !== activeSrc) {
      if (cachedSrc) setCachedSrc("");
      setRetryStep(2);
      setIsLoaded(false);
      return true;
    }

    if (!disableDirectFetch && !useRelaxedSrc && sourceSrc && sourceSrc !== activeSrc) {
      if (cachedSrc) setCachedSrc("");
      setUseRelaxedSrc(true);
      setRetryStep(0);
      setIsLoaded(false);
      return true;
    }

    return false;
  };

  const markMissing = () => {
    if (normalizedProductCode) {
      writeProductImageMissing(normalizedProductCode, normalizedArticleHint || undefined);
    }
    setHasError(true);
  };

  const placeholder = (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#edf3f8_58%,#e2e8f0_100%)] px-2 text-center">
      <div className="absolute inset-x-2 top-2 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
      <ImageOff
        className="relative h-5 w-5 text-slate-400/90 sm:h-6 sm:w-6"
        strokeWidth={1.7}
        aria-hidden="true"
      />
      <span className="relative mt-1.5 text-[8.5px] font-bold uppercase leading-tight tracking-[0.16em] text-slate-500">
        Зображення відсутнє
      </span>
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
            const currentSrc = currentTarget.currentSrc || currentTarget.src || activeSrc;
            if (normalizedProductCode && currentSrc) {
              writeProductImageSuccess(
                normalizedProductCode,
                normalizedArticleHint || undefined,
                currentSrc
              );
              clearProductImageMissing(
                normalizedProductCode,
                normalizedArticleHint || undefined
              );
            }
            setIsLoaded(true);
            return;
          }

          if (tryNextSource()) return;

          markMissing();
        }}
        onError={() => {
          if (normalizedProductCode) {
            clearProductImageSuccess(normalizedProductCode, normalizedArticleHint || undefined);
          }
          if (tryNextSource()) return;
          markMissing();
        }}
      />
    </>
  );
}
