
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";


import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import {
  readProductImageSuccess,
  readProductImageMissing,
  writeProductImageSuccess,
  writeProductImageMissing,
  clearProductImageSuccess,
  clearProductImageMissing
} from "app/lib/product-image-client";


// Delay before final image retry (ms)
const FINAL_RETRY_DELAY_MS = 400;
const DEFERRED_DIRECT_LOAD_DELAY_MS = 120;
const BATCH_DIRECT_FALLBACK_DELAY_MS = 900;

const normalizeSrcPath = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed, window.location.href).pathname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

interface Props {
  productCode: string;
  articleHint?: string;
  hasKnownPhoto?: boolean;
  prefetchedSrc?: string | null;
  alt?: string;
  // batch props removed
  className?: string;
  onClick?: () => void;
  loadingMode?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  deferDirectLoad?: boolean;
  disableDirectLoad?: boolean;
  batchImagePending?: boolean;
}

type ImageStatus = "loading" | "retrying" | "loaded" | "missing";

// batch logic removed


const ProductCardImage: React.FC<Props> = ({
  productCode,
  articleHint,
  hasKnownPhoto = true,
  prefetchedSrc,
  alt,
  className = "",
  onClick,
  loadingMode = "lazy",
  fetchPriority = "low",
  deferDirectLoad = false,
  disableDirectLoad = false,
  batchImagePending = false,
}) => {
  const [requestSrc, setRequestSrc] = useState("");
  const [status, setStatus] = useState<ImageStatus>(hasKnownPhoto ? "loading" : "missing");
  const normalizedCode = (productCode || "").trim();
  const normalizedArticle = (articleHint || "").trim();
  const normalizedPrefetchedSrc = (prefetchedSrc || "").trim();

  const primarySrc = useMemo(
    () => buildProductImagePath(normalizedCode, normalizedArticle, { catalog: true }),
    [normalizedArticle, normalizedCode]
  );
  const recoverySrc = useMemo(
    () => buildProductImagePath(normalizedCode, normalizedArticle, { catalog: true, retryToken: 1 }),
    [normalizedArticle, normalizedCode]
  );
  const finalRetrySrc = useMemo(
    () => buildProductImagePath(normalizedCode, normalizedArticle, { catalog: true, retryToken: 2 }),
    [normalizedArticle, normalizedCode]
  );
  const [finalRetryQueued, setFinalRetryQueued] = useState(false);
  const lastSuccessfulSrcRef = useRef("");
  const requestSrcRef = useRef("");
  const statusRef = useRef<ImageStatus>(hasKnownPhoto ? "loading" : "missing");
  const deferredDirectLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestSrcRef.current = requestSrc;
  }, [requestSrc]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const currentTarget = event.currentTarget;
    const nextSrc = currentTarget.currentSrc || currentTarget.src || requestSrc;
    const loadedPath = normalizeSrcPath(nextSrc);

    if (loadedPath && loadedPath === PRODUCT_IMAGE_FALLBACK_PATH.toLowerCase()) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    // Use requestSrc (not currentSrc) for the cache: the Next.js image optimizer
    // rewrites currentSrc to /_next/image?url=... which is not a stable cache key.
    if (requestSrc && !requestSrc.startsWith("data:image/")) {
      lastSuccessfulSrcRef.current = requestSrc;
      writeProductImageSuccess(normalizedCode, normalizedArticle || undefined, requestSrc);
      clearProductImageMissing(normalizedCode, normalizedArticle || undefined);
    }

    setFinalRetryQueued(true);
    setStatus("loaded");
  }, [normalizedArticle, normalizedCode, requestSrc]);

  useEffect(() => {
    if (deferredDirectLoadTimerRef.current) {
      clearTimeout(deferredDirectLoadTimerRef.current);
      deferredDirectLoadTimerRef.current = null;
    }

    if (!hasKnownPhoto) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }
    if (normalizedPrefetchedSrc) {
      const isAlreadyShowingSameSrc =
        statusRef.current === "loaded" &&
        requestSrcRef.current === normalizedPrefetchedSrc;

      lastSuccessfulSrcRef.current = normalizedPrefetchedSrc;
      setRequestSrc((current) =>
        current === normalizedPrefetchedSrc ? current : normalizedPrefetchedSrc
      );
      if (!isAlreadyShowingSameSrc) {
        setStatus("loading");
        setFinalRetryQueued(false);
      }
      return;
    }

    const cachedSrc = readProductImageSuccess(normalizedCode, normalizedArticle || undefined);
    if (cachedSrc) {
      const isAlreadyShowingSameSrc =
        statusRef.current === "loaded" &&
        requestSrcRef.current === cachedSrc;

      lastSuccessfulSrcRef.current = cachedSrc;
      setRequestSrc((current) => (current === cachedSrc ? current : cachedSrc));
      if (!isAlreadyShowingSameSrc) {
        setStatus("loading");
        setFinalRetryQueued(false);
      }
      return;
    }

    if (readProductImageMissing(normalizedCode, normalizedArticle || undefined)) {
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }

    if (!primarySrc) {
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }
    if (disableDirectLoad) {
      setRequestSrc("");
      setStatus("loading");
      setFinalRetryQueued(false);

      deferredDirectLoadTimerRef.current = setTimeout(() => {
        deferredDirectLoadTimerRef.current = null;
        setRequestSrc(primarySrc);
        setStatus("loading");
      }, BATCH_DIRECT_FALLBACK_DELAY_MS);

      return () => {
        if (deferredDirectLoadTimerRef.current) {
          clearTimeout(deferredDirectLoadTimerRef.current);
          deferredDirectLoadTimerRef.current = null;
        }
      };
    }
    if (deferDirectLoad) {
      setRequestSrc("");
      setStatus("loading");
      setFinalRetryQueued(false);

      deferredDirectLoadTimerRef.current = setTimeout(() => {
        deferredDirectLoadTimerRef.current = null;
        setRequestSrc(primarySrc);
        setStatus("loading");
      }, DEFERRED_DIRECT_LOAD_DELAY_MS);

      return () => {
        if (deferredDirectLoadTimerRef.current) {
          clearTimeout(deferredDirectLoadTimerRef.current);
          deferredDirectLoadTimerRef.current = null;
        }
      };
    }
    setRequestSrc(primarySrc);
    setStatus("loading");
    setFinalRetryQueued(false);
  }, [
    hasKnownPhoto,
    normalizedArticle,
    normalizedCode,
    normalizedPrefetchedSrc,
    primarySrc,
    deferDirectLoad,
    disableDirectLoad,
    batchImagePending,
  ]);
  useEffect(() => {
    if (!hasKnownPhoto) return;
    if (status !== "missing") return;
    if (!finalRetrySrc) return;
    if (finalRetryQueued) return;

    const timeoutId = window.setTimeout(() => {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("retrying");
    }, FINAL_RETRY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [finalRetryQueued, finalRetrySrc, hasKnownPhoto, status]);


  const handleError = useCallback(() => {
    clearProductImageSuccess(normalizedCode, normalizedArticle || undefined);

    if (!hasKnownPhoto) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    // Якщо вже був фінальний ретрай, не пробуємо ще раз
    if (finalRetryQueued) {
      setStatus("missing");
      return;
    }

    if (requestSrc && requestSrc !== recoverySrc && recoverySrc) {
      setRequestSrc(recoverySrc);
      setStatus("retrying");
      return;
    }

    if (
      requestSrc &&
      requestSrc !== finalRetrySrc &&
      finalRetrySrc
    ) {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("retrying");
      return;
    }
  }, [
    finalRetryQueued,
    finalRetrySrc,
    hasKnownPhoto,
    normalizedArticle,
    normalizedCode,
    recoverySrc,
    requestSrc,
  ]);


  const canOpen = Boolean(onClick) && status === "loaded";
  const imageAlt = (alt || "Фото товару").trim();
  // Show skeleton until image is fully loaded (not just while requestSrc is empty)
  const showLoadingSkeleton =
    status !== "loaded" && (status === "loading" || batchImagePending);
  const showPlaceholder = status === "missing";
  const imageDecodingMode = fetchPriority === "high" ? "sync" : "async";
  const imageFadeClass =
    fetchPriority === "high" ? "duration-100" : "duration-200";

  return (
    <div
      role={canOpen ? "button" : "img"}
      tabIndex={canOpen ? 0 : undefined}
      aria-label={canOpen ? `Відкрити ${imageAlt}` : imageAlt}
      onClick={(event) => {
        if (!canOpen || !onClick) return;
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (!canOpen || !onClick) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`
        relative flex h-full w-full items-center justify-center overflow-hidden rounded-md
        bg-gray-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2
        ${canOpen ? "cursor-pointer" : "cursor-default"}
        ${className}
      `}
    >
      {/* Якщо фото гарантовано немає — одразу плейсхолдер, <img> не рендеримо взагалі */}
      {(!hasKnownPhoto || showPlaceholder) ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#edf3f8_58%,#e2e8f0_100%)] px-2 text-center">
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
      ) : (
        <>
          {/* Skeleton always present, fades out when image is loaded */}
          <div
            className={`absolute inset-0 transition-opacity ${imageFadeClass} pointer-events-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 ${showLoadingSkeleton ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden="true"
          />
          {requestSrc && (
            <Image
              key={requestSrc}
              src={requestSrc}
              alt={imageAlt}
              fill
              sizes="(max-width: 639px) 33vw, (max-width: 767px) 18vw, (max-width: 1023px) 13vw, 10vw"
              loading={loadingMode}
              fetchPriority={fetchPriority}
              unoptimized={requestSrc.startsWith("data:image/")}
              decoding={imageDecodingMode}
              draggable={false}
              onLoad={handleLoad}
              onError={handleError}
              className={`object-contain transition-opacity ${imageFadeClass} ${showLoadingSkeleton ? 'opacity-0' : 'opacity-100'}`}
            />
          )}
        </>
      )}
    </div>
  );
};

export default ProductCardImage;
