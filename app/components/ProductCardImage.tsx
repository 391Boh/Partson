"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImageOff } from "lucide-react";

const FALLBACK = "__NO_IMAGE__";
const IMAGE_CACHE_PREFIX = "img_";

interface Props {
  productCode: string;
  className?: string;
  onClick?: () => void;
}

const buildImagePath = (productCode: string) =>
  `/product-image/${encodeURIComponent((productCode || "").trim())}?strict=1`;

const ProductCardImage: React.FC<Props> = ({ productCode, className = "", onClick }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [attemptedLoad, setAttemptedLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }

    const normalizedCode = (productCode || "").trim();
    if (!normalizedCode) {
      queueMicrotask(() => setShouldLoad(false));
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }

    const node = containerRef.current;
    if (!node) {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [productCode]);

  useEffect(() => {
    const applyState = (
      nextSrc: string | null,
      nextLoading: boolean,
      nextAttempted: boolean
    ) => {
      queueMicrotask(() => {
        setSrc(nextSrc);
        setLoading(nextLoading);
        setAttemptedLoad(nextAttempted);
      });
    };

    const normalizedCode = (productCode || "").trim();
    if (!normalizedCode) {
      applyState(FALLBACK, false, true);
      return;
    }

    if (!shouldLoad) {
      applyState(null, false, false);
      return;
    }

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;

    if (connection?.saveData) {
      applyState(FALLBACK, false, true);
      return;
    }

    const cacheKey = `${IMAGE_CACHE_PREFIX}${normalizedCode}`;

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        applyState(cached, cached !== FALLBACK, true);
        return;
      }
    } catch {
      // Ignore sessionStorage errors.
    }

    applyState(buildImagePath(normalizedCode), true, true);
  }, [productCode, shouldLoad]);

  const cacheValue = (value: string) => {
    const normalizedCode = (productCode || "").trim();
    if (!normalizedCode) return;

    try {
      sessionStorage.setItem(`${IMAGE_CACHE_PREFIX}${normalizedCode}`, value);
    } catch {
      // Ignore sessionStorage errors.
    }
  };

  const handleImageLoad = () => {
    const normalizedCode = (productCode || "").trim();
    const imagePath = buildImagePath(normalizedCode);
    setSrc(imagePath);
    setLoading(false);
    setAttemptedLoad(true);
    cacheValue(imagePath);
  };

  const handleImageError = () => {
    setSrc(FALLBACK);
    setLoading(false);
    setAttemptedLoad(true);
    cacheValue(FALLBACK);
  };

  const noImage = src === FALLBACK;
  const hasImage = Boolean(src) && !noImage;
  const canOpen = Boolean(onClick) && hasImage && !loading;
  const showSkeleton = loading || (!attemptedLoad && !noImage);

  return (
    <div
      ref={containerRef}
      onClick={(event) => {
        if (!canOpen || !onClick) return;
        event.stopPropagation();
        onClick();
      }}
      title={
        loading
          ? "Завантаження фото..."
          : canOpen
          ? "Відкрити фото товару"
          : "Фото відсутнє"
      }
      className={`
        relative h-full w-full overflow-hidden rounded-md
        bg-gray-200 flex items-center justify-center
        ${canOpen ? "cursor-pointer" : "cursor-default"}
        ${className}
      `}
    >
      {noImage && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex select-none flex-col items-center justify-center bg-gray-200 text-center"
        >
          <ImageOff size={22} className="mb-1 text-gray-500" />
          <span className="text-[11px] font-medium text-gray-600">Відсутнє зображення</span>
        </motion.div>
      )}

      {hasImage && (
        <motion.img
          src={src ?? undefined}
          alt="product"
          className="h-full w-full object-contain"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {showSkeleton && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-300 via-gray-200 to-gray-300" />
      )}
    </div>
  );
};

export default ProductCardImage;
