"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

import {
  clearProductImageMissing,
  clearProductImageSuccess,
  readProductImageMissing,
  readProductImageSuccess,
  writeProductImageMissing,
  writeProductImageSuccess,
} from "app/lib/product-image-client";
import { fetchCatalogImageBatch } from "app/lib/product-image-batch-client";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";

const FINAL_RETRY_DELAY_MS = 180;
const BATCH_WARMUP_WINDOW_MS = 4;
const BATCH_WAIT_TIMEOUT_MS = 260;
const BATCH_WAIT_TIMEOUT_MS_LAZY = 220;
const BATCH_READY_TTL_MS = 1000 * 60 * 3;
const BATCH_MISSING_TTL_MS = 1000 * 25;
const BATCH_MAX_ITEMS = 24;

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
  batchPending?: boolean;
  batchMissing?: boolean;
  batchOnly?: boolean;
  className?: string;
  onClick?: () => void;
  loadingMode?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}

type ImageStatus = "loading" | "retrying" | "loaded" | "missing";

type BatchWarmResult = {
  status: "ready" | "missing";
  src?: string;
  t: number;
};

type QueuedBatchWarmItem = {
  code: string;
  article?: string;
};

const batchWarmResultCache = new Map<string, BatchWarmResult>();
const batchWarmListeners = new Map<
  string,
  Set<(result: BatchWarmResult) => void>
>();
const pendingBatchWarmItems = new Map<string, QueuedBatchWarmItem>();
let batchWarmFlushTimer: number | null = null;
let batchWarmInFlight = false;

const pruneBatchWarmResultCache = () => {
  const now = Date.now();
  for (const [key, value] of batchWarmResultCache.entries()) {
    const ttlMs =
      value?.status === "missing" ? BATCH_MISSING_TTL_MS : BATCH_READY_TTL_MS;
    if (!value || now - value.t > ttlMs) {
      batchWarmResultCache.delete(key);
    }
  }
};

const emitBatchWarmResult = (key: string, result: BatchWarmResult) => {
  batchWarmResultCache.set(key, result);
  const listeners = batchWarmListeners.get(key);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    listener(result);
  }
};

const subscribeToBatchWarmResult = (
  key: string,
  listener: (result: BatchWarmResult) => void
) => {
  const current = batchWarmListeners.get(key) ?? new Set();
  current.add(listener);
  batchWarmListeners.set(key, current);

  return () => {
    const next = batchWarmListeners.get(key);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) {
      batchWarmListeners.delete(key);
    }
  };
};

const flushPendingBatchWarmItems = async () => {
  if (batchWarmInFlight || typeof window === "undefined") return;

  batchWarmInFlight = true;

  try {
    pruneBatchWarmResultCache();

    while (pendingBatchWarmItems.size > 0) {
      const entries = Array.from(pendingBatchWarmItems.entries()).slice(
        0,
        BATCH_MAX_ITEMS
      );
      for (const [key] of entries) {
        pendingBatchWarmItems.delete(key);
      }

      const results = await fetchCatalogImageBatch(
        entries.map(([, item]) => ({
          code: item.code,
          article: item.article,
        }))
      ).catch(() => []);

      const resultsByKey = new Map(results.map((result) => [result.key, result]));
      for (const [key, item] of entries) {
        const result = resultsByKey.get(key);
        if (result?.status === "ready" && result.src) {
          writeProductImageSuccess(item.code, item.article, result.src);
          emitBatchWarmResult(key, {
            status: "ready",
            src: result.src,
            t: Date.now(),
          });
          continue;
        }

        emitBatchWarmResult(key, {
          status: "missing",
          t: Date.now(),
        });
      }
    }
  } finally {
    batchWarmInFlight = false;

    if (pendingBatchWarmItems.size > 0) {
      scheduleBatchWarmFlush();
    }
  }
};

function scheduleBatchWarmFlush() {
  if (typeof window === "undefined") return;
  if (batchWarmFlushTimer != null) return;

  batchWarmFlushTimer = window.setTimeout(() => {
    batchWarmFlushTimer = null;
    void flushPendingBatchWarmItems();
  }, BATCH_WARMUP_WINDOW_MS);
}

const queueBatchWarmItem = (item: QueuedBatchWarmItem) => {
  const key = buildProductImageBatchKey(item.code, item.article);
  if (!key) return;

  pruneBatchWarmResultCache();
  if (batchWarmResultCache.has(key)) return;

  pendingBatchWarmItems.set(key, item);
  scheduleBatchWarmFlush();
};

