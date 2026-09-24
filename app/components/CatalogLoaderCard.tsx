"use client";

import { useEffect, useMemo, useState } from "react";

import { pickRandomCachedProductImageSrcs } from "app/lib/product-image-client";

type CatalogLoaderCardProps = {
  label?: string;
  kicker?: string;
  className?: string;
};

const PHOTO_COUNT = 5;
const PHOTO_SLOT_MS = 1200;

export default function CatalogLoaderCard({
  label = "Завантажую каталог",
  kicker = "PartsON",
  className = "",
}: CatalogLoaderCardProps) {
  // Empty on the server and on a first-ever visit (nothing cached yet) —
  // in both cases we fall back to the plain orbit spinner below, so there's
  // no flash-of-different-loader between SSR and hydration.
  const [photoSrcs, setPhotoSrcs] = useState<string[]>([]);
  // A cached "success" entry doesn't guarantee the image is still servable
  // right now (server-side cache evicted, product deleted since) — drop any
  // src that actually fails to load instead of leaving a broken-image icon
  // spinning in the loader.
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setPhotoSrcs(pickRandomCachedProductImageSrcs(PHOTO_COUNT));
  }, []);

  const visibleSrcs = useMemo(
    () => photoSrcs.filter((src) => !failedSrcs.has(src)),
    [photoSrcs, failedSrcs]
  );

  const handlePhotoError = (src: string) => {
    setFailedSrcs((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  };

  // A single photo would spend most of the loop invisible under the shared
  // cycle keyframe (it only defines a 0-24% visible window per slot) — only
  // worth switching to the photo effect once there's more than one to cycle.
  const hasPhotos = visibleSrcs.length >= 2;
  const cycleDurationMs = visibleSrcs.length * PHOTO_SLOT_MS;

  return (
    <div
      className={`catalog-page-loader-card relative inline-flex min-w-[280px] items-center gap-4 rounded-[22px] bg-white/96 px-5 py-4 shadow-[0_22px_60px_rgba(14,165,233,0.16)] ring-1 ring-white/90 ${className}`}
    >
      <span className="catalog-page-loader-card-aurora" aria-hidden="true" />
      {hasPhotos ? (
        <span
          className="catalog-page-loader catalog-page-loader-photos relative z-10"
          aria-hidden="true"
        >
          <span className="catalog-page-loader-glow" />
          <span className="catalog-page-loader-ring" />
          <span className="catalog-page-loader-spark catalog-page-loader-spark-a" />
          <span className="catalog-page-loader-spark catalog-page-loader-spark-b" />
          <span className="catalog-page-loader-photo-stage">
            {visibleSrcs.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- already-cached decorative thumbnail, cycling too fast to benefit from next/image
              <img
                key={src}
                src={src}
                alt=""
                className="catalog-page-loader-photo"
                style={{
                  animationDuration: `${cycleDurationMs}ms`,
                  animationDelay: `${index * PHOTO_SLOT_MS}ms`,
                }}
                onError={() => handlePhotoError(src)}
              />
            ))}
            <span className="catalog-page-loader-shine" />
          </span>
        </span>
      ) : (
        <span className="catalog-page-loader relative z-10" aria-hidden="true">
          <i />
          <b />
          <em />
        </span>
      )}
      <span className="relative z-10 min-w-0 flex-1">
        <span className="catalog-page-loader-kicker block text-[10px] font-black uppercase tracking-[0.15em]">
          {kicker}
        </span>
        <span className="mt-0.5 block text-sm font-black leading-tight text-slate-800">
          {label}
          <span className="catalog-page-loader-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="catalog-loader-line mt-2 block" aria-hidden="true" />
      </span>
    </div>
  );
}
