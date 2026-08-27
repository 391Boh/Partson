"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import { buildCatalogProducerPath, buildManufacturerPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";
import { pluralizeManufacturers, pluralizeProducts, pluralizeUk } from "app/lib/pluralize-uk";
import { brands } from "./brandsData";

// 4 cols at every breakpoint, 2 rows per page.
const ITEMS_PER_PAGE = 8;

const pluralizeBrandCount = pluralizeManufacturers;

const pluralizeProductCount = pluralizeProducts;

type BrandItem = {
  name: string;
  logo: string | null;
  description: string;
  productCount?: number;
  groupsCount?: number;
};
type ManufacturerCountsApiItem = {
  label: string;
  logoPath: string | null;
  description: string | null;
  productCount: number;
  groupsCount: number;
};
type ManufacturerCountsApiPayload = {
  clientProducers?: ManufacturerCountsApiItem[];
};
const BRAND_LOGO_FALLBACK_PATH = "/favicon-partson-v2-192.png";
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
};

// Same gradient-border, animated-placeholder search field as
// AutoBrandSearchInput (Auto.tsx) / ProductSearchInput (tovar.tsx), so all
// three "pick from a compact grid" components share one search language.
const BRAND_SEARCH_EXAMPLES = ["Bosch", "Brembo", "Continental", "Castrol", "Febi", "Sachs"];

const BrandSearchInput = memo(
  ({ value, onChange, className }: BrandSearchInputProps) => {
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
        className={`relative block rounded-[18px] bg-[linear-gradient(135deg,#0284c7,#22d3ee)] p-[2px] shadow-[0_12px_28px_rgba(2,132,199,0.2),0_0_0_3px_rgba(255,255,255,0.78)] transition-[box-shadow,background-image] duration-300 focus-within:bg-[linear-gradient(135deg,#0ea5e9_0%,#38bdf8_48%,#2dd4bf_100%)] focus-within:shadow-[0_15px_34px_rgba(14,165,233,0.24),0_0_0_4px_rgba(125,211,252,0.14)] ${className ?? ""}`}
      >
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 inline-flex -translate-y-1/2 items-center justify-center text-sky-700">
          <Search size={19} strokeWidth={2.2} />
        </span>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onTouchStart={(e) => { e.currentTarget.focus(); }}
          placeholder={animatedPlaceholder}
          autoComplete="off"
          spellCheck={false}
          aria-label="Пошук виробника"
          className="h-11 w-full rounded-[16px] border-0 bg-white pl-11 pr-10 text-[15px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,1)] outline-none transition-[background-color,box-shadow] duration-300 placeholder:font-medium placeholder:text-slate-400 focus:bg-white focus:text-slate-800 focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,1)] select-text sm:h-12"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Очистити пошук"
            className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
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
      className={`group/tile relative flex h-[92px] w-full flex-col items-center justify-center overflow-hidden rounded-[16px] border px-2 shadow-[0_8px_18px_rgba(15,23,42,0.08),0_2px_7px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-white/90 transition-[border-color,background-color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 sm:h-[104px] ${
        isSelected
          ? "border-sky-500 bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.68),transparent_52%),linear-gradient(150deg,#ffffff_0%,#e6f8ff_52%,#dbeafe_100%)] shadow-[0_16px_30px_rgba(2,132,199,0.22),0_0_0_3px_rgba(34,211,238,0.14),inset_0_1px_0_rgba(255,255,255,1)]"
          : "border-sky-200/95 bg-[radial-gradient(circle_at_50%_-8%,rgba(125,211,252,0.44),transparent_48%),linear-gradient(150deg,#ffffff_0%,#f3faff_50%,#e9f8ff_100%)] hover:border-cyan-400 hover:bg-[radial-gradient(circle_at_50%_-8%,rgba(103,232,249,0.76),transparent_54%),linear-gradient(150deg,#ffffff_0%,#e4f7ff_50%,#dcfce7_145%)] hover:shadow-[0_20px_36px_rgba(2,132,199,0.26),0_8px_16px_rgba(20,184,166,0.12),0_0_0_3px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,1)]"
      }`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.9),transparent_46%),linear-gradient(180deg,rgba(34,211,238,0.08),rgba(59,130,246,0.1))] opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_115%,rgba(20,184,166,0.3),transparent_68%)] opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100" />
      <span className="pointer-events-none absolute inset-x-5 top-0 h-[3px] origin-center scale-x-0 rounded-b-full bg-gradient-to-r from-sky-500 via-cyan-300 to-emerald-400 opacity-0 shadow-[0_3px_12px_rgba(34,211,238,0.5)] transition-[transform,opacity] duration-300 group-hover/tile:scale-x-100 group-hover/tile:opacity-100 group-focus-visible/tile:scale-x-100 group-focus-visible/tile:opacity-100" />
      <span className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-0 transition-[transform,opacity] duration-500 ease-out group-hover/tile:translate-x-[470%] group-hover/tile:opacity-70" />
      <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 translate-x-1 items-center justify-center rounded-full border border-cyan-300/80 bg-white/90 text-cyan-700 opacity-0 shadow-[0_5px_12px_rgba(8,145,178,0.2)] transition-[transform,opacity] duration-300 group-hover/tile:translate-x-0 group-hover/tile:opacity-100 group-focus-visible/tile:translate-x-0 group-focus-visible/tile:opacity-100">
        <ArrowRight size={11} strokeWidth={3} aria-hidden />
      </span>
      <span className="relative flex h-11 w-11 items-center justify-center transition-transform duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/tile:scale-[1.08] group-focus-visible/tile:scale-[1.08] sm:h-[52px] sm:w-[52px]">
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
            className="relative h-11 w-11 object-contain drop-shadow-[0_5px_9px_rgba(14,116,144,0.14)] transition-[filter] duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/tile:brightness-[1.08] group-hover/tile:saturate-[1.16] group-hover/tile:drop-shadow-[0_10px_18px_rgba(2,132,199,0.34)] group-focus-visible/tile:brightness-[1.08] group-focus-visible/tile:saturate-[1.16] sm:h-[52px] sm:w-[52px]"
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
          className={`relative mt-1.5 whitespace-nowrap text-[11px] font-extrabold leading-none tabular-nums transition-colors duration-300 sm:text-[12px] ${
            isSelected ? "text-sky-700" : "text-slate-600 group-hover/tile:text-sky-700"
          }`}
        >
          {brand.productCount.toLocaleString("uk-UA")} {pluralizeProductCount(brand.productCount)}
        </span>
      ) : null}
    </SmartLink>
  );
}

