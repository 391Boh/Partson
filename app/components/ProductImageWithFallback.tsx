"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImageOff, Maximize2 } from "lucide-react";

import ImageModal from "app/components/ImageModal";
import { buildProductImageBatchKey, buildProductImagePath } from "app/lib/product-image-path";
import {
  clearProductImageMissing,
  clearProductImageSuccess,
  readProductImageMissing,
  readProductImageSuccess,
  writeProductImageMissing,
  writeProductImageSuccess,
} from "app/lib/product-image-client";

interface ProductImageWithFallbackProps {
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
  fetchPriority?: "high" | "low" | "auto";
  zoomEnabled?: boolean;
  productCode?: string;
  articleHint?: string;
  hasKnownPhoto?: boolean;
  preferCachedPreview?: boolean;
  variant?: "full" | "catalog";
  unoptimized?: boolean;
}

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNmMWY1ZjkiLz48L3N2Zz4=";

const FINAL_RETRY_DELAY_MS = 180;
const PRODUCT_IMAGE_BUST_PREFIX = "partson:product-image-bust:";

type ImageStatus = "loading" | "loaded" | "missing";

const isCatalogImageSrc = (src: string) => {
  try {
    const parsed = new URL(src, "http://localhost");
    return parsed.searchParams.get("catalog") === "1";
  } catch {
    return src.includes("catalog=1");
  }
};

