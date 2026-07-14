"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";
import { brands } from "./brandsData";

const MOBILE_ITEMS_PER_PAGE = 4;
const DESKTOP_ITEMS_PER_PAGE = 8;

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
  onOpen,
  priority = false,
}: {
  brand: BrandItem;
  onOpen: (brandName: string) => void;
  priority?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`Обрати ${brand.name}`}
      onClick={(event) => {
        event.currentTarget.blur();
        onOpen(brand.name);
      }}
      onMouseLeave={(event) => event.currentTarget.blur()}
      className="group relative isolate flex h-full min-h-[196px] w-full flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white/95 px-2.5 py-2.5 text-left shadow-[0_8px_20px_rgba(15,23,42,0.055)] ring-1 ring-white/80 transition-[border-color,box-shadow,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-sky-300 hover:bg-white hover:shadow-[0_18px_38px_rgba(14,165,233,0.20),0_0_0_1px_rgba(56,189,248,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:min-h-[232px] sm:rounded-[18px] sm:border-slate-200/90 sm:px-3.5 sm:py-3.5 lg:min-h-[240px] lg:px-4"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1 bg-[linear-gradient(90deg,#38bdf8,#0ea5e9,#3b82f6)] opacity-80 transition-[height,opacity,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:h-[3px] group-hover:opacity-100 group-hover:shadow-[0_0_14px_rgba(56,189,248,0.65)]" />
      <span className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.66),rgba(255,255,255,0.94)_42%,rgba(255,255,255,0.98))]" />
      <span className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 bg-[radial-gradient(ellipse_120%_90%_at_0%_0%,rgba(56,189,248,0.14)_0%,rgba(125,211,252,0.05)_45%,transparent_70%)]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[-60%] z-0 w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)] opacity-0 transition-[transform,opacity] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[280%] group-hover:opacity-100"
      />

      <span className="relative z-10 flex min-w-0 items-center gap-2 sm:items-start sm:gap-3">
        <span className="flex h-11 w-[58px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_14px_rgba(15,23,42,0.055)] transition-[border-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06] group-hover:border-sky-200 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_rgba(14,165,233,0.16)] sm:h-[58px] sm:w-[86px] sm:rounded-[14px] lg:h-[62px] lg:w-[94px]">
          {brand.logo ? (
            <Image
              src={brand.logo}
              alt={`${brand.name} logo`}
              width={320}
              height={200}
              quality={75}
              priority={priority}
              loading={priority ? undefined : "lazy"}
              draggable={false}
              className="h-7 w-12 object-contain drop-shadow-[0_4px_8px_rgba(15,23,42,0.09)] sm:h-[38px] sm:w-[72px] lg:h-[42px] lg:w-[80px]"
              style={{ imageRendering: "auto" }}
              sizes="(max-width: 640px) 64px, 80px"
              onError={handleBrandLogoLoadError}
            />
          ) : (
            <span className="text-[13px] font-black text-slate-600 tracking-tight leading-none text-center px-1">
              {brand.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 block max-w-full break-words text-left text-[12px] font-black leading-tight text-slate-950 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-sky-800 sm:text-[16px] lg:text-[17px]">
            {brand.name}
          </span>
          {brand.productCount && brand.productCount > 0 ? (
            <span className="hidden text-[11px] font-bold text-emerald-700 sm:inline">
              {brand.productCount.toLocaleString("uk-UA")} {pluralizeProductCount(brand.productCount)} у каталозі
            </span>
          ) : null}
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[8px] font-black uppercase tracking-[0.05em] text-sky-700 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-sky-800 sm:text-[9.5px]">
            До виробника
            <ArrowRight size={9} strokeWidth={3} aria-hidden="true" />
          </span>
        </span>
      </span>

      <span className="relative z-10 mt-2 block min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2 py-1.5 sm:mt-3 sm:rounded-[14px] sm:px-3 sm:py-2.5">
        <span className="font-ui line-clamp-3 block min-w-0 break-words text-left text-[11.5px] font-bold leading-[15px] text-slate-700 transition-colors duration-300 group-hover:text-slate-800 sm:text-[13px] sm:leading-[19px]">
          {brand.description}
        </span>
      </span>
    </button>
  );
}

type BrandCarouselProps = {
  playEntranceAnimations?: boolean;
};

export default function BrandCarousel({
  playEntranceAnimations = true,
}: BrandCarouselProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [isSmUp, setIsSmUp] = useState(false);
  const [syncedBrands, setSyncedBrands] = useState<BrandItem[]>(INITIAL_BRANDS);

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
      syncedBrands.filter((brand) =>
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
  const handleBrandPagesScroll = useCallback(() => {
    const container = brandPagesRef.current;
    if (!container) return;
    const pageWidth = getBrandPageWidth();
    if (!pageWidth) return;
    const nextPage = Math.max(
      0,
      Math.min(totalPages - 1, Math.round(container.scrollLeft / pageWidth))
    );
    setPage((prev) => (prev === nextPage ? prev : nextPage));
  }, [totalPages, getBrandPageWidth]);

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
  }, []);

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

  const openCatalog = useCallback(
    (brandName: string) => {
      router.push(buildManufacturerPath(buildSeoSlug(brandName)));
    },
    [router]
  );

  return (
    <section
      className="home-glow-section home-glow-section-sky font-ui group/brandcars relative min-h-[280px] w-full select-none overflow-hidden bg-[linear-gradient(180deg,#f0f9ff_0%,#e0f2fe_50%,#f0f9ff_100%)] pb-4 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(15,23,42,0.06)] transition-[filter,box-shadow] duration-500 ease-out hover:brightness-[1.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(15,23,42,0.09),0_8px_32px_rgba(14,165,233,0.10)] sm:min-h-[320px] sm:pb-6 sm:pt-6"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      {/* top bridge — receives Auto section's sky flow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.20)_0%,rgba(186,230,253,0.05)_55%,transparent_100%)]" />
      {/* static depth — light source top-left */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_130%_80%_at_-4%_-8%,rgba(186,230,253,0.50)_0%,rgba(186,230,253,0.14)_36%,transparent_58%),radial-gradient(ellipse_80%_65%_at_108%_-5%,rgba(125,211,252,0.22)_0%,rgba(147,197,253,0.06)_40%,transparent_60%),linear-gradient(to_bottom,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.08)_4%,transparent_12%)]" />
      {/* hover bloom — vivid sky sweep on hover */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-[700ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/brandcars:opacity-100 bg-[image:radial-gradient(ellipse_180%_100%_at_-4%_2%,rgba(56,189,248,0.24)_0%,rgba(125,211,252,0.08)_38%,transparent_60%),radial-gradient(ellipse_120%_80%_at_110%_5%,rgba(56,189,248,0.14)_0%,rgba(147,197,253,0.05)_42%,transparent_62%),linear-gradient(to_bottom,rgba(255,255,255,0.10)_0%,transparent_30%)]" />
      {/* bottom bridge — eases into AdvantagesSection's cyan-50 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-10 bg-[image:linear-gradient(to_bottom,transparent_0%,rgba(186,230,253,0.14)_100%)]" />
      <motion.div
        className="page-shell-inline relative z-10"
        initial={shouldAnimate ? { opacity: 0, y: 14 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
        transition={shouldAnimate ? { duration: 0.32, ease: "easeOut" } : undefined}
      >
        <div className="flex flex-col gap-3 group/brands sm:gap-4">
          <div className="home-panel-hover home-section-surface flex w-full flex-col gap-2.5 overflow-hidden rounded-[18px] border border-sky-100/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(239,246,255,0.9),rgba(236,254,255,0.84))] p-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.055)] ring-1 ring-white/80 sm:rounded-[22px] sm:p-3.5 lg:flex-row lg:items-center lg:justify-between lg:p-4">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-sky-50 text-sky-700 shadow-[0_6px_14px_rgba(14,165,233,0.07)] sm:h-11 sm:w-11 sm:rounded-[14px]">
                <Factory size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display min-w-0 text-[22px] tracking-[-0.045em] text-slate-950 sm:text-[25px]">
                    Виробники запчастин
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

                  <div className="flex min-w-[42px] items-center justify-center gap-0.5 rounded-[9px] border border-slate-200 bg-white px-1.5 py-1.5 text-[10px] font-bold tabular-nums text-slate-600 shadow-sm sm:min-w-0 sm:gap-1 sm:rounded-full sm:px-2.5">
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
            className="no-scrollbar mt-3 overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] sm:mt-6"
          >
            <div className="flex">
              {brandPages.map((pageBrands, pageIndex) => (
                <div key={pageIndex} data-brand-page className="w-full min-w-0 shrink-0 snap-start px-1.5 [scroll-snap-stop:always] sm:px-2">
                  <div className="grid grid-cols-2 grid-rows-2 gap-2 sm:grid-rows-none sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
                    {pageBrands.map((brand, idx) => (
                      <BrandCard
                        key={`${brand.name}-${pageIndex}-${idx}`}
                        brand={brand}
                        onOpen={openCatalog}
                        priority={pageIndex === 0 && idx < 4}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </section>
  );
}