const ProductCardImage: React.FC<Props> = ({
  productCode,
  articleHint,
  hasKnownPhoto = true,
  prefetchedSrc,
  batchPending = false,
  batchMissing = false,
  batchOnly = true,
  className = "",
  onClick,
  loadingMode = "lazy",
  fetchPriority = "auto",
}) => {
  const normalizedCode = (productCode || "").trim();
  const normalizedArticle = (articleHint || "").trim();
  const normalizedPrefetchedSrc = (prefetchedSrc || "").trim();

  const primarySrc = useMemo(
    () =>
      buildProductImagePath(normalizedCode, normalizedArticle, { catalog: true }),
    [normalizedArticle, normalizedCode]
  );
  const recoverySrc = useMemo(
    () =>
      buildProductImagePath(normalizedCode, normalizedArticle, {
        catalog: true,
        retryToken: 1,
      }),
    [normalizedArticle, normalizedCode]
  );
  const finalRetrySrc = useMemo(
    () =>
      buildProductImagePath(normalizedCode, normalizedArticle, {
        catalog: true,
        retryToken: 2,
      }),
    [normalizedArticle, normalizedCode]
  );
  const batchKey = useMemo(
    () => buildProductImageBatchKey(normalizedCode, normalizedArticle),
    [normalizedArticle, normalizedCode]
  );

  const [requestSrc, setRequestSrc] = useState(primarySrc);
  const [status, setStatus] = useState<ImageStatus>(
    primarySrc ? "loading" : "missing"
  );
  const [finalRetryQueued, setFinalRetryQueued] = useState(false);
  const lastSuccessfulSrcRef = useRef("");

  useEffect(() => {
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

    if (batchOnly) {
      if (typeof window === "undefined") {
        setRequestSrc("");
        setStatus("loading");
        setFinalRetryQueued(false);
        return;
      }

      const cachedSuccess = readProductImageSuccess(
        normalizedCode,
        normalizedArticle
      );
      if (cachedSuccess) {
        lastSuccessfulSrcRef.current = cachedSuccess;
        setRequestSrc(cachedSuccess);
        setStatus("loaded");
        setFinalRetryQueued(false);
        return;
      }

      if (!hasKnownPhoto) {
        setRequestSrc("");
        setStatus("missing");
        setFinalRetryQueued(false);
        return;
      }

      pruneBatchWarmResultCache();
      const warmResult = batchKey ? batchWarmResultCache.get(batchKey) : null;
      if (warmResult?.status === "ready" && warmResult.src) {
        lastSuccessfulSrcRef.current = warmResult.src;
        setRequestSrc(warmResult.src);
        setStatus("loaded");
        setFinalRetryQueued(false);
        return;
      }

      if (warmResult?.status === "missing") {
        if (primarySrc) {
          setRequestSrc(primarySrc);
          setStatus("retrying");
          setFinalRetryQueued(false);
          return;
        }

        setRequestSrc("");
        setStatus("missing");
        setFinalRetryQueued(false);
        return;
      }

      if (batchMissing) {
        if (primarySrc) {
          setRequestSrc(primarySrc);
          setStatus("retrying");
          setFinalRetryQueued(false);
          return;
        }

        setRequestSrc("");
        setStatus("missing");
        setFinalRetryQueued(false);
        return;
      }

      if (batchPending) {
        setRequestSrc("");
        setStatus("loading");
        setFinalRetryQueued(false);
        return;
      }

      if (batchKey) {
        let settled = false;
        const finishWithResult = (result: BatchWarmResult) => {
          if (settled) return;
          settled = true;

          if (result.status === "ready" && result.src) {
            lastSuccessfulSrcRef.current = result.src;
            setRequestSrc(result.src);
            setStatus("loaded");
            return;
          }

          setRequestSrc("");
          setStatus("missing");
        };

        const unsubscribe = subscribeToBatchWarmResult(batchKey, finishWithResult);
        queueBatchWarmItem({
          code: normalizedCode,
          article: normalizedArticle || undefined,
        });

        setRequestSrc("");
        setStatus("loading");
        setFinalRetryQueued(false);

        return () => {
          settled = true;
          unsubscribe();
        };
      }

      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }

    if (batchPending) {
      if (lastSuccessfulSrcRef.current) {
        setRequestSrc(lastSuccessfulSrcRef.current);
        setStatus("loaded");
        setFinalRetryQueued(false);
        return;
      }

      setRequestSrc("");
      setStatus("loading");
      setFinalRetryQueued(false);
      return;
    }

    if (batchMissing) {
      if (hasKnownPhoto && primarySrc) {
        setRequestSrc(primarySrc);
        setStatus("retrying");
        setFinalRetryQueued(false);
        return;
      }

      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }

    if (typeof window === "undefined") {
      setRequestSrc(primarySrc);
      setStatus("loading");
      setFinalRetryQueued(false);
      return;
    }

    const cachedSuccess = readProductImageSuccess(
      normalizedCode,
      normalizedArticle
    );
    if (cachedSuccess) {
      lastSuccessfulSrcRef.current = cachedSuccess;
      setRequestSrc(cachedSuccess);
      setStatus("loaded");
      setFinalRetryQueued(false);
      return;
    }

    if (readProductImageMissing(normalizedCode, normalizedArticle)) {
      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }

    pruneBatchWarmResultCache();
    const warmResult = batchKey ? batchWarmResultCache.get(batchKey) : null;
    if (warmResult?.status === "ready" && warmResult.src) {
      lastSuccessfulSrcRef.current = warmResult.src;
      setRequestSrc(warmResult.src);
      setStatus("loaded");
      setFinalRetryQueued(false);
      return;
    }

    if (warmResult?.status === "missing") {
      if (hasKnownPhoto && primarySrc) {
        setRequestSrc(primarySrc);
        setStatus("retrying");
        setFinalRetryQueued(false);
        return;
      }

      setRequestSrc("");
      setStatus("missing");
      setFinalRetryQueued(false);
      return;
    }

    if (lastSuccessfulSrcRef.current) {
      setRequestSrc(lastSuccessfulSrcRef.current);
      setStatus("retrying");
    } else {
      setRequestSrc("");
      setStatus("loading");
    }
    setFinalRetryQueued(false);

    if (!batchKey) {
      if (!primarySrc || !hasKnownPhoto) {
        setRequestSrc("");
        setStatus("missing");
        return;
      }
      setRequestSrc(primarySrc);
      setStatus("loading");
      return;
    }

    let settled = false;
    const finishWithResult = (result: BatchWarmResult) => {
      if (settled) return;
      settled = true;

      if (result.status === "ready" && result.src) {
        lastSuccessfulSrcRef.current = result.src;
        setRequestSrc(result.src);
        setStatus("loaded");
        return;
      }

      if (hasKnownPhoto && primarySrc) {
        setRequestSrc(primarySrc);
        setStatus("retrying");
        setFinalRetryQueued(false);
        return;
      }

      setRequestSrc("");
      setStatus("missing");
    };

    const unsubscribe = subscribeToBatchWarmResult(batchKey, finishWithResult);
    queueBatchWarmItem({
      code: normalizedCode,
      article: normalizedArticle || undefined,
    });

    const fallbackWaitMs = loadingMode === "eager" ? BATCH_WAIT_TIMEOUT_MS : BATCH_WAIT_TIMEOUT_MS_LAZY;
    const fallbackTimerId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (!primarySrc || !hasKnownPhoto) {
        setRequestSrc("");
        setStatus("missing");
        return;
      }
      setRequestSrc(primarySrc);
      setStatus("loading");
    }, fallbackWaitMs);

    return () => {
      unsubscribe();
      window.clearTimeout(fallbackTimerId);
    };
  }, [
    batchKey,
    normalizedArticle,
    batchMissing,
    batchOnly,
    batchPending,
    hasKnownPhoto,
    normalizedCode,
    normalizedPrefetchedSrc,
    primarySrc,
    loadingMode,
  ]);

  useEffect(() => {
    if (batchOnly) return;
    if (status !== "missing") return;
    if (!finalRetrySrc) return;
    if (finalRetryQueued) return;

    const timeoutId = window.setTimeout(() => {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("retrying");
    }, FINAL_RETRY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [batchOnly, finalRetryQueued, finalRetrySrc, status]);

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
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

      if (normalizedNextSrc) {
        lastSuccessfulSrcRef.current = normalizedNextSrc;
        setRequestSrc(normalizedNextSrc);
        if (!isInlineImage) {
          writeProductImageSuccess(
            normalizedCode,
            normalizedArticle || undefined,
            normalizedNextSrc
          );
        }

        if (batchKey && !isInlineImage) {
          batchWarmResultCache.set(batchKey, {
            status: "ready",
            src: normalizedNextSrc,
            t: Date.now(),
          });
        }

        clearProductImageMissing(normalizedCode, normalizedArticle || undefined);
      }

      setFinalRetryQueued(true);
      setStatus("loaded");
    },
    [batchKey, normalizedArticle, normalizedCode, requestSrc]
  );

  const handleError = useCallback(() => {
    clearProductImageSuccess(normalizedCode, normalizedArticle || undefined);
    if (batchKey) {
      batchWarmResultCache.delete(batchKey);
    }

    if (!hasKnownPhoto) {
      writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
      setRequestSrc("");
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
      finalRetrySrc &&
      !finalRetryQueued
    ) {
      setFinalRetryQueued(true);
      setRequestSrc(finalRetrySrc);
      setStatus("retrying");
      return;
    }

    writeProductImageMissing(normalizedCode, normalizedArticle || undefined);
    setRequestSrc("");
    setStatus("missing");
  }, [
    batchKey,
    finalRetryQueued,
    finalRetrySrc,
    hasKnownPhoto,
    normalizedArticle,
    normalizedCode,
    recoverySrc,
    requestSrc,
  ]);

  const canOpen = Boolean(onClick) && status === "loaded";
  const showLoadingSkeleton =
    (status === "loading" || status === "retrying") && !requestSrc;
  const showPlaceholder = status === "missing";
  const imageDecodingMode = "async";

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
      {showPlaceholder && (
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
      )}

      {showLoadingSkeleton && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200" />
      )}

      {requestSrc && !showPlaceholder && (
        // We serve already-optimized same-origin thumbnails from `/product-image`,
        // so a plain img avoids an extra client-side optimization hop here.
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
          className="relative z-[1] h-full w-full object-contain"
        />
      )}
    </div>
  );
};

export default ProductCardImage;
