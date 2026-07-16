"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";
import { brands } from "./brandsData";

const MOBILE_ITEMS_PER_PAGE = 2;
const DESKTOP_ITEMS_PER_PAGE = 6;

const pluralizeUk = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const pluralizeBrandCount = (value: number) =>
  pluralizeUk(value, "виробник", "виробники", "виробників");

const pluralizeProductCount = (value: number) =>
  pluralizeUk(value, "товар", "товари", "товарів");

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
const BRAND_LOGO_FALLBACK_PATH = "/favicon-192x192.png";
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

const BrandSearchInput = memo(
  ({ value, onChange, className }: BrandSearchInputProps) => {

    return (
      <label
        className={`group/search relative block rounded-xl transition-shadow duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:shadow-[0_10px_26px_rgba(14,165,233,0.14)] ${className ?? ""}`}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within/search:text-sky-600" />
        <input
          type="text"
          placeholder="Виробник"
          aria-label="Пошук виробника"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-ui w-full rounded-xl border border-slate-200 bg-white px-10 py-2.5 text-sm font-semibold tracking-normal text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_6px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] select-text placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Очистити пошук"
            className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            <X className="h-3.5 w-3.5 mx-auto" />
          </button>
        )}
      </label>
    );
  }
);

BrandSearchInput.displayName = "BrandSearchInput";

