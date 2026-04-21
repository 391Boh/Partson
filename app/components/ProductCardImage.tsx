
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";


import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import {
  writeProductImageSuccess,
  writeProductImageMissing,
  clearProductImageSuccess,
  clearProductImageMissing
} from "app/lib/product-image-client";


// Delay before final image retry (ms)
const FINAL_RETRY_DELAY_MS = 400;

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
  // batch props removed
  className?: string;
  onClick?: () => void;
  loadingMode?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}

type ImageStatus = "loading" | "retrying" | "loaded" | "missing";

// batch logic removed


const ProductCardImage: React.FC<Props> = ({
  productCode,
  articleHint,
  hasKnownPhoto = true,
  prefetchedSrc,
  className = "",
  onClick,
  loadingMode = "eager",
  fetchPriority = "high",
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

  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const currentTarget = event.currentTarget;
    const nextSrc = currentTarget.currentSrc || currentTarget.src || requestSrc;
    const normalizedNextSrc = (nextSrc || "").trim();
    const isInlineImage = normalizedNextSrc.startsWith("data:image/");
    const loadedPath = normalizeSrcPath(normalizedNextSrc);

    if (
      loadedPath &&
      loadedPath === PRODUCT_IMAGE_FALLBACK_PATH.toLowerCase()
    ) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      return;
    }

    // Не оновлюємо src, якщо він вже співпадає
    if (normalizedNextSrc && normalizedNextSrc !== requestSrc) {
      lastSuccessfulSrcRef.current = normalizedNextSrc;
      setRequestSrc(normalizedNextSrc);
      if (!isInlineImage) {
        writeProductImageSuccess(
          normalizedCode,
          normalizedArticle || undefined,
          normalizedNextSrc
        );
      }
      clearProductImageMissing(normalizedCode, normalizedArticle || undefined);
    }

    setFinalRetryQueued(true);
    setStatus("loaded");
  }, [normalizedArticle, normalizedCode, requestSrc]);

  useEffect(() => {
    if (!hasKnownPhoto) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }
    if (normalizedPrefetchedSrc) {
      lastSuccessfulSrcRef.current = normalizedPrefetchedSrc;
      setRequestSrc(normalizedPrefetchedSrc);
      setStatus("loaded");
      setFinalRetryQueued(true);
      return;
    }
    if (!primarySrc) {
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
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
  // Show skeleton until image is fully loaded (not just while requestSrc is empty)
  const showLoadingSkeleton = status === "loading";
  const showPlaceholder = status === "missing";
  const imageDecodingMode = fetchPriority === "high" ? "sync" : "async";

  return (
    <div
      onClick={(event) => {
        if (!canOpen || !onClick) return;
        event.stopPropagation();
        onClick();
      }}
      className={`
        relative flex h-full w-full items-center justify-center overflow-hidden rounded-md
        bg-gray-200
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
            className={`absolute inset-0 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 ${showLoadingSkeleton ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden="true"
          />
          {requestSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={requestSrc}
              alt="product"
              loading={loadingMode}
              decoding={imageDecodingMode}
              fetchPriority={fetchPriority}
              width={360}
              height={360}
              draggable={false}
              onLoad={handleLoad}
              onError={handleError}
              className={`relative z-[1] h-full w-full object-contain transition-opacity duration-300 ${showLoadingSkeleton ? 'opacity-0' : 'opacity-100'}`}
            />
          )}
        </>
      )}
    </div>
  );
};

export default ProductCardImage;