// Revealed under the grid once a tile is selected — mirrors how Auto.tsx
// shows the model list only after a brand is picked, instead of every card
// carrying its own description inline.
// Sits to the right of the grid (mirrors the nav panel next to the
// brand/model grid in Auto.tsx): shows a neutral prompt until a manufacturer
// is picked, then its heading, description and CTA appear here instead of in
// the grid itself, keeping the tile grid compact and description-free. Pure
// text, no card container or decorative icon.
function BrandInfoPanel({
  brand,
  onClose,
}: {
  brand: BrandItem | null;
  onClose: () => void;
}) {
  return (
    <div className="group/choice relative flex h-full min-h-[150px] flex-col justify-center overflow-hidden rounded-[20px] border border-white/90 bg-[radial-gradient(circle_at_100%_0%,rgba(103,232,249,0.22),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.9))] px-4 py-4 shadow-[0_14px_30px_rgba(14,116,144,0.1),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-sky-100/70 transition-[background-image,border-color,box-shadow] duration-300 hover:border-cyan-300 hover:bg-[radial-gradient(circle_at_12%_0%,rgba(45,212,191,0.24),transparent_42%),radial-gradient(circle_at_100%_10%,rgba(56,189,248,0.30),transparent_45%),linear-gradient(145deg,#ffffff,#e5f8ff_55%,#e5fbf5)] hover:shadow-[0_20px_42px_rgba(2,132,199,0.17),inset_0_1px_0_white] focus-within:border-cyan-300 sm:px-5">
      {!brand ? (
        <SmartLink
          href="/manufacturers"
          aria-label="Переглянути всіх виробників"
          className="absolute inset-0 z-10 cursor-pointer rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
        />
      ) : null}
      <AnimatePresence mode="wait">
        {brand ? (
          <motion.div
            key={brand.name}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col gap-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-sky-600 sm:text-[11px]">Виробник</span>
                  <h3 className="mt-0.5 truncate text-[21px] font-black leading-tight tracking-[-0.03em] text-slate-800 sm:text-[24px]">
                    {brand.name}
                  </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрити опис виробника"
                className="mt-1 shrink-0 text-slate-400 transition-colors duration-150 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {brand.productCount && brand.productCount > 0 ? (
                <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
                  {brand.productCount.toLocaleString("uk-UA")} {pluralizeProductCount(brand.productCount)}
                </span>
              ) : null}
              {brand.groupsCount && brand.groupsCount > 0 ? (
                <span className="rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-[10px] font-extrabold text-sky-700">
                  {brand.groupsCount.toLocaleString("uk-UA")} {pluralizeUk(brand.groupsCount, "група", "групи", "груп")}
                </span>
              ) : null}
            </div>
            <p className="line-clamp-3 text-[14px] font-medium leading-[22px] text-slate-600 sm:text-[15px] sm:leading-[23px]">
              {brand.description}
            </p>
            <div className="mt-0.5 grid gap-2 sm:grid-cols-2">
              <SmartLink
                href={buildCatalogProducerPath(brand.name)}
                prefetchOnIntent
                className="group/catalog inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 text-[11px] font-black text-sky-800 shadow-[0_7px_16px_rgba(14,116,144,0.1)] transition-[border-color,background-color,box-shadow] hover:border-sky-300 hover:bg-sky-50 hover:shadow-[0_9px_20px_rgba(14,116,144,0.15)] sm:text-[12px]"
              >
                Товари бренду
                <ArrowRight size={14} strokeWidth={3} aria-hidden="true" className="transition-transform duration-200 group-hover/catalog:translate-x-0.5" />
              </SmartLink>
              <SmartLink
                href={buildManufacturerPath(buildSeoSlug(brand.name))}
                prefetchOnIntent
                className="group/producer inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-3 text-[11px] font-black text-white shadow-[0_8px_18px_rgba(14,165,233,0.22)] transition-[filter,box-shadow] hover:brightness-105 hover:shadow-[0_10px_22px_rgba(14,165,233,0.3)] sm:text-[12px]"
              >
                Сторінка виробника
                <ArrowRight size={14} strokeWidth={3} aria-hidden="true" className="transition-transform duration-200 group-hover/producer:translate-x-0.5" />
              </SmartLink>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col gap-3"
          >
            <div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-sky-600 sm:text-[11px]">Швидкий вибір</span>
                <h3 className="mt-0.5 text-[20px] font-black tracking-[-0.03em] text-slate-800 sm:text-[23px]">Оберіть виробника</h3>
              </div>
            </div>
            <p className="max-w-sm text-[14px] font-medium leading-[22px] text-slate-600 sm:text-[15px] sm:leading-[23px]">
              Натисніть логотип, щоб побачити коротку інформацію, кількість товарів і перейти до каталогу бренду.
            </p>
            <span className="group/cta inline-flex items-center gap-1.5 self-end text-[12px] font-black text-sky-700 transition-colors duration-200 group-hover/choice:text-cyan-600">
              Усі виробники
              <ArrowRight size={13} strokeWidth={3} className="transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
            </span>
          </motion.div>
        )}
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedBrand, setSelectedBrand] = useState<BrandItem | null>(null);
  const [syncedBrands, setSyncedBrands] = useState<BrandItem[]>(
    initialSyncedBrands && initialSyncedBrands.length > 0 ? initialSyncedBrands : INITIAL_BRANDS
  );

  useEffect(() => {
    onReady?.();
  }, [onReady]);

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
    return pages.length > 0 ? pages : [[]];
  }, [filteredBrands, itemsPerPage]);
  const canGoPrev = safePage > 0;
  const canGoNext = safePage < totalPages - 1;

  const brandPagesRef = useRef<HTMLDivElement | null>(null);
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
      return;
    }

    let cancelled = false;

    fetch("/api/manufacturer-counts", {
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ManufacturerCountsApiPayload | null) => {
        if (cancelled) return;
        const items = payload?.clientProducers;
        if (!Array.isArray(items) || items.length === 0) return;
        setSyncedBrands(items.map(normalizeSyncedBrand));
      })
      .catch(() => {});

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
      className="home-glow-section home-glow-section-sky font-ui group/brandcars relative min-h-[280px] w-full select-none overflow-hidden bg-[radial-gradient(ellipse_at_8%_0%,rgba(56,189,248,0.26),transparent_36%),radial-gradient(ellipse_at_94%_12%,rgba(45,212,191,0.20),transparent_34%),linear-gradient(145deg,#d7eaf4_0%,#bdddea_48%,#d6edf0_100%)] pb-4 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(15,23,42,0.10)] transition-[box-shadow] duration-500 ease-out hover:shadow-[inset_0_1px_0_white,inset_0_-1px_0_rgba(15,23,42,0.12),0_14px_42px_rgba(2,132,199,0.16)] sm:min-h-[320px] sm:pb-6 sm:pt-6"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      {/* top bridge — receives Auto section's sky flow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.26)_0%,rgba(224,242,254,0.08)_58%,transparent_100%)]" />
      {/* static depth — light source top-left */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_125%_82%_at_-4%_-8%,rgba(255,255,255,0.48)_0%,rgba(186,230,253,0.14)_38%,transparent_61%),radial-gradient(ellipse_82%_66%_at_108%_-5%,rgba(56,189,248,0.22)_0%,rgba(125,211,252,0.07)_42%,transparent_62%),radial-gradient(ellipse_92%_52%_at_52%_108%,rgba(45,212,191,0.11)_0%,transparent_68%),linear-gradient(to_bottom,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0.05)_5%,transparent_14%)]" />
      {/* hover bloom — vivid sky sweep on hover */}
      <div className="home-scroll-decor pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 ease-out group-hover/brandcars:opacity-100 bg-[image:radial-gradient(ellipse_180%_100%_at_-4%_2%,rgba(14,165,233,0.38)_0%,rgba(125,211,252,0.12)_38%,transparent_60%),radial-gradient(ellipse_120%_80%_at_110%_5%,rgba(20,184,166,0.28)_0%,rgba(94,234,212,0.08)_42%,transparent_62%),linear-gradient(120deg,rgba(255,255,255,0.22)_0%,transparent_45%)]" />
      {/* bottom bridge — eases into AdvantagesSection's cyan-50 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-12 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(207,250,254,0.24)_100%)]" />
      <motion.div
        className="page-shell-inline relative z-10"
        initial={shouldAnimate ? { opacity: 0, y: 14 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
        transition={shouldAnimate ? { duration: 0.32, ease: "easeOut" } : undefined}
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="group/search relative w-full min-w-0 overflow-hidden rounded-[22px] border border-sky-300 bg-[radial-gradient(circle_at_100%_0%,rgba(56,189,248,0.2),transparent_32%),radial-gradient(circle_at_0%_100%,rgba(45,212,191,0.12),transparent_28%),linear-gradient(125deg,#ffffff_0%,#f8fcff_48%,#edf7ff_100%)] px-3 pb-3 pt-3 text-gray-800 shadow-[0_18px_46px_rgba(14,116,144,0.18),0_4px_14px_rgba(15,23,42,0.06),inset_0_1px_0_#fff] ring-1 ring-white/90 transition-[border-color,box-shadow] duration-300 hover:border-sky-400 hover:shadow-[0_23px_54px_rgba(2,132,199,0.24),0_5px_16px_rgba(15,23,42,0.07),inset_0_1px_0_#fff] sm:px-4 sm:py-4">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-200/25 blur-3xl transition-opacity duration-300 group-hover/search:opacity-80" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:w-full sm:items-center sm:justify-between sm:gap-5">
              <div className="order-1 min-w-0 sm:order-1 sm:flex-1 sm:pr-5 sm:text-right">
                <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-2xl bg-gradient-to-br from-sky-500/90 to-cyan-400/90 text-white shadow-[0_10px_20px_rgba(14,165,233,0.4),inset_0_1px_0_rgba(255,255,255,0.4)] ring-2 ring-white/50 sm:h-12 sm:w-12 sm:rounded-[19px]">
                    <Factory size={19} strokeWidth={2.3} aria-hidden className="sm:h-[23px] sm:w-[23px]" />
                  </span>
                  <h2 className="font-display relative min-w-0 text-[15px] leading-[1.12] tracking-[-0.025em] text-slate-700 min-[480px]:text-[18px] sm:text-[22px]">
                    Відомі бренди виробників автозапчастин та якісні аналоги
                  </h2>
                </div>
                <p className="mt-1 hidden text-[11px] leading-relaxed text-slate-500 sm:block">
                  Оберіть оптимальний варіант зі списку
                </p>
              </div>
              <div className="order-2 w-full min-w-0 sm:order-2 sm:w-[400px] sm:max-w-[400px] sm:shrink-0 sm:border-l sm:border-sky-200/80 sm:pl-5">
                <BrandSearchInput value={search} onChange={setSearch} />
                <span className="mt-1.5 block px-1 text-[10px] font-medium text-slate-500">
                  {"Доступно для пошуку: "}
                  <strong className="font-extrabold tabular-nums text-sky-700">
                    {filteredBrands.length.toLocaleString("uk-UA")}
                  </strong>{" "}
                  {pluralizeBrandCount(filteredBrands.length)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {filteredBrands.length === 0 ? (
          <div className="mt-8 text-center text-sm text-slate-600">
            {"За цим запитом виробників не знайдено."}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 items-stretch gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-[1.55fr_0.9fr]">
            <div>
              <div className="relative px-7 sm:px-10">
                {totalPages > 1 && (
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={!canGoPrev}
                    className="absolute left-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                    aria-label="Попередня сторінка"
                  >
                    <ChevronLeft size={34} strokeWidth={2.6} />
                  </button>
                )}
                <div
                  ref={brandPagesRef}
                  onScroll={handleBrandPagesScroll}
                  role="region"
                  aria-label="Сторінки виробників"
                  className="no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
                >
                  <div className="flex">
                    {brandPages.map((pageBrands, pageIndex) => (
                      <div
                        key={pageIndex}
                        data-brand-page
                        role="group"
                        aria-label={`Сторінка ${pageIndex + 1} з ${totalPages}`}
                        className="w-full min-w-0 shrink-0 snap-start bg-transparent px-1.5 [scroll-snap-stop:always] sm:px-2"
                      >
                        {Math.abs(pageIndex - safePage) <= 1 ? (
                          <div className="grid grid-cols-4 gap-2.5 place-items-stretch sm:gap-3">
                            {pageBrands.map((brand, idx) => (
                              <BrandTile
                                key={`${brand.name}-${pageIndex}-${idx}`}
                                brand={brand}
                                priority={pageIndex === 0 && idx < 4}
                                isSelected={selectedBrand?.name === brand.name}
                                onSelect={setSelectedBrand}
                              />
                            ))}
                          </div>
                        ) : (
                          <div
                            className="h-[92px] bg-transparent sm:h-[104px]"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {totalPages > 1 && (
                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={!canGoNext}
                    className="absolute right-0 top-1/2 z-10 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-sky-900 drop-shadow-[0_4px_6px_rgba(2,132,199,0.28)] transition-[color,filter,opacity] duration-300 hover:text-cyan-600 hover:drop-shadow-[0_6px_9px_rgba(8,145,178,0.38)] disabled:pointer-events-none disabled:text-slate-400 disabled:opacity-40 sm:h-14 sm:w-12"
                    aria-label="Наступна сторінка"
                  >
                    <ChevronRight size={34} strokeWidth={2.6} />
                  </button>
                )}
              </div>

              <div className="relative mt-3 flex min-h-9 items-center px-2 sm:px-3">
                {totalPages > 1 && (
                  <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-xs">
                    <span className="h-px w-4 bg-gradient-to-r from-transparent to-cyan-500/75 sm:w-6" />
                    <span className="hidden font-semibold tracking-wide text-slate-400 sm:inline">Сторінка</span>
                    <span className="text-[15px] font-black text-sky-800 drop-shadow-[0_2px_4px_rgba(14,116,144,0.14)]">{safePage + 1}</span>
                    <span className="font-semibold text-cyan-400">/</span>
                    <span className="font-extrabold text-slate-500">{totalPages}</span>
                    <span className="h-px w-4 bg-gradient-to-l from-transparent to-cyan-500/75 sm:w-6" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <BrandInfoPanel brand={selectedBrand} onClose={() => setSelectedBrand(null)} />
            </div>
          </div>
        )}
      </motion.div>
    </section>
  );
}