function BrandCard({
  brand,
  priority = false,
}: {
  brand: BrandItem;
  priority?: boolean;
}) {
  return (
    <SmartLink
      href={buildManufacturerPath(buildSeoSlug(brand.name))}
      prefetchOnIntent
      onClick={(event) => {
        event.currentTarget.blur();
      }}
      onMouseLeave={(event) => event.currentTarget.blur()}
      className="group relative isolate flex h-[176px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-[linear-gradient(148deg,#ffffff_0%,#fbfdff_34%,#f3f7fb_68%,#e6eef6_100%)] p-2.5 text-left shadow-[0_18px_36px_rgba(15,23,42,0.13),0_5px_13px_rgba(14,116,144,0.09),inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(30,64,175,0.07)] ring-1 ring-white/95 transition-[border-color,box-shadow,background] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-sky-300 hover:bg-[linear-gradient(148deg,#ffffff_0%,#f6fbff_34%,#eaf5fc_68%,#d8eaf6_100%)] hover:shadow-[0_24px_46px_rgba(14,165,233,0.24),0_8px_18px_rgba(30,64,175,0.13),inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(30,64,175,0.10),0_0_0_1px_rgba(56,189,248,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:h-[196px] sm:rounded-[18px] sm:p-3 lg:h-[204px] lg:p-3.5"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[3px] bg-[linear-gradient(90deg,#38bdf8,#0ea5e9,#6366f1)] opacity-90 transition-[height,opacity,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:h-1 group-hover:shadow-[0_0_16px_rgba(56,189,248,0.7)]" />
      <span className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_80%_at_0%_0%,rgba(255,255,255,0.9)_0%,rgba(224,242,254,0.15)_50%,transparent_75%)] opacity-90 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100" />
      <span className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_92%_72%_at_100%_100%,rgba(59,130,246,0.105)_0%,rgba(14,165,233,0.035)_42%,transparent_70%)]" />
      <span className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 bg-[radial-gradient(ellipse_90%_70%_at_100%_100%,rgba(99,102,241,0.16)_0%,transparent_65%)]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[-60%] z-0 w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)] opacity-0 transition-[transform,opacity] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[280%] group-hover:opacity-100"
      />

      <span className="relative z-10 grid min-w-0 grid-cols-[68px_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-3 lg:grid-cols-[96px_minmax(0,1fr)]">
        <span className="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-xl border border-white/85 bg-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_7px_16px_rgba(15,23,42,0.08)] ring-1 ring-sky-100/70 backdrop-blur-sm transition-[border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:border-white group-hover:bg-white/96 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_9px_20px_rgba(14,165,233,0.18)] sm:h-[62px] sm:w-[88px] sm:rounded-[14px] lg:h-[66px] lg:w-[96px]">
          {brand.logo ? (
            <Image
              src={brand.logo}
              alt={`${brand.name} logo`}
              width={320}
              height={200}
              quality={75}
              priority={priority}
              // Cards only ever mount when their page is within the carousel's
              // virtualization window (Math.abs(pageIndex - safePage) <= 2
              // below) — that already caps how many images exist in the DOM
              // at once, so native lazy-loading on top of it just adds a
              // visible pop-in delay while swiping into a neighboring page
              // instead of having it ready ahead of time.
              loading={priority ? undefined : "eager"}
              draggable={false}
              className="h-[38px] w-[62px] object-contain drop-shadow-[0_4px_8px_rgba(15,23,42,0.09)] sm:h-[48px] sm:w-[80px] lg:h-[52px] lg:w-[88px]"
              style={{ imageRendering: "auto" }}
              sizes="(max-width: 640px) 64px, 80px"
              onError={handleBrandLogoLoadError}
            />
          ) : (
            <span className="text-[12px] font-black text-slate-600 tracking-tight leading-none text-center px-1">
              {brand.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
          <span className="inline-flex self-end items-center justify-end gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.045em] text-sky-700 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-sky-800 sm:text-[11px]">
            До виробника
            <ArrowRight size={11} strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="line-clamp-2 block max-w-full break-words text-right text-[17px] font-black leading-[1.08] tracking-[-0.02em] text-slate-950 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-sky-800 sm:text-[18px] lg:text-[19px]">
            {brand.name}
          </span>
          {brand.productCount && brand.productCount > 0 ? (
            <span className="hidden text-right text-[10.5px] font-bold text-emerald-700 sm:inline">
              {brand.productCount.toLocaleString("uk-UA")} {pluralizeProductCount(brand.productCount)} у каталозі
            </span>
          ) : null}
        </span>
      </span>

      <span className="relative z-10 mt-2 flex min-w-0 flex-1 flex-col justify-center rounded-xl border border-white/75 bg-white/62 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-slate-100/70 backdrop-blur-sm transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-white/80 group-hover:ring-sky-100 sm:mt-2.5 sm:rounded-[14px] sm:px-2.5 sm:py-2">
        <span className="font-ui line-clamp-4 block min-w-0 break-words text-center text-[11.5px] font-semibold leading-[15px] tracking-[-0.005em] text-slate-600 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-slate-800 sm:line-clamp-5 sm:text-[12.5px] sm:leading-[17px]">
          {brand.description}
        </span>
      </span>
    </SmartLink>
  );
}

type BrandCarouselProps = {
  playEntranceAnimations?: boolean;
  initialSyncedBrands?: BrandItem[];
};

export default function BrandCarousel({
  playEntranceAnimations = true,
  initialSyncedBrands,
}: BrandCarouselProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [isSmUp, setIsSmUp] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
  const [syncedBrands, setSyncedBrands] = useState<BrandItem[]>(
    initialSyncedBrands && initialSyncedBrands.length > 0 ? initialSyncedBrands : INITIAL_BRANDS
  );
  const hasFetchedSyncedBrandsRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 640px)");
    const handleChange = () => setIsSmUp(media.matches);
    handleChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const itemsPerPage = isSmUp ? DESKTOP_ITEMS_PER_PAGE : MOBILE_ITEMS_PER_PAGE;
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
    // Server already provided the real, synced list (see app/page.tsx) —
    // fetching again would just replace it with an equivalent copy a moment
    // later, causing a visible reorder/flicker for no benefit. Only hit the
    // API as a fallback when SSR data is missing, and only once.
    if (
      (initialSyncedBrands && initialSyncedBrands.length > 0) ||
      hasFetchedSyncedBrandsRef.current
    ) {
      return;
    }
    hasFetchedSyncedBrandsRef.current = true;

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
      className="home-glow-section home-glow-section-sky font-ui group/brandcars relative min-h-[280px] w-full select-none overflow-hidden bg-[linear-gradient(180deg,#e2f0f7_0%,#c8e1ee_48%,#d8eaec_100%)] pb-4 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(15,23,42,0.08)] transition-[filter,box-shadow] duration-500 ease-out hover:brightness-[1.025] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.96),inset_0_-1px_0_rgba(15,23,42,0.10),0_8px_32px_rgba(14,165,233,0.11)] sm:min-h-[320px] sm:pb-6 sm:pt-6"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      {/* top bridge — receives Auto section's sky flow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.26)_0%,rgba(224,242,254,0.08)_58%,transparent_100%)]" />
      {/* static depth — light source top-left */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_125%_82%_at_-4%_-8%,rgba(255,255,255,0.48)_0%,rgba(186,230,253,0.14)_38%,transparent_61%),radial-gradient(ellipse_82%_66%_at_108%_-5%,rgba(56,189,248,0.22)_0%,rgba(125,211,252,0.07)_42%,transparent_62%),radial-gradient(ellipse_92%_52%_at_52%_108%,rgba(45,212,191,0.11)_0%,transparent_68%),linear-gradient(to_bottom,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0.05)_5%,transparent_14%)]" />
      {/* hover bloom — vivid sky sweep on hover */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-[700ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/brandcars:opacity-100 bg-[image:radial-gradient(ellipse_180%_100%_at_-4%_2%,rgba(56,189,248,0.24)_0%,rgba(125,211,252,0.08)_38%,transparent_60%),radial-gradient(ellipse_120%_80%_at_110%_5%,rgba(56,189,248,0.14)_0%,rgba(147,197,253,0.05)_42%,transparent_62%),linear-gradient(to_bottom,rgba(255,255,255,0.10)_0%,transparent_30%)]" />
      {/* bottom bridge — eases into AdvantagesSection's cyan-50 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-12 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(207,250,254,0.24)_100%)]" />
      <motion.div
        className="page-shell-inline relative z-10"
        initial={shouldAnimate ? { opacity: 0, y: 14 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
        transition={shouldAnimate ? { duration: 0.32, ease: "easeOut" } : undefined}
      >
        <div className="flex flex-col gap-3 group/brands sm:gap-4">
          <div className="flex w-full flex-col gap-2.5 border-0 bg-transparent px-1 py-0 shadow-none ring-0 sm:px-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-sky-50 text-sky-700 shadow-[0_6px_14px_rgba(14,165,233,0.07)] sm:h-11 sm:w-11 sm:rounded-[14px]">
                <Factory size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display relative min-w-0 text-[22px] tracking-[-0.045em] text-slate-700 sm:text-[25px]">
                    <span className="relative inline-block max-w-full break-words">
                      Виробники запчастин
                      <span className="pointer-events-none absolute -bottom-1 left-0 h-[3px] w-full origin-left scale-x-0 rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400 shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-transform duration-300 ease-out group-hover/brands:scale-x-100" />
                    </span>
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-[10px] border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-sky-800">
                    <span className="tabular-nums">{filteredBrands.length.toLocaleString("uk-UA")}</span>
                    {pluralizeBrandCount(filteredBrands.length)}
                  </span>
                </div>
                <p className="mt-0.5 hidden text-xs font-semibold leading-5 text-slate-500 sm:block">
                  Швидкий перехід до бренду, груп товарів і каталогу виробника
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-row items-center gap-2 lg:w-[430px]">
              <BrandSearchInput
                className="relative min-w-0 flex-1"
                value={search}
                onChange={setSearch}
              />

              <div className="inline-flex w-fit shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/90 px-1 py-1 shadow-inner sm:gap-1.5 sm:rounded-[13px] sm:px-1.5">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={!canGoPrev}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-sky-700 shadow-[0_4px_10px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-sky-300 hover:text-sky-800 hover:shadow-[0_6px_16px_rgba(14,165,233,0.18)] active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Попередня сторінка"
                  >
                    <ChevronLeft size={13} />
                  </button>

                  <div role="status" aria-live="polite" className="flex min-w-[42px] items-center justify-center gap-0.5 rounded-[9px] border border-slate-200 bg-white px-1.5 py-1.5 text-[10px] font-bold tabular-nums text-slate-600 shadow-sm sm:min-w-0 sm:gap-1 sm:rounded-full sm:px-2.5">
                    <span className="text-sky-700">{safePage + 1}</span>
                    <span className="text-slate-300">/</span>
                    <span>{totalPages}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={!canGoNext}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-sky-700 shadow-[0_4px_10px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-sky-300 hover:text-sky-800 hover:shadow-[0_6px_16px_rgba(14,165,233,0.18)] active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Наступна сторінка"
                  >
                    <ChevronRight size={13} />
                  </button>
              </div>
            </div>
          </div>
        </div>

        {filteredBrands.length === 0 ? (
          <div className="mt-8 text-center text-sm text-slate-600">
            {"За цим запитом виробників не знайдено."}
          </div>
        ) : (
          <div
            ref={brandPagesRef}
            onScroll={handleBrandPagesScroll}
            role="region"
            aria-label="Сторінки виробників"
            className="no-scrollbar mt-1 flex border-0 bg-transparent py-5 shadow-none ring-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] sm:mt-2 sm:py-6"
          >
            {brandPages.map((pageBrands, pageIndex) => (
              <div
                key={pageIndex}
                data-brand-page
                role="group"
                aria-label={`Сторінка ${pageIndex + 1} з ${totalPages}`}
                className="w-full min-w-0 shrink-0 snap-start bg-transparent px-1.5 [scroll-snap-stop:always] sm:px-2"
              >
                {Math.abs(pageIndex - safePage) <= 2 ? (
                  <div className="grid grid-cols-1 grid-rows-2 gap-2 sm:grid-cols-3 sm:grid-rows-2 sm:gap-4 lg:gap-5">
                    {pageBrands.map((brand, idx) => (
                      <BrandCard
                        key={`${brand.name}-${pageIndex}-${idx}`}
                        brand={brand}
                        priority={pageIndex === 0 && idx < 3}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className="h-[360px] bg-transparent sm:h-[408px] lg:h-[428px]"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </section>
  );
}