export default function ProductImageWithFallback({
  alt,
  width,
  height,
  className,
  loading = "eager",
  decoding = "async",
  fetchPriority = "auto",
  zoomEnabled = true,
  productCode,
  articleHint,
  hasKnownPhoto = true,
  preferCachedPreview = true,
  variant = "full",
  unoptimized: unoptimizedProp = false,
}: ProductImageWithFallbackProps) {
  const openPhotoTitle = "Відкрити зображення";
  const photoLabel = "Фото";

  const normalizedProductCode = (productCode || "").trim();
  const normalizedArticleHint = (articleHint || "").trim();
  const imageBatchKey = useMemo(
    () => buildProductImageBatchKey(normalizedProductCode, normalizedArticleHint || undefined),
    [normalizedProductCode, normalizedArticleHint]
  );
  const [cacheBustToken, setCacheBustToken] = useState("");

  useEffect(() => {
    if (!imageBatchKey || typeof window === "undefined") {
      setCacheBustToken("");
      return;
    }

    try {
      setCacheBustToken(window.localStorage.getItem(`${PRODUCT_IMAGE_BUST_PREFIX}${imageBatchKey}`) || "");
    } catch {
      setCacheBustToken("");
    }
  }, [imageBatchKey]);

  const primarySrc = useMemo(
    () =>
      hasKnownPhoto && normalizedProductCode
        ? buildProductImagePath(normalizedProductCode, normalizedArticleHint || undefined, {
            catalog: variant === "catalog",
            cacheBust: cacheBustToken || undefined,
          })
        : "",
    [cacheBustToken, hasKnownPhoto, normalizedProductCode, normalizedArticleHint, variant]
  );
  const recoverySrc = useMemo(
    () =>
      hasKnownPhoto && normalizedProductCode
        ? buildProductImagePath(normalizedProductCode, normalizedArticleHint || undefined, {
            catalog: variant === "catalog",
            retryToken: 1,
            cacheBust: cacheBustToken || undefined,
          })
        : "",
    [cacheBustToken, hasKnownPhoto, normalizedProductCode, normalizedArticleHint, variant]
  );
  const finalRetrySrc = useMemo(
    () =>
      hasKnownPhoto && normalizedProductCode
        ? buildProductImagePath(normalizedProductCode, normalizedArticleHint || undefined, {
            catalog: variant === "catalog",
            retryToken: 2,
            cacheBust: cacheBustToken || undefined,
          })
        : "",
    [cacheBustToken, hasKnownPhoto, normalizedProductCode, normalizedArticleHint, variant]
  );

  const [requestSrc, setRequestSrc] = useState(primarySrc || "");
  const [status, setStatus] = useState<ImageStatus>(hasKnownPhoto ? "loading" : "missing");
  const [finalRetryQueued, setFinalRetryQueued] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const requestSrcRef = useRef("");
  const statusRef = useRef<ImageStatus>(hasKnownPhoto ? "loading" : "missing");

  useEffect(() => {
    requestSrcRef.current = requestSrc;
  }, [requestSrc]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Initialize / reset when product identity changes
  useEffect(() => {
    setLightboxOpen(false);
    setFinalRetryQueued(false);

    if (!hasKnownPhoto) {
      if (normalizedProductCode) {
        writeProductImageMissing(normalizedProductCode, normalizedArticleHint || undefined);
      }
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    if (preferCachedPreview && normalizedProductCode && !cacheBustToken) {
      const isKnownMissing = readProductImageMissing(
        normalizedProductCode,
        normalizedArticleHint || undefined
      );
      if (isKnownMissing) {
        setRequestSrc("");
        setStatus("missing");
        return;
      }

      const cached = readProductImageSuccess(
        normalizedProductCode,
        normalizedArticleHint || undefined
      );
      if (cached && !(variant === "full" && isCatalogImageSrc(cached))) {
        const isAlreadyShowingSameSrc =
          statusRef.current === "loaded" && requestSrcRef.current === cached;
        setRequestSrc(cached);
        if (!isAlreadyShowingSameSrc) setStatus("loading");
        return;
      }
    }

    if (!primarySrc) {
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    setRequestSrc(primarySrc);
    setStatus("loading");
  }, [
    hasKnownPhoto,
    cacheBustToken,
    normalizedArticleHint,
    normalizedProductCode,
    preferCachedPreview,
    primarySrc,
    variant,
  ]);

  // Delayed final retry — mirrors ProductCardImage behaviour
  useEffect(() => {
    if (!hasKnownPhoto) return;
    if (status !== "missing") return;
    if (!finalRetrySrc) return;
    if (finalRetryQueued) return;

    const timeoutId = window.setTimeout(() => {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("loading");
    }, FINAL_RETRY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [finalRetryQueued, finalRetrySrc, hasKnownPhoto, status]);

  const handleLoad = useCallback(() => {
      if (!requestSrc) return;
      writeProductImageSuccess(
        normalizedProductCode,
        normalizedArticleHint || undefined,
        requestSrc
      );
      clearProductImageMissing(normalizedProductCode, normalizedArticleHint || undefined);
      setStatus("loaded");
    },
    [normalizedArticleHint, normalizedProductCode, requestSrc]
  );

  const handleError = useCallback(() => {
    clearProductImageSuccess(normalizedProductCode, normalizedArticleHint || undefined);

    if (!hasKnownPhoto) {
      writeProductImageMissing(normalizedProductCode, normalizedArticleHint || undefined);
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    if (finalRetryQueued) {
      setStatus("missing");
      return;
    }

    if (requestSrc && requestSrc !== recoverySrc && recoverySrc) {
      setRequestSrc(recoverySrc);
      setStatus("loading");
      return;
    }

    if (requestSrc && requestSrc !== finalRetrySrc && finalRetrySrc) {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("loading");
      return;
    }

    setStatus("missing");
  }, [
    finalRetryQueued,
    finalRetrySrc,
    hasKnownPhoto,
    normalizedArticleHint,
    normalizedProductCode,
    recoverySrc,
    requestSrc,
  ]);

  const isLoaded = status === "loaded";
  const showPlaceholder = !hasKnownPhoto || status === "missing";
  const showSkeleton = !showPlaceholder && !isLoaded;
  const canOpen = zoomEnabled && isLoaded;
  const preferImmediateDecode = loading === "eager" && fetchPriority === "high";

  const openLightbox = useCallback(() => {
    if (!canOpen) return;
    setLightboxOpen(true);
  }, [canOpen]);

  const renderPlaceholder = () => (
    <div className="relative flex items-center justify-center text-center px-5">
      <div className="absolute inset-x-3 top-1/2 hidden h-px -translate-y-5 bg-gradient-to-r from-transparent via-slate-300/75 to-transparent sm:block" />
      <ImageOff
        size={34}
        strokeWidth={1.7}
        className="relative text-slate-400/90"
        aria-hidden="true"
      />
    </div>
  );

  if (showPlaceholder) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${className ?? ""} flex items-center justify-center rounded-xl border border-slate-200 bg-[image:linear-gradient(160deg,#f8fafc,#f1f5f9)]`}
      >
        {renderPlaceholder()}
      </div>
    );
  }

  return (
    <>
      <div
        onClick={openLightbox}
        className={`${className ?? ""} group relative overflow-hidden rounded-xl bg-[image:linear-gradient(160deg,#f8fafc,#f1f5f9)] ${
          canOpen ? "cursor-zoom-in" : ""
        }`}
      >
        {showSkeleton ? (
          <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 transition-opacity duration-200" />
        ) : null}

        {requestSrc ? (
          <Image
            key={requestSrc}
            src={requestSrc}
            alt={alt}
            priority={preferImmediateDecode}
            loading={loading}
            decoding={preferImmediateDecode ? "sync" : decoding}
            fetchPriority={fetchPriority}
            onLoad={handleLoad}
            onError={handleError}
            width={width}
            height={height}
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 46vw, 520px"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            unoptimized={
              unoptimizedProp ||
              requestSrc.startsWith("data:image/") ||
              requestSrc.startsWith("/product-image/")
            }
            className={`h-full w-full object-contain transition-[opacity,transform] ${
              preferImmediateDecode ? "duration-100" : "duration-180"
            } ${isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-[1.01]"}`}
          />
        ) : null}

        {canOpen ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openLightbox();
            }}
            aria-label={`${openPhotoTitle}: ${alt}`}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
            title={openPhotoTitle}
          >
            <Maximize2 size={13} aria-hidden="true" />
            {photoLabel}
          </button>
        ) : null}
      </div>

      {lightboxOpen && canOpen ? (
        <ImageModal src={requestSrc} onClose={() => setLightboxOpen(false)} />
      ) : null}
    </>
  );
}
