"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronRight, Factory, Search, X } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import BrandsLogosBackdrop from "./BrandsLogosBackdrop";
import SectionPagination from "./SectionPagination";
import { useSectionReveal } from "app/lib/use-section-reveal";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";
import { pluralizeManufacturers, pluralizeProducts, pluralizeUk } from "app/lib/pluralize-uk";
import { brands } from "./brandsData";
import { getManufacturerCounts, type ManufacturerCountsApiPayload } from "app/lib/manufacturer-counts-client";

// 4 cols at every breakpoint, 2 rows per page.
const ITEMS_PER_PAGE = 6;
const SWIPE_INTENT_PX = 7;
const SWIPE_VELOCITY_THRESHOLD = 0.34;

const pluralizeBrandCount = pluralizeManufacturers;

const pluralizeProductCount = pluralizeProducts;

type BrandItem = {
  name: string;
  logo: string | null;
  description: string;
  productCount?: number;
  groupsCount?: number;
};
type ManufacturerCountsApiItem = NonNullable<ManufacturerCountsApiPayload["clientProducers"]>[number];
const BRAND_LOGO_FALLBACK_PATH = "/partson-mark-v3.webp";
const INITIAL_BRANDS: BrandItem[] = brands.map((brand) => ({
  name: brand.name,
  logo: brand.logo,
  description: brand.description,
}));
const HIDDEN_MANUFACTURER_NAMES = new Set(["контейнер", "контенер"]);

const isVisibleManufacturer = (name: string) =>
  !HIDDEN_MANUFACTURER_NAMES.has(name.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA"));

const buildSyncedBrandDescription = (item: ManufacturerCountsApiItem) => {
  const baseDescription = (item.description || "").replace(/\s+/g, " ").trim();
  if (baseDescription) return baseDescription;

  const productSummary =
    item.productCount > 0
      ? `${item.productCount.toLocaleString("uk-UA")} товарних позицій`
      : "товари виробника";
  const groupSummary =
    item.groupsCount > 0
      ? `${item.groupsCount.toLocaleString("uk-UA")} груп`
      : "групи каталогу";

  return `${item.label} у PartsON: ${productSummary}, ${groupSummary} і швидкий перехід до каталогу бренду.`;
};

const normalizeSyncedBrand = (item: ManufacturerCountsApiItem): BrandItem => ({
  name: item.label,
  logo: item.logoPath,
  description: buildSyncedBrandDescription(item),
  productCount: item.productCount,
  groupsCount: item.groupsCount,
});

const handleBrandLogoLoadError = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "1") return;
  image.dataset.fallbackApplied = "1";
  image.src = BRAND_LOGO_FALLBACK_PATH;
};

type BrandSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  // Collapse-to-button is owned by the parent (the "Швидкий пошук" trigger
  // — same pattern as AutoBrandSearchInput / ProductSearchInput): this
  // field only asks to be collapsed, it doesn't manage the toggle itself.
  onCollapse?: () => void;
};

// Same gradient-border, animated-placeholder search field as
// AutoBrandSearchInput (Auto.tsx) / ProductSearchInput (tovar.tsx), so all
// three "pick from a compact grid" components share one search language.
const BRAND_SEARCH_EXAMPLES = ["Bosch", "Brembo", "Continental", "Castrol", "Febi", "Sachs"];

