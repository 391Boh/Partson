"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImageOff, Maximize2, X } from "lucide-react";

interface ProductImageWithFallbackProps {
  src: string;
  fallbackSrc: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
  fetchPriority?: "high" | "low" | "auto";
  zoomEnabled?: boolean;
}

const PARTSON_LOGO_PATH = "/Car-parts.png";
const REVEAL_TRANSITION = { duration: 0.26, ease: [0.22, 0.61, 0.36, 1] as const };

const normalizeSrcPath = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed, "http://localhost").pathname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

export default function ProductImageWithFallback({
  src,
  fallbackSrc,
  alt,
  width,
  height,
  className,
  loading = "eager",
  decoding = "async",
  fetchPriority = "auto",
  zoomEnabled = true,
}: ProductImageWithFallbackProps) {
  const noPhotoLabel =
    "\u0424\u043e\u0442\u043e \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u0432\u0456\u0434\u0441\u0443\u0442\u043d\u0454";
  const logoAlt = "\u041b\u043e\u0433\u043e\u0442\u0438\u043f PartsON";
  const openPhotoTitle = "\u0412\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u0444\u043e\u0442\u043e";
  const closeTitle = "\u0417\u0430\u043a\u0440\u0438\u0442\u0438";
  const photoLabel = "\u0424\u043e\u0442\u043e";

  const placeholderImageSrc = (fallbackSrc || "").trim() || PARTSON_LOGO_PATH;

  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);

  const normalizedFallbackPath = useMemo(() => normalizeSrcPath(fallbackSrc), [fallbackSrc]);
  const candidateSrc = (src || "").trim();

  const showPlaceholder = !candidateSrc || failedSrc === candidateSrc;
  const isLoaded = !showPlaceholder && loadedSrc === candidateSrc;
  const showPlaceholderOverlay = !showPlaceholder && !isLoaded;
  const canOpen = zoomEnabled && isLoaded;
  const isLightboxOpen = lightboxSrc === candidateSrc && canOpen;

  const applyLoadedCandidate = useCallback(
    (element: HTMLImageElement | null) => {
      if (!element || !candidateSrc) return;

      const loadedPath = normalizeSrcPath(
        element.currentSrc || element.src || candidateSrc
      );

      // If backend returns fallback instead of product photo, show no-photo state.
      if (normalizedFallbackPath && loadedPath === normalizedFallbackPath) {
        setFailedSrc(candidateSrc);
        return;
      }

      setLoadedSrc(candidateSrc);
    },
    [candidateSrc, normalizedFallbackPath]
  );

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    applyLoadedCandidate(event.currentTarget);
  };

  const handleImageError = () => {
    if (!candidateSrc) return;
    setFailedSrc(candidateSrc);
  };

  const openLightbox = () => {
    if (!canOpen) return;
    setLightboxSrc(candidateSrc);
  };

  const closeLightbox = () => {
    setLightboxSrc("");
  };

  useEffect(() => {
    if (!candidateSrc) return;

    const element = imageRef.current;
    if (!element || !element.complete) return;

    if (element.naturalWidth > 0 && element.naturalHeight > 0) {
      applyLoadedCandidate(element);
      return;
    }

    setFailedSrc(candidateSrc);
  }, [applyLoadedCandidate, candidateSrc]);

  if (showPlaceholder) {
    return (
      <motion.div
        role="img"
        aria-label={alt}
        className={`${className ?? ""} flex items-center justify-center rounded-xl border border-slate-200 bg-[linear-gradient(160deg,#f8fafc,#f1f5f9)]`}
        initial={{ opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={REVEAL_TRANSITION}
      >
        <motion.div
          className="flex flex-col items-center gap-2 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL_TRANSITION, delay: 0.05 }}
        >
          <motion.img
            src={placeholderImageSrc}
            alt={logoAlt}
            width={220}
            height={110}
            loading="lazy"
            decoding="async"
            className="h-auto w-[170px] max-w-full object-contain sm:w-[220px]"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...REVEAL_TRANSITION, delay: 0.08 }}
          />
          <motion.span
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...REVEAL_TRANSITION, delay: 0.12 }}
          >
            <ImageOff size={13} />
            {noPhotoLabel}
          </motion.span>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        className={`${className ?? ""} group relative overflow-hidden rounded-xl bg-[linear-gradient(160deg,#f8fafc,#f1f5f9)]`}
        initial={{ opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={REVEAL_TRANSITION}
      >
        <AnimatePresence initial={false}>
          {showPlaceholderOverlay && (
            <motion.div
              className="absolute inset-0 z-10 flex items-center justify-center bg-[linear-gradient(160deg,#f8fafc,#f1f5f9)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="flex flex-col items-center gap-2 text-center"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={REVEAL_TRANSITION}
              >
                <motion.img
                  src={placeholderImageSrc}
                  alt={logoAlt}
                  width={220}
                  height={110}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-[170px] max-w-full object-contain sm:w-[220px]"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={REVEAL_TRANSITION}
                />
                <motion.span
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 2 }}
                  transition={{ ...REVEAL_TRANSITION, delay: 0.05 }}
                >
                  <ImageOff size={13} />
                  {noPhotoLabel}
                </motion.span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.img
          ref={imageRef}
          src={candidateSrc || undefined}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onLoad={handleImageLoad}
          onError={handleImageError}
          initial={false}
          animate={{
            opacity: isLoaded ? 1 : 0,
            scale: isLoaded ? 1 : 1.02,
            filter: isLoaded ? "blur(0px)" : "blur(4px)",
          }}
          transition={REVEAL_TRANSITION}
          className="h-full w-full object-contain"
        />

        {canOpen && (
          <button
            type="button"
            onClick={openLightbox}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
            title={openPhotoTitle}
          >
            <Maximize2 size={13} />
            {photoLabel}
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeLightbox}
          >
            <motion.div
              className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 p-2 shadow-[0_28px_70px_rgba(2,6,23,0.55)]"
              initial={{ opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.985 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-3 top-3 z-10 inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/90 p-1.5 text-slate-200 transition hover:border-slate-400 hover:text-white"
                title={closeTitle}
              >
                <X size={16} />
              </button>
              <img
                src={candidateSrc}
                alt={alt}
                width={1400}
                height={1400}
                loading="eager"
                decoding="sync"
                className="max-h-[86dvh] w-full rounded-xl object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
