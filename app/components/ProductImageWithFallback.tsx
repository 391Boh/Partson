"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { ImageOff, Maximize2 } from "lucide-react";

import ImageModal from "app/components/ImageModal";

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
  const noPhotoLabel = "\u0417\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u043d\u044f \u0432\u0456\u0434\u0441\u0443\u0442\u043d\u0454";
  const openPhotoTitle = "\u0412\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u043d\u044f";
  const photoLabel = "\u0424\u043E\u0442\u043E";

  const candidateSrc = (src || "").trim();
  const normalizedFallbackPath = useMemo(() => normalizeSrcPath(fallbackSrc), [fallbackSrc]);

  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const showPlaceholder = !candidateSrc || failedSrc === candidateSrc;
  const isLoaded = !showPlaceholder && loadedSrc === candidateSrc;
  const showPlaceholderOverlay = !showPlaceholder && !isLoaded;
  const canOpen = zoomEnabled && isLoaded;
  const preferImmediateDecode = loading === "eager" && fetchPriority === "high";

  const applyLoadedCandidate = useCallback(
    (element: HTMLImageElement | null) => {
      if (!element || !candidateSrc) return;

      const loadedPath = normalizeSrcPath(
        element.currentSrc || element.src || candidateSrc
      );

      if (normalizedFallbackPath && loadedPath === normalizedFallbackPath) {
        setFailedSrc(candidateSrc);
        return;
      }

      setLoadedSrc(candidateSrc);
      setFailedSrc("");
    },
    [candidateSrc, normalizedFallbackPath]
  );

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    applyLoadedCandidate(event.currentTarget);
  };

  const handleImageError = () => {
    if (!candidateSrc) return;
    setFailedSrc(candidateSrc);
  };

  useLayoutEffect(() => {
    setLightboxOpen(false);

    if (!candidateSrc) {
      setLoadedSrc("");
      setFailedSrc("");
      return;
    }

    const element = imageRef.current;
    if (!element) {
      setLoadedSrc("");
      setFailedSrc("");
      return;
    }

    if (element.complete) {
      if (element.naturalWidth > 0 && element.naturalHeight > 0) {
        applyLoadedCandidate(element);
        return;
      }

      setLoadedSrc("");
      setFailedSrc(candidateSrc);
      return;
    }

    setLoadedSrc("");
    setFailedSrc("");
  }, [applyLoadedCandidate, candidateSrc]);

  const renderPlaceholder = (overlay = false) => (
    <div
      className={`relative flex flex-col items-center justify-center gap-2 text-center ${
        overlay ? "px-4" : "px-5"
      }`}
    >
      <div className="absolute inset-x-3 top-1/2 hidden h-px -translate-y-5 bg-gradient-to-r from-transparent via-slate-300/75 to-transparent sm:block" />
      <ImageOff
        size={34}
        strokeWidth={1.7}
        className="relative text-slate-400/90"
        aria-hidden="true"
      />
      <span className="relative text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-[11px]">
        {noPhotoLabel}
      </span>
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
        className={`${className ?? ""} group relative overflow-hidden rounded-xl bg-[image:linear-gradient(160deg,#f8fafc,#f1f5f9)]`}
      >
        {showPlaceholderOverlay ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[image:linear-gradient(160deg,#f8fafc,#f1f5f9)]/92">
            {renderPlaceholder(true)}
          </div>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={candidateSrc}
          alt={alt}
          loading={loading}
          decoding={preferImmediateDecode ? "sync" : decoding}
          fetchPriority={fetchPriority}
          onLoad={handleImageLoad}
          onError={handleImageError}
          width={width}
          height={height}
          className={`h-full w-full object-contain transition-[opacity,transform] ${
            preferImmediateDecode ? "duration-100" : "duration-180"
          } ${
            isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-[1.01]"
          }`}
        />

        {canOpen ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
            title={openPhotoTitle}
          >
            <Maximize2 size={13} />
            {photoLabel}
          </button>
        ) : null}
      </div>

      {lightboxOpen && canOpen ? (
        <ImageModal src={candidateSrc} onClose={() => setLightboxOpen(false)} />
      ) : null}
    </>
  );
}
