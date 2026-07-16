"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type StorePhoto = {
  src: string;
  alt: string;
  caption: string;
};

const storePhotos: StorePhoto[] = [
  {
    src: "/storefront/photos/partson-store-1.jpg",
    alt: "Фасад магазину PartsON у Львові з логотипами VW, Audi, BMW, Mercedes, Toyota, Honda, Hyundai, Skoda, Peugeot, Volvo, Kia",
    caption: "Вітрина на вул. Перфецького, 8 — понад 20 марок авто",
  },
  {
    src: "/storefront/photos/partson-store-2.jpg",
    alt: "Стенд автотоварів Bosch і Vitol: компресори, пускові пристрої, домкрати, буксирні троси",
    caption: "Автохімія та аксесуари Bosch, Vitol, Belauto",
  },
  {
    src: "/storefront/photos/partson-store-3.jpg",
    alt: "Полиця технічних рідин: гальмівна рідина Bosch, автохімія, трансмісійні оливи, антифриз Total, Mannol",
    caption: "Гальмівні рідини, автохімія, антифризи",
  },
  {
    src: "/storefront/photos/partson-store-4.jpg",
    alt: "Моторні оливи GM, Mercedes-Benz, Ford Motorcraft, ELF Evolution, Mobil Super у каталозі PartsON",
    caption: "Моторні оливи ELF, Mobil, Mercedes-Benz, Ford",
  },
  {
    src: "/storefront/photos/partson-store-5.jpg",
    alt: "Ремені генератора та ГРМ Bosch і Meyle в наявності",
    caption: "Ремені приводні та ГРМ Bosch, Meyle",
  },
  {
    src: "/storefront/photos/partson-store-6.jpg",
    alt: "Вітрина з датчиками, кріпленням, дрібними запчастинами та автоаксесуарами",
    caption: "Датчики, кріплення, дрібні запчастини",
  },
  {
    src: "/storefront/photos/partson-store-7.jpg",
    alt: "Щітки склоочисника Bosch Aerotwin і Twin в асортименті",
    caption: "Щітки склоочисника Bosch Aerotwin",
  },
];

const STORE_MAPS_URL =
  "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu&g_ep=EgoyMDI2MDUxNy4wIKXMDSoASAFQAw%3D%3D";
const AUTO_SCROLL_INTERVAL_MS = 5000;
const INTERACTION_COOLDOWN_MS = 7000;

type AdvantagesPhotoSliderProps = {
  ratingValue?: number;
  reviewCount?: number;
};