const BrandSearchInput = memo(
  ({ value, onChange, className, onCollapse }: BrandSearchInputProps) => {
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState(BRAND_SEARCH_EXAMPLES[0] ?? "");

    useEffect(() => {
      if (value) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setAnimatedPlaceholder(BRAND_SEARCH_EXAMPLES[0]);
        return;
      }

      let exampleIndex = 0;
      let characterIndex = 0;
      let isDeleting = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        const example = BRAND_SEARCH_EXAMPLES[exampleIndex];
        characterIndex += isDeleting ? -1 : 1;
        setAnimatedPlaceholder(example.slice(0, characterIndex));

        let delay = isDeleting ? 38 : 68;
        if (!isDeleting && characterIndex >= example.length) {
          isDeleting = true;
          delay = 1350;
        } else if (isDeleting && characterIndex <= 0) {
          isDeleting = false;
          exampleIndex = (exampleIndex + 1) % BRAND_SEARCH_EXAMPLES.length;
          delay = 280;
        }
        timeoutId = setTimeout(tick, delay);
      };

      timeoutId = setTimeout(tick, 350);
      return () => clearTimeout(timeoutId);
    }, [value]);

    return (
      <label
        className={`group/bsearch relative block overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,#1d4ed8_0%,#3b82f6_45%,#38bdf8_100%)] bg-[length:180%_180%] bg-[position:0%_50%] p-[1.5px] shadow-[0_10px_26px_-10px_rgba(37,99,235,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[box-shadow,background-position] duration-300 ease-out hover:bg-[position:100%_50%] hover:shadow-[0_16px_36px_-12px_rgba(37,99,235,0.5)] focus-within:bg-[linear-gradient(135deg,#2563eb_0%,#38bdf8_50%,#22d3ee_100%)] focus-within:shadow-[0_16px_36px_-10px_rgba(37,99,235,0.45),0_0_0_3px_rgba(59,130,246,0.18)] ${className ?? ""}`}
      >
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 inline-flex -translate-y-1/2 items-center justify-center text-blue-600 transition-colors duration-300 group-focus-within/bsearch:text-blue-700">
          <Search size={17} strokeWidth={2.3} />
        </span>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onTouchStart={(e) => { e.currentTarget.focus(); }}
          onBlur={() => {
            if (!value) onCollapse?.();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (value) {
              onChange("");
            } else {
              onCollapse?.();
            }
          }}
          placeholder={animatedPlaceholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-label="Пошук виробника"
          className="h-10 w-full rounded-[13.5px] border-0 bg-white pl-10 pr-9 text-[14px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,1)] outline-none transition-[color] duration-300 placeholder:font-medium placeholder:text-slate-400 focus:text-slate-900 select-text sm:h-11"
        />

        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              onCollapse?.();
            }}
            aria-label="Очистити пошук"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={15} />
          </button>
        )}
      </label>
    );
  }
);

BrandSearchInput.displayName = "BrandSearchInput";

