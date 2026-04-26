"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const businessProfilePhotos = [
  "/storefront/photos/partson-store-1.jpg",
  "/storefront/photos/partson-store-2.jpg",
  "/storefront/photos/partson-store-3.jpg",
  "/storefront/photos/partson-store-4.jpg",
  "/storefront/photos/partson-store-5.jpg",
  "/storefront/photos/partson-store-6.jpg",
  "/storefront/photos/partson-store-7.jpg",
] as const;

const PHOTO_FADE_DURATION_MS = 480;

export default function AdvantagesPhotoSlider() {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [displayedPhotoIndex, setDisplayedPhotoIndex] = useState(0);
  const [previousPhotoIndex, setPreviousPhotoIndex] = useState<number | null>(null);
  const [showPreviousPhoto, setShowPreviousPhoto] = useState(false);

  useEffect(() => {
    if (businessProfilePhotos.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActivePhotoIndex((current) =>
        current === businessProfilePhotos.length - 1 ? 0 : current + 1
      );
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (activePhotoIndex === displayedPhotoIndex) return undefined;

    let frameId = 0;
    let timeoutId: number | null = null;
    let cancelled = false;
    const nextPhotoSrc = businessProfilePhotos[activePhotoIndex];

    const beginTransition = () => {
      if (cancelled) return;

      setPreviousPhotoIndex(displayedPhotoIndex);
      setShowPreviousPhoto(true);
      setDisplayedPhotoIndex(activePhotoIndex);

      frameId = window.requestAnimationFrame(() => {
        frameId = window.requestAnimationFrame(() => {
          if (cancelled) return;
          setShowPreviousPhoto(false);
        });
      });

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setPreviousPhotoIndex(null);
      }, PHOTO_FADE_DURATION_MS);
    };

    const preloadImage = new window.Image();
    preloadImage.src = nextPhotoSrc;

    if (typeof preloadImage.decode === "function") {
      void preloadImage
        .decode()
        .catch(() => {})
        .then(beginTransition);
    } else if (preloadImage.complete) {
      beginTransition();
    } else {
      preloadImage.onload = beginTransition;
      preloadImage.onerror = beginTransition;
    }

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      window.cancelAnimationFrame(frameId);
      preloadImage.onload = null;
      preloadImage.onerror = null;
    };
  }, [activePhotoIndex, displayedPhotoIndex]);

  const activePhotoSrc = businessProfilePhotos[displayedPhotoIndex];
  const previousPhotoSrc =
    previousPhotoIndex === null ? null : businessProfilePhotos[previousPhotoIndex];

  return (
    <div className="overflow-hidden rounded-[18px] border border-sky-200/80 bg-white/86 shadow-[0_16px_28px_rgba(56,189,248,0.12)] backdrop-blur-md transition-[background-image,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:border-cyan-100 group-hover/advantages:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,254,255,0.95),rgba(224,242,254,0.92))] group-hover/advantages:shadow-[0_22px_38px_rgba(14,165,233,0.16)]">
      <div className="relative aspect-[4/3] w-full bg-slate-900/30 lg:w-[332px]">
        {previousPhotoSrc ? (
          <Image
            src={previousPhotoSrc}
            alt=""
            aria-hidden="true"
            fill
            sizes="(min-width: 1280px) 332px, (min-width: 1024px) 30vw, 100vw"
            quality={68}
            className={`pointer-events-none z-10 object-cover transition-opacity ease-out ${
              showPreviousPhoto ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${PHOTO_FADE_DURATION_MS}ms` }}
          />
        ) : null}
        <Image
          src={activePhotoSrc}
          alt={`Фото магазину PartsON ${displayedPhotoIndex + 1}`}
          fill
          sizes="(min-width: 1280px) 332px, (min-width: 1024px) 30vw, 100vw"
          priority={displayedPhotoIndex === 0}
          quality={68}
          className="object-cover"
        />
      </div>

      <div className="flex items-start justify-between gap-3 border-t border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-4 py-3 transition-[background-image] duration-500 ease-out group-hover/advantages:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,254,255,0.96),rgba(224,242,254,0.94))]">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700/78">
            Фото магазину PartsON
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-700">
            Місце локації Перфецького 8
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          {businessProfilePhotos.map((_, index) => (
            <button
              key={`photo-dot-${index}`}
              type="button"
              onClick={() => setActivePhotoIndex(index)}
              aria-label={`Показати фото магазину ${index + 1}`}
              className={`h-2.5 rounded-full transition-all duration-200 ${
                index === activePhotoIndex
                  ? "w-6 bg-sky-600"
                  : "w-2.5 bg-sky-200 hover:bg-sky-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
