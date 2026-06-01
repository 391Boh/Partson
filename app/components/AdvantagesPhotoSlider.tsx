"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
const PHOTO_AUTO_INTERVAL_MS = 5200;
const STORE_MAPS_URL =
  "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu&g_ep=EgoyMDI2MDUxNy4wIKXMDSoASAFQAw%3D%3D";

export default function AdvantagesPhotoSlider() {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [displayedPhotoIndex, setDisplayedPhotoIndex] = useState(0);
  const [previousPhotoIndex, setPreviousPhotoIndex] = useState<number | null>(null);
  const [showPreviousPhoto, setShowPreviousPhoto] = useState(false);
  const [isSliderActive, setIsSliderActive] = useState(true);
  const [manualSelectionVersion, setManualSelectionVersion] = useState(0);

  const goToPhoto = useCallback((index: number, source: "manual" | "auto" = "manual") => {
    const nextIndex =
      ((index % businessProfilePhotos.length) + businessProfilePhotos.length) %
      businessProfilePhotos.length;

    setActivePhotoIndex((current) => (current === nextIndex ? current : nextIndex));
    if (source === "manual") {
      setManualSelectionVersion((current) => current + 1);
    }
  }, []);

  const showPrevious = useCallback(() => {
    goToPhoto(activePhotoIndex - 1);
  }, [activePhotoIndex, goToPhoto]);

  const showNext = useCallback(() => {
    goToPhoto(activePhotoIndex + 1);
  }, [activePhotoIndex, goToPhoto]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const node = sliderRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSliderActive(Boolean(entry?.isIntersecting));
      },
      { rootMargin: "180px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isSliderActive || businessProfilePhotos.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActivePhotoIndex((current) =>
        current === businessProfilePhotos.length - 1 ? 0 : current + 1
      );
    }, PHOTO_AUTO_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isSliderActive, manualSelectionVersion]);

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
    <div
      ref={sliderRef}
      className="overflow-hidden rounded-[18px] border border-sky-200/80 bg-white/86 shadow-[0_16px_28px_rgba(56,189,248,0.12)] backdrop-blur-md transition-[background-image,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:border-cyan-100 group-hover/advantages:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,254,255,0.95),rgba(224,242,254,0.92))] group-hover/advantages:shadow-[0_22px_38px_rgba(14,165,233,0.16)]"
    >
      <div className="group/photo relative aspect-[4/3] w-full bg-slate-900/30 sm:w-[340px]">
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
          sizes="(min-width: 640px) 332px, (min-width: 1024px) 30vw, 100vw"
          quality={68}
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/42 to-transparent" />
        <button
          type="button"
          onClick={showPrevious}
          aria-label="Попереднє фото магазину"
          className="absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-slate-950/78 text-white shadow-[0_10px_26px_rgba(15,23,42,0.34),0_0_0_3px_rgba(255,255,255,0.28)] backdrop-blur-md transition-[background-color,transform,box-shadow] duration-200 hover:bg-slate-900 hover:shadow-[0_14px_32px_rgba(15,23,42,0.42),0_0_0_4px_rgba(255,255,255,0.34)] active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={showNext}
          aria-label="Наступне фото магазину"
          className="absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-slate-950/78 text-white shadow-[0_10px_26px_rgba(15,23,42,0.34),0_0_0_3px_rgba(255,255,255,0.28)] backdrop-blur-md transition-[background-color,transform,box-shadow] duration-200 hover:bg-slate-900 hover:shadow-[0_14px_32px_rgba(15,23,42,0.42),0_0_0_4px_rgba(255,255,255,0.34)] active:scale-95"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div className="border-t border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-4 py-3 transition-[background-image] duration-500 ease-out group-hover/advantages:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,254,255,0.96),rgba(224,242,254,0.94))]">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700/78">
              Фото магазину{" "}
              <Link
                href="/"
                className="font-extrabold text-sky-700 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-900"
              >
                PartsON
              </Link>
            </p>
            <a
              href={STORE_MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-[13px] font-semibold text-slate-700 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
            >
              Магазин на Перфецького, 8
            </a>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Тут можна отримати консультацію, оглянути товар і оформити замовлення на автозапчастини.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-slate-500">
              {displayedPhotoIndex + 1} / {businessProfilePhotos.length}
            </span>
            <div className="flex items-center gap-1.5">
            {businessProfilePhotos.map((_, index) => (
              <button
                key={`photo-dot-${index}`}
                type="button"
                onClick={() => goToPhoto(index)}
                aria-label={`Показати фото магазину ${index + 1}`}
                className={`inline-flex h-2.5 rounded-full transition-all duration-200 ${
                  index === activePhotoIndex
                    ? "w-7 bg-sky-600"
                    : "w-2.5 bg-sky-200 hover:bg-sky-300"
                }`}
              />
            ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