// Compact logo-only tile — same visual language as CarBrandButton (Auto.tsx)
// and the group cards (tovar.tsx): no name/description on the tile itself,
// selecting one reveals the details in BrandInfoPanel to the left of the
// grid instead of every card carrying its own description.
function BrandTile({
  brand,
  priority = false,
  isSelected,
  onSelect,
}: {
  brand: BrandItem;
  priority?: boolean;
  isSelected: boolean;
  onSelect: (brand: BrandItem) => void;
}) {
  return (
    <SmartLink
      href={buildManufacturerPath(buildSeoSlug(brand.name))}
      prefetchOnIntent
      title={brand.name}
      aria-label={`Обрати ${brand.name}`}
      onClick={(event) => {
        // Real crawlable href stays in the DOM for search engines, but a
        // plain left-click selects in place instead of navigating — middle
        // click / ctrl+click / shift+click still open it normally.
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.currentTarget.blur();
        onSelect(brand);
      }}
      onMouseLeave={(event) => event.currentTarget.blur()}
      className={`card-metal group/tile relative flex h-[138px] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[18px] px-2 shadow-[0_5px_14px_-4px_rgba(15,118,110,0.15),inset_0_1px_0_rgba(255,255,255,0.7)] transition-[background-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-[0_20px_44px_-16px_rgba(13,148,136,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 sm:h-[154px] ${
        isSelected
          ? "bg-white/85 shadow-[0_16px_36px_-16px_rgba(13,148,136,0.42),inset_0_1px_0_rgba(255,255,255,0.95)]"
          : "bg-white/35"
      }`}
    >
      <span
        className="pointer-events-none absolute inset-x-8 top-0 z-[3] h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,#14b8a6_30%,#ccfbf1_50%,#38bdf8_70%,transparent)] transition-opacity duration-300 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100"
        style={{ opacity: isSelected ? 1 : 0 }}
      />

      <span className="relative flex h-14 w-14 items-center justify-center transition-transform duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/tile:scale-[1.08] group-focus-visible/tile:scale-[1.08] sm:h-16 sm:w-16">
        {brand.logo ? (
          <Image
            src={brand.logo}
            alt={`Логотип виробника автозапчастин ${brand.name}`}
            width={120}
            height={78}
            quality={85}
            draggable={false}
            priority={priority}
            // Tiles only ever mount when their page is within the carousel's
            // virtualization window (Math.abs(pageIndex - safePage) <= 1
            // below) — that already caps how many images exist in the DOM
            // at once, so native lazy-loading on top of it just adds a
            // visible pop-in delay while swiping into a neighboring page
            // instead of having it ready ahead of time.
            loading={priority ? undefined : "lazy"}
            unoptimized={brand.logo.endsWith(".svg")}
            className="relative h-14 w-14 object-contain drop-shadow-[0_5px_9px_rgba(14,116,144,0.14)] transition-[filter] duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/tile:brightness-[1.08] group-hover/tile:saturate-[1.16] group-hover/tile:drop-shadow-[0_10px_18px_rgba(2,132,199,0.3)] group-focus-visible/tile:brightness-[1.08] group-focus-visible/tile:saturate-[1.16] sm:h-16 sm:w-16"
            style={{ imageRendering: "auto" }}
            sizes="(max-width: 640px) 44px, 52px"
            onError={handleBrandLogoLoadError}
          />
        ) : (
          <span className="text-[11px] font-black text-slate-600 tracking-tight leading-none text-center px-1">
            {brand.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
          </span>
        )}
      </span>
      {brand.productCount && brand.productCount > 0 ? (
        <span
          className={`relative whitespace-nowrap text-[11px] font-extrabold leading-none tabular-nums transition-colors duration-300 sm:text-[12px] ${
            isSelected ? "text-sky-700" : "text-slate-500 group-hover/tile:text-sky-700"
          }`}
        >
          {brand.productCount.toLocaleString("uk-UA")} {pluralizeProductCount(brand.productCount)}
        </span>
      ) : null}
    </SmartLink>
  );
}

// Detail panel to the right of the tile grid — shows the selected brand's
// logo, description, and stats, with a CTA into its catalog. Mirrors the
// "Швидкий пошук" card's rounded/border/shadow language above.
// Only ever mounted with a real brand now — the grid/detail swap in
// BrandCarousel below owns the "nothing selected yet" state instead of this
// component rendering an empty placeholder card for it.
function BrandInfoPanel({
  brand,
  onClose,
}: {
  brand: BrandItem;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-[220px] flex-col rounded-[20px] border border-blue-100 bg-white/75 p-4 shadow-[0_18px_44px_-22px_rgba(30,64,175,0.28),inset_0_1px_0_#fff] sm:p-5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={brand.name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-full flex-col"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              {brand.logo ? (
                <Image
                  src={brand.logo}
                  alt={`Логотип виробника автозапчастин ${brand.name}`}
                  width={64}
                  height={48}
                  quality={85}
                  unoptimized={brand.logo.endsWith(".svg")}
                  className="h-10 w-10 object-contain"
                  onError={handleBrandLogoLoadError}
                />
              ) : (
                <span className="text-[13px] font-black text-slate-600 tracking-tight">
                  {brand.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити деталі виробника"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>

          <h3 className="mt-3 text-[17px] font-extrabold leading-tight text-slate-900 sm:text-[19px]">
            {brand.name}
          </h3>

          <p className="mt-2 flex-1 text-[13px] leading-[1.65] text-slate-600 sm:text-[14px]">
            {brand.description}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-semibold text-slate-500">
            {typeof brand.productCount === "number" && brand.productCount > 0 ? (
              <span className="tabular-nums">
                {brand.productCount.toLocaleString("uk-UA")} {pluralizeProductCount(brand.productCount)}
              </span>
            ) : null}
            {typeof brand.groupsCount === "number" && brand.groupsCount > 0 ? (
              <span className="tabular-nums">
                {brand.groupsCount.toLocaleString("uk-UA")} {pluralizeUk(brand.groupsCount, "група", "групи", "груп")}
              </span>
            ) : null}
          </div>

          <SmartLink
            href={buildManufacturerPath(buildSeoSlug(brand.name))}
            prefetchOnIntent
            className="group/cta mt-4 inline-flex items-center justify-center gap-1.5 rounded-[13px] bg-[linear-gradient(135deg,#0d9488,#0284c7)] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(8,145,178,0.55)] transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0"
          >
            Перейти до каталогу
            <ArrowRight
              size={15}
              strokeWidth={2.6}
              className="transition-transform duration-300 group-hover/cta:translate-x-0.5"
            />
          </SmartLink>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

type BrandCarouselProps = {
  playEntranceAnimations?: boolean;
  initialSyncedBrands?: BrandItem[];
  onReady?: () => void;
};

export default function BrandCarousel({
  playEntranceAnimations = true,
  initialSyncedBrands,
  onReady,
}: BrandCarouselProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const { ref: brandsRevealRef, className: brandsRevealClassName } =
    useSectionReveal<HTMLDivElement>();
  const [search, setSearch] = useState("");
  // Search starts collapsed to a trigger button, same "Швидкий пошук"
  // pattern as Auto.tsx/tovar.tsx — expands into the field on click.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedBrand, setSelectedBrand] = useState<BrandItem | null>(null);
  const [syncedBrands, setSyncedBrands] = useState<BrandItem[]>(
    initialSyncedBrands && initialSyncedBrands.length > 0 ? initialSyncedBrands : INITIAL_BRANDS
  );
  const [isSyncReady, setIsSyncReady] = useState(
    Boolean(initialSyncedBrands && initialSyncedBrands.length > 0)
  );

  useEffect(() => {
    if (isSyncReady) onReady?.();
  }, [isSyncReady, onReady]);

  const itemsPerPage = ITEMS_PER_PAGE;
  const filteredBrands = useMemo(
    () =>
      syncedBrands.filter(
        (brand) =>
          isVisibleManufacturer(brand.name) &&
          brand.name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [search, syncedBrands]
  );

  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / itemsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const brandPages = useMemo(() => {
    const pages: BrandItem[][] = [];
    for (let index = 0; index < filteredBrands.length; index += itemsPerPage) {
      pages.push(filteredBrands.slice(index, index + itemsPerPage));
    }
    return pages.length > 0 ? pages : ([[]] as BrandItem[][]);
  }, [filteredBrands, itemsPerPage]);
  const canGoPrev = safePage > 0;
  const canGoNext = safePage < totalPages - 1;

  const brandPagesRef = useRef<HTMLDivElement | null>(null);
  const suppressBrandClickRef = useRef(false);
  const swipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    startScrollLeft: number;
    startPage: number;
    dragging: boolean;
    rejected: boolean;
  } | null>(null);
  const getBrandPageWidth = useCallback(() => {
    const container = brandPagesRef.current;
    if (!container) return 0;
    const el = container.querySelector<HTMLElement>("[data-brand-page]");
    return el?.offsetWidth ?? container.clientWidth;
  }, []);
  const scrollToBrandPage = useCallback(
    (targetPage: number, behavior: ScrollBehavior = "smooth") => {
      const container = brandPagesRef.current;
      if (!container) return;
      const pageWidth = getBrandPageWidth();
      if (!pageWidth) return;
      container.scrollTo({ left: targetPage * pageWidth, behavior });
    },
    [getBrandPageWidth]
  );

  const handleBrandPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      const container = brandPagesRef.current;
      if (!container) return;

      suppressBrandClickRef.current = false;
      swipeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastAt: event.timeStamp,
        velocityX: 0,
        startScrollLeft: container.scrollLeft,
        startPage: safePage,
        dragging: false,
        rejected: false,
      };
    },
    [safePage]
  );

  const handleBrandPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = swipeRef.current;
      const container = brandPagesRef.current;
      if (!gesture || !container || gesture.pointerId !== event.pointerId || gesture.rejected) return;

      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (!gesture.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_INTENT_PX) return;
        if (Math.abs(dy) >= Math.abs(dx) * 0.9) {
          // This is a page scroll, not a carousel gesture. Never capture it.
          gesture.rejected = true;
          return;
        }
        gesture.dragging = true;
        suppressBrandClickRef.current = true;
        container.setPointerCapture(event.pointerId);
        container.style.scrollSnapType = "none";
        container.classList.add("is-dragging");
      }

      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - gesture.lastAt);
      const instantVelocity = (event.clientX - gesture.lastX) / elapsed;
      gesture.velocityX = gesture.velocityX * 0.72 + instantVelocity * 0.28;
      gesture.lastX = event.clientX;
      gesture.lastAt = event.timeStamp;

      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      let nextLeft = gesture.startScrollLeft - dx;
      // A restrained rubber-band at the ends confirms the boundary without
      // allowing the content to fly away from the controls.
      if (nextLeft < 0) nextLeft *= 0.24;
      if (nextLeft > maxScrollLeft) {
        nextLeft = maxScrollLeft + (nextLeft - maxScrollLeft) * 0.24;
      }
      container.scrollLeft = nextLeft;
    },
    []
  );

  const finishBrandSwipe = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = swipeRef.current;
      const container = brandPagesRef.current;
      if (!gesture || !container || gesture.pointerId !== event.pointerId) return;
      swipeRef.current = null;

      if (!gesture.dragging) return;
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      container.style.scrollSnapType = "";
      container.classList.remove("is-dragging");

      const pageWidth = getBrandPageWidth();
      if (!pageWidth) return;
      const displacement = gesture.startX - event.clientX;
      const distanceThreshold = Math.max(34, pageWidth * 0.12);
      const hasDistance = Math.abs(displacement) >= distanceThreshold;
      const hasVelocity = Math.abs(gesture.velocityX) >= SWIPE_VELOCITY_THRESHOLD;
      let targetPage = gesture.startPage;

      if (hasDistance || hasVelocity) {
        const direction = hasVelocity
          ? gesture.velocityX < 0 ? 1 : -1
          : displacement > 0 ? 1 : -1;
        targetPage += direction;
      }

      targetPage = Math.max(0, Math.min(totalPages - 1, targetPage));
      setPage(targetPage);
      scrollToBrandPage(targetPage, "smooth");
    },
    [getBrandPageWidth, scrollToBrandPage, totalPages]
  );

  const cancelBrandSwipe = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = swipeRef.current;
    const container = brandPagesRef.current;
    if (!gesture || !container || gesture.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    container.style.scrollSnapType = "";
    container.classList.remove("is-dragging");
    if (gesture.dragging) {
      setPage(gesture.startPage);
      scrollToBrandPage(gesture.startPage, "smooth");
    }
  }, [scrollToBrandPage]);
  // Native scroll fires many times per second — updating page state on every
  // tick re-renders the whole carousel and, right at a page boundary, can
  // flip safePage back and forth as scrollLeft jitters around the rounding
  // threshold. Each flip mounts/unmounts a page at the edge of the
  // virtualization window below, which reads as flicker mid-scroll.
  // Coalescing to one state update per animation frame smooths that out.
  const scrollRafRef = useRef<number | null>(null);
  const handleBrandPagesScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = brandPagesRef.current;
      if (!container) return;
      const pageWidth = getBrandPageWidth();
      if (!pageWidth) return;
      const nextPage = Math.max(
        0,
        Math.min(totalPages - 1, Math.round(container.scrollLeft / pageWidth))
      );
      setPage((prev) => (prev === nextPage ? prev : nextPage));
    });
  }, [totalPages, getBrandPageWidth]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPage(0);
    setSelectedBrand(null);
    const container = brandPagesRef.current;
    if (!container) return;
    container.scrollTo({ left: 0, behavior: "auto" });
  }, [search, itemsPerPage]);

  useEffect(() => {
    if (page > totalPages - 1) {
      const clamped = Math.max(0, totalPages - 1);
      setPage(clamped);
      scrollToBrandPage(clamped, "auto");
    }
  }, [page, totalPages, scrollToBrandPage]);

  useEffect(() => {
    // Skip the fetch only when the server already provided the real, synced
    // list as a prop — fetching again would just replace it with an
    // equivalent copy a moment later, causing a visible reorder/flicker for
    // no benefit. app/page.tsx passes this synchronized snapshot on the
    // homepage, so the selector is complete on its first visible render.
    //
    // Deliberately no ref-based "already fetched" guard here: under React's
    // Strict Mode dev double-invoke (mount → cleanup → mount), a ref set by
    // the first (torn-down) invocation would still read true on the second,
    // real invocation and permanently block the fetch — the counts would
    // just never load. `cancelled` below already makes a stale response's
    // setState a no-op, which is all the de-duplication this needs.
    if (initialSyncedBrands && initialSyncedBrands.length > 0) {
      setIsSyncReady(true);
      return;
    }

    let cancelled = false;

    getManufacturerCounts()
      .then((payload: ManufacturerCountsApiPayload | null) => {
        if (cancelled) return;
        const items = payload?.clientProducers;
        if (!Array.isArray(items) || items.length === 0) return;
        setSyncedBrands(items.map(normalizeSyncedBrand));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsSyncReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initialSyncedBrands]);

  const handlePrevPage = useCallback(() => {
    if (!canGoPrev) return;
    const nextPage = Math.max(0, safePage - 1);
    setPage(nextPage);
    scrollToBrandPage(nextPage);
  }, [canGoPrev, safePage, scrollToBrandPage]);

  const handleNextPage = useCallback(() => {
    if (!canGoNext) return;
    const nextPage = Math.min(totalPages - 1, safePage + 1);
    setPage(nextPage);
    scrollToBrandPage(nextPage);
  }, [canGoNext, totalPages, safePage, scrollToBrandPage]);

  return (
    <section
      className="home-glow-section home-glow-section-brands font-ui group/brandcars relative isolate w-full select-none overflow-hidden border-y border-cyan-100/70 bg-[radial-gradient(150%_120%_at_-25%_-30%,rgba(34,211,238,0.1),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(20,184,166,0.09),transparent_64%),linear-gradient(179deg,#e6f1fb_0%,#eaf5fb_44%,#e3f4f1_100%)] pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(13,148,136,0.09),0_14px_36px_-16px_rgba(15,118,110,0.12)] transition-[border-color,box-shadow] duration-[600ms] ease-out hover:border-cyan-300/80 hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(13,148,136,0.22),inset_0_0_120px_-46px_rgba(34,211,238,0.48),0_28px_60px_-22px_rgba(15,118,110,0.3)] sm:pb-6 sm:pt-6"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <BrandsLogosBackdrop />
      {/* edge bridges — blend into the categories section above and the
          store (teal) section below */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[linear-gradient(to_bottom,rgba(214,238,246,0.55)_0%,rgba(214,238,246,0.1)_58%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-14 bg-[linear-gradient(to_bottom,transparent_0%,rgba(206,244,240,0.6)_100%)]" />
      {/* section hover — the panel lights up: a cyan / teal bloom swells in and a
          bright band sweeps across */}
      <div className="home-scroll-decor pointer-events-none absolute -inset-8 z-0 opacity-0 transition-[opacity,transform] duration-[600ms] ease-out group-hover/brandcars:opacity-100 group-hover/brandcars:scale-[1.04] bg-[radial-gradient(circle_at_9%_12%,rgba(34,211,238,0.32),transparent_42%),radial-gradient(circle_at_92%_84%,rgba(20,184,166,0.28),transparent_40%),radial-gradient(circle_at_50%_-8%,rgba(56,189,248,0.18),transparent_44%),radial-gradient(circle_at_52%_112%,rgba(45,212,191,0.16),transparent_58%)]" />
      <div className="home-scroll-decor pointer-events-none absolute inset-y-0 -left-1/3 z-[1] w-2/3 -translate-x-1/4 opacity-0 transition-[opacity,transform] duration-[900ms] ease-out group-hover/brandcars:translate-x-[70%] group-hover/brandcars:opacity-100 bg-[linear-gradient(105deg,transparent_0%,rgba(103,232,249,0.16)_38%,rgba(255,255,255,0.34)_50%,rgba(45,212,191,0.14)_62%,transparent_100%)]" />
      {/* machined panel edges + one diagonal light streak — a touch of metal */}
      <span className="home-scroll-decor pointer-events-none absolute inset-x-0 top-0 z-[2] h-[3px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.95),rgba(255,255,255,0.32)_46%,transparent)] transition-[box-shadow] duration-500 group-hover/brandcars:shadow-[0_0_22px_rgba(34,211,238,0.75)]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[2px] bg-[linear-gradient(to_top,rgba(15,118,110,0.18),transparent)]" />
      <span className="pointer-events-none absolute inset-0 z-[1] opacity-60 bg-[linear-gradient(101deg,transparent_0%,transparent_33%,rgba(255,255,255,0.24)_47%,rgba(255,255,255,0.32)_50%,rgba(255,255,255,0.2)_53%,transparent_66%,transparent_100%)]" />
      <motion.div
        ref={brandsRevealRef}
        className={`section-reveal-brands ${brandsRevealClassName} page-shell-inline relative z-10 flex flex-col gap-3 sm:gap-4`}
        initial={shouldAnimate ? { opacity: 0, y: 14 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
        transition={shouldAnimate ? { duration: 0.32, ease: "easeOut" } : undefined}
      >
        {/* DOM order keeps the heading first (mobile stacking + reading
            order match Auto.tsx's own reveal-head/reveal-search pair), but
            visually at lg: the tile list now sits on the left and the
            heading+search card on the right — order-1/order-2, same idiom
            Auto.tsx already uses for this exact swap. */}
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-8">
          <div className="reveal-head relative min-w-0 overflow-hidden rounded-[26px] border border-blue-100 bg-[linear-gradient(165deg,rgba(255,255,255,0.94)_0%,rgba(240,249,255,0.86)_58%,rgba(224,242,254,0.82)_100%)] p-5 shadow-[0_18px_46px_-26px_rgba(30,64,175,0.32),inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-6 lg:order-2 lg:p-7">
            <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
            {/* Soft glow anchored behind the heading — a light, blurred wash
                (not a hard shape) so the title lifts off the card without
                fighting the text's own contrast. Clipped by the card's own
                overflow-hidden, painted before the text in DOM order so it
                never needs z-index. */}
            <span className="pointer-events-none absolute -left-6 top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.22),transparent_70%)] blur-2xl" aria-hidden="true" />
            {/* Simple icon + text, matching HeroIntroCard's eyebrow — no
                trailing hairline (Hero doesn't have one either). */}
            <div className="flex items-center gap-3">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 via-sky-500 to-sky-400 text-white shadow-[0_12px_28px_-8px_rgba(13,148,136,0.6),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_6px_-2px_rgba(4,47,46,0.45)] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.6),transparent_52%)]">
                {/* Original simple line-art factory mark (sawtooth roof +
                    chimney) — same style language as HeroIntroCard's own
                    custom eyebrow SVG and the other homepage sections'
                    eyebrow icons, instead of a generic lucide-react glyph. */}
                <svg viewBox="0 0 24 24" className="relative h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 21V10.5l4.5 3v-3l4.5 3v-3l4.5 3v7.5" />
                  <path d="M3 21h18" />
                  <path d="M16.5 10.5V6.5h3.5v4" />
                </svg>
              </span>
              <span className="text-[11px] font-extrabold uppercase leading-none tracking-[0.2em] text-blue-600">
                Виробники
              </span>
            </div>

            <h2 className="relative font-display mt-4 text-[25px] font-black leading-[1.08] tracking-[-0.02em] text-slate-950 [text-shadow:0_1px_0_#fff] min-[480px]:text-[28px] sm:text-[33px] lg:text-[28px] xl:text-[32px]">
              Виробники автозапчастин:{" "}
              <span className="text-blue-600">оригінали та аналоги</span>
            </h2>
            <span className="mt-4 block h-[3px] w-20 rounded-full bg-[linear-gradient(90deg,#0d9488_0%,#14b8a6_26%,#ccfbf1_46%,#38bdf8_64%,transparent_100%)] shadow-[0_1px_2px_rgba(15,118,110,0.28)]" />
            {/* lead — cites the real catalog size (brands.length, not a
                hardcoded figure) instead of the old vague "з переходом до
                каталогу бренду" closer, which described the click-through
                rather than giving the reader any actual information. */}
            <p className="mt-4 max-w-[46ch] text-[15px] font-medium leading-[1.68] text-slate-700 [text-shadow:0_1px_0_#fff] sm:text-[16px]">
              <span className="font-semibold text-slate-800">{brands.length}+ виробників</span> —
              оригінальні запчастини та перевірені{" "}
              <span className="font-semibold text-blue-700">аналоги</span> для
              кожної марки авто.
            </p>

            {/* Search — collapse-to-button, same pattern as Auto.tsx's
                "Швидкий пошук" / tovar.tsx's category search: starts as a
                trigger pill, expands into the field on click. "Усі
                виробники" sits right under it as one consistent action set,
                like "Усі марки автомобілів" under Auto's search field. */}
            <div className="mt-5">
              <AnimatePresence mode="wait" initial={false}>
                {!isSearchOpen ? (
                  <motion.div
                    key="buttons"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
                    className="grid grid-cols-1 min-[420px]:grid-cols-2 items-stretch gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.blur();
                        setIsSearchOpen(true);
                      }}
                      onMouseLeave={(event) => event.currentTarget.blur()}
                      className="group/trigger inline-flex items-center gap-3 rounded-[16px] border border-blue-200/80 bg-white/70 px-3.5 py-3 text-left shadow-[0_10px_26px_-14px_rgba(30,64,175,0.32)] backdrop-blur-sm transition-colors duration-200 ease-out hover:border-blue-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-200/70 bg-blue-100 text-blue-600 shadow-[0_0_16px_rgba(59,130,246,0.16)] transition-[background-color,border-color,transform] duration-200 ease-out group-hover/trigger:scale-[1.06] group-hover/trigger:border-blue-300 group-hover/trigger:bg-blue-200">
                        <Search size={16} strokeWidth={2.2} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[9.5px] font-black uppercase tracking-[0.14em] text-blue-500/80">Пошук у каталозі</span>
                        <span className="block text-[14.5px] font-black leading-tight text-slate-800">Пошук виробника</span>
                      </span>
                      <ChevronRight
                        size={16}
                        strokeWidth={3}
                        aria-hidden
                        className="shrink-0 text-blue-400 transition-transform duration-200 ease-out group-hover/trigger:translate-x-1"
                      />
                    </button>

                    <SmartLink
                      href="/manufacturers"
                      prefetchOnIntent
                      onClick={(event) => event.currentTarget.blur()}
                      onMouseLeave={(event) => event.currentTarget.blur()}
                      className="group/allbrands inline-flex items-center gap-3 rounded-[16px] border border-blue-200/80 bg-white/70 px-3.5 py-3 shadow-[0_10px_26px_-14px_rgba(30,64,175,0.32)] backdrop-blur-sm transition-colors duration-200 ease-out hover:border-blue-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-200/70 bg-blue-100 text-blue-600 shadow-[0_0_16px_rgba(59,130,246,0.16)] transition-[background-color,border-color,transform] duration-200 ease-out group-hover/allbrands:scale-[1.06] group-hover/allbrands:border-blue-300 group-hover/allbrands:bg-blue-200">
                        <Factory size={16} strokeWidth={2.2} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[9.5px] font-black uppercase tracking-[0.14em] text-blue-500/80">Каталог за виробником</span>
                        <span className="block text-[14.5px] font-black leading-tight text-slate-800">Усі виробники</span>
                      </span>
                      <ChevronRight
                        size={16}
                        strokeWidth={3}
                        aria-hidden
                        className="shrink-0 text-blue-400 transition-transform duration-200 ease-out group-hover/allbrands:translate-x-1"
                      />
                    </SmartLink>
                  </motion.div>
                ) : (
                  <motion.div
                    key="field"
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
                  >
                    <BrandSearchInput value={search} onChange={setSearch} onCollapse={() => setIsSearchOpen(false)} />
                  </motion.div>
                )}
              </AnimatePresence>

              <span className="mt-2.5 block px-0.5 text-[11px] font-medium text-slate-600">
                {search.trim() ? "Знайдено " : "Доступно для пошуку: "}
                <strong className="font-extrabold tabular-nums text-blue-700">
                  {filteredBrands.length.toLocaleString("uk-UA")}
                </strong>{" "}
                {pluralizeBrandCount(filteredBrands.length)}
              </span>
            </div>
          </div>

          {/* Selecting a tile now swaps the whole grid area for the detail
              panel in place (AnimatePresence, one column, one shared
              horizontal inset) instead of stacking an often-empty panel
              underneath a full-width grid — the two states share this same
              px-7/sm:px-10 inset so a tile's card and the panel's border
              land on the exact same edges, with no swap-triggered width
              jump. Arrow buttons only render inside the grid state (they
              have no purpose over the detail panel), so this wrapper being
              their `relative` positioning root the whole time is harmless
              while the panel is showing — nothing else inside is absolute. */}
          <div className="relative min-w-0 px-7 sm:px-10 lg:order-1">
            <AnimatePresence mode="wait" initial={false}>
              {selectedBrand ? (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                >
                  <BrandInfoPanel brand={selectedBrand} onClose={() => setSelectedBrand(null)} />
                </motion.div>
              ) : filteredBrands.length === 0 ? (
                <motion.div
                  key="empty-search"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex min-h-[200px] items-center justify-center text-center text-sm text-slate-600"
                >
                  {"За цим запитом виробників не знайдено."}
                </motion.div>
              ) : (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div
                    ref={brandPagesRef}
                    onScroll={handleBrandPagesScroll}
                    onPointerDown={handleBrandPointerDown}
                    onPointerMove={handleBrandPointerMove}
                    onPointerUp={finishBrandSwipe}
                    onPointerCancel={cancelBrandSwipe}
                    onClickCapture={(event) => {
                      if (!suppressBrandClickRef.current) return;
                      event.preventDefault();
                      event.stopPropagation();
                      suppressBrandClickRef.current = false;
                    }}
                    role="region"
                    aria-label="Сторінки виробників"
                    className="brand-pages-swipe no-scrollbar cursor-grab touch-pan-y select-none overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
                  >
                    <div className="flex">
                      {(brandPages as BrandItem[][]).map((pageBrands, pageIndex) => (
                        <div
                          key={pageIndex}
                          data-brand-page
                          role="group"
                          aria-label={`Сторінка ${pageIndex + 1} з ${totalPages}`}
                          className="w-full min-w-0 shrink-0 snap-start bg-transparent px-1.5 [scroll-snap-stop:always] sm:px-2"
                        >
                          {Math.abs(pageIndex - safePage) <= 1 ? (
                            <div className={`grid grid-cols-3 gap-2.5 place-items-stretch sm:gap-3${pageIndex === 0 ? " reveal-grid" : ""}`}>
                              {pageBrands.map((brand: BrandItem, idx: number) => (
                                <BrandTile
                                  key={`${brand.name}-${pageIndex}-${idx}`}
                                  brand={brand}
                                  priority={pageIndex === 0 && idx < 4}
                                  isSelected={Boolean(selectedBrand) && selectedBrand!.name === brand.name}
                                  onSelect={setSelectedBrand}
                                />
                              ))}
                            </div>
                          ) : (
                            <div
                              className="h-[98px] bg-transparent sm:h-[110px]"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="reveal-tail mt-3 flex min-h-9 items-center justify-center">
                    <SectionPagination
                      page={safePage + 1}
                      totalPages={totalPages}
                      onPrev={handlePrevPage}
                      onNext={handleNextPage}
                      canGoPrev={canGoPrev}
                      canGoNext={canGoNext}
                      tone="blue"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
