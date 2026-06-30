"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";
import { brands } from "./brandsData";

const MOBILE_ITEMS_PER_PAGE = 6;
const DESKTOP_ITEMS_PER_PAGE = 8;

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
  brandNames: string[];
  className?: string;
};

const BrandSearchInput = memo(
  ({ value, onChange, className }: BrandSearchInputProps) => {

    return (
      <label className={`relative block ${className ?? ""}`}>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
        <input
          type="text"
          placeholder="Виробник"
          aria-label="Пошук виробника"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-ui w-full rounded-[14px] border border-slate-200 bg-white/95 px-10 py-2.5 text-sm font-semibold tracking-normal text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(15,23,42,0.045)] transition select-text placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Очистити пошук"
            className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
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
      className="group relative isolate flex h-[250px] w-full flex-col overflow-hidden rounded-[18px] border border-slate-200/90 bg-white/96 px-3.5 py-3.5 text-left shadow-[0_14px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/80 transition-[border-color,box-shadow,transform,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-300 hover:bg-white hover:shadow-[0_20px_38px_rgba(14,165,233,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 touch-pan-y sm:h-[264px] sm:px-4"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1 bg-[linear-gradient(90deg,#38bdf8,#0ea5e9,#3b82f6)] opacity-80" />
      <span className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.66),rgba(255,255,255,0.94)_42%,rgba(255,255,255,0.98))]" />

      <span className="relative z-10 flex min-w-0 items-start gap-3">
        <span className="flex h-[58px] w-[86px] shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_rgba(15,23,42,0.06)] transition duration-300 group-hover:border-sky-200 group-hover:shadow-[0_12px_24px_rgba(14,165,233,0.1)] sm:h-[62px] sm:w-[94px]">
          {brand.logo ? (
            <Image
              src={brand.logo}
              alt={`${brand.name} logo`}
              width={320}
              height={200}
              quality={100}
              priority={priority}
              loading={priority ? undefined : "lazy"}
              draggable={false}
              className="h-[38px] w-[72px] object-contain drop-shadow-[0_5px_10px_rgba(15,23,42,0.1)] sm:h-[42px] sm:w-[80px]"
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
          <span className="inline-flex w-fit rounded-[9px] border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-sky-800">
            Виробник
          </span>
          <span className="block max-w-full break-words text-left text-[16px] font-black leading-tight text-slate-950 transition-colors duration-300 group-hover:text-sky-800 sm:text-[17px]">
            {brand.name}
          </span>
          {brand.productCount && brand.productCount > 0 ? (
            <span className="text-[11px] font-bold text-emerald-700">
              {brand.productCount.toLocaleString("uk-UA")} товарів у каталозі
            </span>
          ) : null}
        </span>
      </span>

      <span className="relative z-10 mt-3 block min-w-0 rounded-[14px] border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
        <span className="font-ui block min-w-0 break-words text-left text-[12px] font-semibold leading-5 text-slate-600 transition-colors duration-300 group-hover:text-slate-700 line-clamp-5">
          {brand.description}
        </span>
      </span>

      <span className="relative z-10 mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          Сторінка бренду
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-[11px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-sky-800 transition group-hover:border-sky-300 group-hover:bg-sky-100">
          Відкрити
          <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
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
  const [isSmUp, setIsSmUp] = useState(true);
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
  const brandNames = useMemo(
    () => syncedBrands.map((item) => item?.name ?? "").filter(Boolean),
    [syncedBrands]
  );
  const filteredBrands = useMemo(
    () =>
      syncedBrands.filter((brand) =>
        brand.name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [search, syncedBrands]
  );

  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / itemsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const pagedBrands = filteredBrands.slice(
    safePage * itemsPerPage,
    safePage * itemsPerPage + itemsPerPage
  );
  const canGoPrev = safePage > 0;
  const canGoNext = safePage < totalPages - 1;

  useEffect(() => {
    setPage(0);
  }, [search, itemsPerPage]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

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
    setPage((prev) => Math.max(0, prev - 1));
  }, [canGoPrev]);

  const handleNextPage = useCallback(() => {
    if (!canGoNext) return;
    setPage((prev) => Math.min(totalPages - 1, prev + 1));
  }, [canGoNext, totalPages]);

  const openCatalog = useCallback(
    (brandName: string) => {
      router.push(buildManufacturerPath(buildSeoSlug(brandName)));
    },
    [router]
  );

  return (
    <section
      className="home-glow-section home-glow-section-sky font-ui group/brandcars relative min-h-[320px] w-full select-none overflow-hidden bg-[linear-gradient(180deg,#f0f9ff_0%,#e0f2fe_50%,#f0f9ff_100%)] pb-6 pt-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(15,23,42,0.06)] transition-[filter,box-shadow] duration-500 ease-out hover:brightness-[1.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(15,23,42,0.09),0_8px_32px_rgba(14,165,233,0.10)]"
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
        <div className="flex flex-col gap-4 group/brands">
          <div className="home-panel-hover home-section-surface flex w-full flex-col gap-3 overflow-hidden rounded-[22px] border border-sky-100/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(239,246,255,0.9),rgba(236,254,255,0.84))] p-3.5 shadow-[0_16px_36px_rgba(15,23,42,0.065)] ring-1 ring-white/80 lg:flex-row lg:items-center lg:justify-between lg:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-sky-200/80 bg-sky-50 text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.08)]">
                <Factory size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display min-w-0 text-[20px] leading-tight tracking-normal text-slate-950 sm:text-[24px]">
                    Виробники запчастин
                  </h3>
                  <span className="inline-flex rounded-[10px] border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-sky-800">
                    {filteredBrands.length.toLocaleString("uk-UA")}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Швидкий перехід до бренду, груп товарів і каталогу виробника
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-[430px]">
              <BrandSearchInput
                className="relative min-w-0 flex-1"
                value={search}
                onChange={setSearch}
                brandNames={brandNames}
              />

              <div className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[13px] border border-slate-200 bg-slate-50/90 px-1.5 py-1 shadow-inner">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={!canGoPrev}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-sky-700 shadow-[0_4px_10px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-40"
                    aria-label="Попередня сторінка"
                  >
                    <ChevronLeft size={13} />
                  </button>

                  <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm">
                    <span>{safePage + 1}</span>
                    <span className="text-slate-400">/</span>
                    <span>{totalPages}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={!canGoNext}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-sky-700 shadow-[0_4px_10px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-40"
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
          <motion.div
            key={`${safePage}-${filteredBrands.length}`}
            initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
            animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
            transition={shouldAnimate ? { duration: 0.22, ease: "easeOut" } : undefined}
            className="group/logogrid mt-4 grid grid-cols-1 gap-3.5 place-items-stretch min-[420px]:grid-cols-2 sm:grid-cols-4 sm:gap-4 lg:gap-5"
          >
            {pagedBrands.map((brand, idx) => (
              <BrandCard
                key={`${brand.name}-${safePage}-${idx}`}
                brand={brand}
                onOpen={openCatalog}
                priority={safePage === 0 && idx < 4}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}
