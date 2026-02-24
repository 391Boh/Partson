"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImageOff } from "lucide-react";

const FALLBACK = "__NO_IMAGE__";
const IMAGE_CACHE_PREFIX = "img_";
const PRODUCT_IMAGE_FALLBACK_PATH = "/Car-parts-fullwidth.png";

interface Props {
  productCode: string;
  className?: string;
  onClick?: () => void;
}

const buildImagePath = (productCode: string) =>
  `/product-image/${encodeURIComponent((productCode || "").trim())}`;

const ProductCardImage: React.FC<Props> = ({ productCode, className = "", onClick }) => {
  const [src, setSrc] = useState<string | null>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setShouldLoad(true);
      return;
    }

    const normalizedCode = (productCode || "").trim();
    if (!normalizedCode) {
      setShouldLoad(false);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const node = containerRef.current;
    if (!node) {
      setShouldLoad(true);
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
    const normalizedCode = (productCode || "").trim();
    if (!normalizedCode) {
      setSrc(FALLBACK);
      setLoading(false);
      return;
    }

    if (!shouldLoad) return;

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;

    if (connection?.saveData) {
      setSrc(FALLBACK);
      setLoading(false);
      return;
    }

    const cacheKey = `${IMAGE_CACHE_PREFIX}${normalizedCode}`;

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setSrc(cached);
        setLoading(cached !== FALLBACK);
        return;
      }
    } catch {
      // Ignore sessionStorage errors.
    }

    setSrc(buildImagePath(normalizedCode));
    setLoading(true);
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

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const loadedSrc = (event.currentTarget.currentSrc || event.currentTarget.src || "").trim();
    if (loadedSrc.includes(PRODUCT_IMAGE_FALLBACK_PATH)) {
      setSrc(FALLBACK);
      setLoading(false);
      cacheValue(FALLBACK);
      return;
    }

    const normalizedCode = (productCode || "").trim();
    const imagePath = buildImagePath(normalizedCode);
    setSrc(imagePath);
    setLoading(false);
    cacheValue(imagePath);
  };

  const handleImageError = () => {
    setSrc(FALLBACK);
    setLoading(false);
    cacheValue(FALLBACK);
  };

  const noImage = src === FALLBACK;

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={`
        relative h-full w-full overflow-hidden rounded-md
        bg-gray-200 flex items-center justify-center
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
          <span className="text-[11px] font-medium text-gray-600">Зображення відсутнє</span>
        </motion.div>
      )}

      {!noImage && (
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

      {loading && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-300 via-gray-200 to-gray-300" />
      )}
    </div>
  );
};

export default ProductCardImage;
