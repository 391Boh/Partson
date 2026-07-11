
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


const FINAL_RETRY_DELAY_MS = 60;
const DEFERRED_DIRECT_LOAD_DELAY_MS = 150;

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
  batchImageMissing?: boolean;
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
  batchImageMissing = false,
}) => {
  const normalizedCode = (productCode || "").trim();
  const normalizedArticle = (articleHint || "").trim();
  const normalizedPrefetchedSrc = (prefetchedSrc || "").trim();

  const [requestSrc, setRequestSrc] = useState<string>(() => {
    if (!hasKnownPhoto || !normalizedCode) return "";
    if (normalizedPrefetchedSrc) return normalizedPrefetchedSrc;
    if (typeof window === "undefined") return "";
    if (readProductImageMissing(normalizedCode, normalizedArticle || undefined)) return "";
    return readProductImageSuccess(normalizedCode, normalizedArticle || undefined) ?? "";
  });
  const [status, setStatus] = useState<ImageStatus>(() => {
    if (!hasKnownPhoto) return "missing";
    if (typeof window === "undefined") return "loading";
    if (readProductImageMissing(normalizedCode, normalizedArticle || undefined)) return "missing";
    return "loading";
  });

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
  const statusRef = useRef<ImageStatus>(status);
  const directFallbackQueuedRef = useRef(false);

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
    let deferredLoadTimer: number | null = null;

    if (normalizedPrefetchedSrc) {
      directFallbackQueuedRef.current = false;
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
      return () => {};
    }

    if (batchImageMissing) {
      directFallbackQueuedRef.current = false;
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(true);
      return () => {};
    }

    const cachedSrc = readProductImageSuccess(normalizedCode, normalizedArticle || undefined);
    if (cachedSrc) {
      directFallbackQueuedRef.current = false;
      const isAlreadyShowingSameSrc =
        statusRef.current === "loaded" &&
        requestSrcRef.current === cachedSrc;

      lastSuccessfulSrcRef.current = cachedSrc;
      setRequestSrc((current) => (current === cachedSrc ? current : cachedSrc));
      if (!isAlreadyShowingSameSrc) {
        setStatus("loading");
        setFinalRetryQueued(false);
      }
      return () => {};
    }

    if (!hasKnownPhoto) {
      directFallbackQueuedRef.current = false;
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return () => {};
    }

    if (readProductImageMissing(normalizedCode, normalizedArticle || undefined)) {
      directFallbackQueuedRef.current = false;
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return () => {};
    }

    if (!primarySrc) {
      directFallbackQueuedRef.current = false;
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return () => {};
    }

    if (disableDirectLoad) {
      directFallbackQueuedRef.current = false;
      // Keep a successfully loaded image visible while batch is pending.
      if (statusRef.current === "loaded") return () => {};
      setRequestSrc("");
      setStatus("loading");
      setFinalRetryQueued(false);
      return () => {};
    }

    if (deferDirectLoad) {
      directFallbackQueuedRef.current = false;
      // Keep a successfully loaded image visible when deferral props change.
      if (statusRef.current === "loaded") return () => {};
      setRequestSrc("");
      setStatus("loading");
      setFinalRetryQueued(false);
      deferredLoadTimer = window.setTimeout(() => {
        if (statusRef.current === "loaded" || requestSrcRef.current) return;
        setRequestSrc(primarySrc);
        setStatus("loading");
      }, DEFERRED_DIRECT_LOAD_DELAY_MS);

      return () => {
        if (deferredLoadTimer !== null) {
          window.clearTimeout(deferredLoadTimer);
        }
      };
    }

    // If the image is already showing from a previous successful load of the
    // same product, keep it visible instead of triggering a skeleton flash.
    const alreadyLoaded =
      statusRef.current === "loaded" &&
      (requestSrcRef.current === primarySrc ||
        requestSrcRef.current === recoverySrc ||
        requestSrcRef.current === finalRetrySrc);
    if (alreadyLoaded) return () => {};

    setRequestSrc(primarySrc);
    setStatus("loading");
    setFinalRetryQueued(false);
    directFallbackQueuedRef.current = false;
    return () => {};
  }, [
    hasKnownPhoto,
    normalizedArticle,
    normalizedCode,
    normalizedPrefetchedSrc,
    primarySrc,
    recoverySrc,
    finalRetrySrc,
    batchImagePending,
    batchImageMissing,
    deferDirectLoad,
    disableDirectLoad,
  ]);
  useEffect(() => {
    if (!hasKnownPhoto) return;
    if (disableDirectLoad) return;
    if (batchImageMissing) return;
    if (status !== "missing") return;
    if (!finalRetrySrc) return;
    if (finalRetryQueued) return;

    const timeoutId = window.setTimeout(() => {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("retrying");
    }, FINAL_RETRY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [batchImageMissing, disableDirectLoad, finalRetryQueued, finalRetrySrc, hasKnownPhoto, status]);


  const handleError = useCallback(() => {
    clearProductImageSuccess(normalizedCode, normalizedArticle || undefined);

    if (!hasKnownPhoto) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    // disableDirectLoad: batch still in-flight, no src yet — queue a direct load once cleared.
    if (disableDirectLoad) {
      if (!directFallbackQueuedRef.current && primarySrc) {
        directFallbackQueuedRef.current = true;
        setRequestSrc(primarySrc);
        setStatus("retrying");
        setFinalRetryQueued(false);
        return;
      }

      setRequestSrc("");
      setStatus("missing");
      return;
    }

    // deferDirectLoad items fall through to the same retry chain as normal items.
    // Previously they retried with the same primarySrc URL (identical key → Image not
    // remounted → no new browser request → stuck in "retrying" showing a blank card).
    // Now they use recoverySrc (retry=1) and finalRetrySrc (retry=2), which are distinct
    // URLs that bypass the server-side miss cache (skipMissCache: true).
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
    disableDirectLoad,
    hasKnownPhoto,
    normalizedArticle,
    normalizedCode,
    primarySrc,
    recoverySrc,
    requestSrc,
  ]);


  const canOpen = Boolean(onClick) && status === "loaded";
  const imageAlt = (alt || "Фото товару").trim();
  const showLoadingSkeleton =
    status !== "loaded" && status !== "missing" && (status === "loading" || batchImagePending || !requestSrc);
  const showPlaceholder = status === "missing";
  const imageDecodingMode = fetchPriority === "high" ? "sync" : "async";
  const imageFadeClass = "duration-0";

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
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#edf3f8_58%,#e2e8f0_100%)] px-2 text-center">
          <div className="absolute inset-x-2 top-2 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
          <ImageOff
            className="relative h-5 w-5 text-slate-400/90 sm:h-6 sm:w-6"
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </div>
      ) : (
        <>
          {/* Skeleton always present, fades out when image is loaded */}
          <div
            className={`catalog-image-loading absolute inset-0 transition-opacity ${imageFadeClass} pointer-events-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 ${showLoadingSkeleton ? 'opacity-100' : 'opacity-0'}`}
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
              unoptimized={
                requestSrc.startsWith("data:image/") ||
                requestSrc.startsWith("/product-image/")
              }
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
