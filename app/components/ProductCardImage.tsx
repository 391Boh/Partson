"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";

const FALLBACK = "__NO_IMAGE__";
const IMAGE_CACHE_PREFIX = "partson:v2:img:";
const IMAGE_FALLBACK_PATH = "/car-parts-fullwidth.png";
const IMAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const IMAGE_MISS_CACHE_TTL_MS = 1000 * 60 * 3;

interface Props {
  productCode: string;
  articleHint?: string;
  className?: string;
  onClick?: () => void;
}

const buildImagePath = (
  productCode: string,
  articleHint?: string,
  options?: { strict?: boolean }
) => {
  const normalizedCode = (productCode || "").trim();
  const params = new URLSearchParams();
  const normalizedArticle = (articleHint || "").trim();
  if (options?.strict === true) {
    params.set("strict", "1");
  }

  if (
    normalizedArticle &&
    normalizedArticle.toLowerCase() !== normalizedCode.toLowerCase()
  ) {
    params.set("article", normalizedArticle);
  }

  const serialized = params.toString();
  return serialized
    ? `/product-image/${encodeURIComponent(normalizedCode)}?${serialized}`
    : `/product-image/${encodeURIComponent(normalizedCode)}`;
};

const normalizePath = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed, "http://localhost").pathname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

const IMAGE_FALLBACK_PATHNAME = normalizePath(IMAGE_FALLBACK_PATH);

type ImageCacheRecord = {
  src: string;
  t: number;
  miss?: boolean;
};

const ProductCardImage: React.FC<Props> = ({
  productCode,
  articleHint,
  className = "",
  onClick,
}) => {
  const strictImagePath = useMemo(
    () => buildImagePath(productCode, articleHint, { strict: true }),
    [articleHint, productCode]
  );
  const cacheKey = useMemo(() => {
    const normalizedCode = (productCode || "").trim();
    const normalizedArticle = (articleHint || "").trim();
    return `${IMAGE_CACHE_PREFIX}${normalizedCode}:${normalizedArticle || "-"}`;
  }, [articleHint, productCode]);

  const cacheValue = useCallback((value: string, options?: { miss?: boolean }) => {
    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          src: value,
          miss: options?.miss === true,
          t: Date.now(),
        } satisfies ImageCacheRecord)
      );
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [cacheKey]);

  const [resolvedSrc, setResolvedSrc] = useState<string>(FALLBACK);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const normalizedCode = (productCode || "").trim();
    if (!normalizedCode) {
      setResolvedSrc(FALLBACK);
      setLoading(false);
      return;
    }

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ImageCacheRecord;
        const ttlMs = parsed?.miss ? IMAGE_MISS_CACHE_TTL_MS : IMAGE_CACHE_TTL_MS;
        const isFresh =
          parsed &&
          typeof parsed.t === "number" &&
          Date.now() - parsed.t <= ttlMs;

        if (isFresh && typeof parsed.src === "string" && parsed.src.trim()) {
          if (parsed.miss) {
            setResolvedSrc(FALLBACK);
            setLoading(false);
            return;
          }

          setResolvedSrc(parsed.src);
          setLoading(false);
          return;
        }

        sessionStorage.removeItem(cacheKey);
      }
    } catch {
      // Ignore sessionStorage errors.
    }

    setLoading(true);
    setResolvedSrc(FALLBACK);

    let cancelled = false;

    const resolveCandidate = (candidate: string) =>
      new Promise<boolean>((resolve) => {
        const image = new window.Image();
        image.decoding = "async";
        image.loading = "eager";
        image.onload = () => {
          const loadedPath = normalizePath(image.currentSrc || image.src || candidate);
          if (loadedPath === IMAGE_FALLBACK_PATHNAME) {
            resolve(false);
            return;
          }

          if (!cancelled) {
            setResolvedSrc(candidate);
            setLoading(false);
          }
          cacheValue(candidate);
          resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = candidate;
      });

    const loadImage = async () => {
      const strictResolved = await resolveCandidate(strictImagePath);
      if (cancelled) return;
      if (strictResolved) return;

      cacheValue(FALLBACK, { miss: true });
      setResolvedSrc(FALLBACK);
      setLoading(false);
    };

    void loadImage();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, cacheValue, productCode, strictImagePath]);

  const noImage = resolvedSrc === FALLBACK;
  const hasImage = Boolean(resolvedSrc) && !noImage;
  const canOpen = Boolean(onClick) && hasImage && !loading;
  const showLoadingSkeleton = loading && !hasImage;

  return (
    <div
      onClick={(event) => {
        if (!canOpen || !onClick) return;
        event.stopPropagation();
        onClick();
      }}
      title={
        canOpen
          ? "Відкрити фото товару"
          : loading
          ? "Підтягуємо фото товару..."
          : "Зображення відсутнє"
      }
      className={`
        relative h-full w-full overflow-hidden rounded-md
        bg-gray-200 flex items-center justify-center
        ${canOpen ? "cursor-pointer" : "cursor-default"}
        ${className}
      `}
    >
      {noImage && (
        <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#edf3f8_58%,#e2e8f0_100%)]">
          <div className="absolute inset-x-5 top-4 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
          <div className="relative flex h-full select-none flex-col items-center justify-center px-3 text-center">
            <ImageOff
              size={30}
              strokeWidth={1.7}
              className="mb-2.5 text-slate-400/90"
              aria-hidden="true"
            />
            <span className="max-w-[110px] text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Зображення відсутнє
            </span>
          </div>
        </div>
      )}

      {showLoadingSkeleton && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-300 via-gray-200 to-gray-300" />
      )}

      {hasImage && (
        <Image
          src={resolvedSrc ?? undefined}
          alt="product"
          fill
          sizes="(max-width: 640px) 42vw, 220px"
          loading="lazy"
          unoptimized
          className="object-contain transition-opacity duration-200 opacity-100"
        />
      )}
    </div>
  );
};

export default ProductCardImage;