export default function AdvantagesPhotoSlider({
  ratingValue = 4.4,
  reviewCount = 0,
}: AdvantagesPhotoSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSliderVisible, setIsSliderVisible] = useState(false);
  const lastInteractionAtRef = useRef(0);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const dragFrameRef = useRef(0);
  const pendingScrollLeftRef = useRef<number | null>(null);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const track = trackRef.current;
    const card = cardRefs.current[index];
    if (!track || !card) return;

    const targetLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
    track.scrollTo({ left: Math.max(0, targetLeft), behavior });
  }, []);

  const markInteraction = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
  }, []);

  const showPrevious = useCallback(() => {
    markInteraction();
    scrollToIndex(Math.max(0, activeIndex - 1));
  }, [activeIndex, markInteraction, scrollToIndex]);

  const showNext = useCallback(() => {
    markInteraction();
    scrollToIndex(Math.min(storePhotos.length - 1, activeIndex + 1));
  }, [activeIndex, markInteraction, scrollToIndex]);

  // Track which card is centered/most visible to sync dots + arrow disabled state.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === "undefined") return undefined;

    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = cardRefs.current.findIndex((node) => node === entry.target);
          if (index === -1) continue;
          ratios.set(index, entry.intersectionRatio);
        }

        let bestIndex = 0;
        let bestRatio = -1;
        for (const [index, ratio] of ratios.entries()) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = index;
          }
        }
        setActiveIndex(bestIndex);
      },
      // A single mid threshold is enough to tell which card is most visible —
      // fewer callback firings per scroll frame than a dense threshold list.
      { root: track, threshold: 0.6 }
    );

    for (const card of cardRefs.current) {
      if (card) observer.observe(card);
    }

    return () => observer.disconnect();
  }, []);

  // Pause autoplay when the gallery scrolls out of view.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsSliderVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "160px 0px", threshold: 0.01 }
    );
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isSliderVisible || storePhotos.length <= 1) return undefined;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (Date.now() - lastInteractionAtRef.current < INTERACTION_COOLDOWN_MS) return;
      const nextIndex = activeIndex >= storePhotos.length - 1 ? 0 : activeIndex + 1;
      scrollToIndex(nextIndex);
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeIndex, isSliderVisible, scrollToIndex]);

  // Mouse drag-to-scroll for desktop pointers without a touchpad/touch surface.
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") return;
      const track = trackRef.current;
      if (!track) return;

      // Mark the interaction immediately, not just on release — otherwise autoplay
      // can fire mid-drag on a slow gesture and yank the scroll position.
      markInteraction();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: track.scrollLeft,
        moved: false,
      };
      track.setPointerCapture(event.pointerId);
    },
    [markInteraction]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > 3) drag.moved = true;

    // Batch to one scrollLeft write per animation frame instead of once per
    // pointermove (which can fire well above 60Hz) — keeps the drag smooth
    // without forcing a synchronous layout on every event.
    pendingScrollLeftRef.current = drag.startScrollLeft - deltaX;
    if (!dragFrameRef.current) {
      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = 0;
        const track = trackRef.current;
        if (track && pendingScrollLeftRef.current != null) {
          track.scrollLeft = pendingScrollLeftRef.current;
        }
      });
    }
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    const drag = dragStateRef.current;
    if (!track || !drag || drag.pointerId !== event.pointerId) return;

    track.releasePointerCapture(event.pointerId);
    if (drag.moved) markInteraction();
    dragStateRef.current = null;

    if (dragFrameRef.current) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = 0;
    }
    pendingScrollLeftRef.current = null;
  }, [markInteraction]);

  const handleTrackKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      }
    },
    [showNext, showPrevious]
  );

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700/80">
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
            className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-700 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden="true" />
            вул. Перфецького, 8, Львів
          </a>
        </div>

        {reviewCount > 0 ? (
          <a
            href={STORE_MAPS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1.5 text-[12px] font-bold text-amber-800 shadow-[0_6px_14px_rgba(245,158,11,0.14)] backdrop-blur-sm transition hover:border-amber-300 hover:bg-amber-50"
          >
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {ratingValue.toFixed(1)}
            <span className="font-semibold text-amber-700/80">
              · {reviewCount} відгуків Google
            </span>
          </a>
        ) : null}
      </div>

      <div className="group/gallery relative">
        <div
          ref={trackRef}
          role="region"
          aria-label="Фото магазину PartsON: гортайте вліво-вправо"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleTrackKeyDown}
          onWheel={markInteraction}
          onTouchStart={markInteraction}
          className="hide-scrollbar relative flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 pr-4 [cursor:grab] active:[cursor:grabbing] sm:gap-4"
          // pan-y alone blocks native horizontal touch scrolling on this
          // axis-snapped track — the pointer handlers below deliberately skip
          // touch (event.pointerType === "touch") and defer to native scroll,
          // so touch-action must allow both axes or swipe does nothing on phones.
          style={{ touchAction: "pan-x pan-y", overscrollBehaviorX: "contain" }}
        >
          {storePhotos.map((photo, index) => (
            <div
              key={photo.src}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              className="group/card relative aspect-[4/3] w-[78%] shrink-0 snap-center overflow-hidden rounded-[22px] bg-slate-900/10 shadow-[0_16px_30px_rgba(15,23,42,0.14)] ring-1 ring-inset ring-white/60 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(14,165,233,0.22)] sm:w-[300px] lg:w-[300px] xl:w-[320px]"
            >
              <span className="pointer-events-none absolute inset-0 z-10 rounded-[22px] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.5)] transition-[box-shadow] duration-300 group-hover/card:shadow-[inset_0_0_0_1.5px_rgba(56,189,248,0.7)]" />
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                draggable={false}
                sizes="(min-width: 1280px) 320px, (min-width: 1024px) 300px, (min-width: 640px) 300px, 78vw"
                quality={60}
                className="pointer-events-none select-none object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.05]"
                priority={index === 0}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent p-3.5 pt-10">
                <p className="text-[12.5px] font-semibold leading-snug text-white drop-shadow-sm">
                  {photo.caption}
                </p>
              </div>
              <span className="pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center rounded-full bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                {index + 1}/{storePhotos.length}
              </span>
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-cyan-50/95 to-transparent sm:w-16" />

        <button
          type="button"
          onClick={showPrevious}
          disabled={activeIndex === 0}
          aria-label="Попереднє фото магазину"
          className="absolute left-1.5 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-sky-200/40 bg-slate-900/85 text-white opacity-90 shadow-[0_8px_20px_rgba(8,15,32,0.32),0_0_0_3px_rgba(125,211,252,0.14)] transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-90 disabled:pointer-events-none disabled:opacity-0 sm:inline-flex sm:h-10 sm:w-10"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={showNext}
          disabled={activeIndex === storePhotos.length - 1}
          aria-label="Наступне фото магазину"
          className="absolute right-1.5 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-sky-200/40 bg-slate-900/85 text-white opacity-90 shadow-[0_8px_20px_rgba(8,15,32,0.32),0_0_0_3px_rgba(125,211,252,0.14)] transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-90 disabled:pointer-events-none disabled:opacity-0 sm:inline-flex sm:h-10 sm:w-10"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Тут можна отримати консультацію, оглянути товар і оформити замовлення на автозапчастини.
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {storePhotos.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => {
                markInteraction();
                scrollToIndex(index);
              }}
              aria-label={`Показати фото магазину ${index + 1}`}
              aria-current={index === activeIndex}
              className="group inline-flex min-h-[32px] min-w-[18px] items-center justify-center"
            >
              <span
                className={`block h-1.5 rounded-full transition-[width,background-color,box-shadow] duration-200 ease-out ${
                  index === activeIndex
                    ? "w-5 bg-sky-600 shadow-[0_0_0_3px_rgba(56,189,248,0.18)]"
                    : "w-1.5 bg-sky-200 group-hover:bg-sky-300"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
