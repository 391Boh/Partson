"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildCatalogProducerPath } from "app/lib/catalog-links";
import { brands } from "./brandsData";

const MOBILE_ITEMS_PER_PAGE = 6;
const DESKTOP_ITEMS_PER_PAGE = 8;

type BrandItem = (typeof brands)[number];
const BRAND_LOGO_FALLBACK_PATH = "/favicon-192x192.png";

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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
        <input
          type="text"
          placeholder="Виробник"
          aria-label="Пошук виробника"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-ui w-full rounded-xl border border-blue-200 bg-white/90 px-9 py-2 text-xs font-semibold tracking-normal text-gray-700 placeholder:text-blue-300/95 shadow-inner transition select-text focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Очистити пошук"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white text-blue-500 border border-blue-100 shadow-sm hover:bg-blue-50 transition"
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
}: {
  brand: BrandItem;
  onOpen: (brandName: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(brand.name)}
      className="group relative isolate flex w-full min-h-[148px] items-center gap-3.5 overflow-hidden rounded-2xl border border-slate-100/85 bg-white/94 px-3 py-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.12)] ring-1 ring-transparent transition-[border-color,background-color,box-shadow,ring-color] duration-300 ease-out hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/75 hover:to-blue-50 hover:shadow-[0_18px_42px_rgba(59,130,246,0.16),0_8px_22px_rgba(14,165,233,0.12)] hover:ring-2 hover:ring-sky-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 sm:min-h-[146px] sm:gap-4"
      aria-label={`Обрати ${brand.name}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.18),transparent_34%)] opacity-70 transition-opacity duration-500 ease-out group-hover:opacity-100" />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/46 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-white group-hover:via-sky-100 group-hover:to-indigo-100" />
      <span className="pointer-events-none absolute -right-12 -top-16 h-28 w-28 rounded-full bg-sky-200/26 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[6px] group-hover:-translate-y-[6px]" />
      <span className="pointer-events-none absolute -left-14 -bottom-16 h-32 w-32 rounded-full bg-cyan-200/22 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-[4px] group-hover:translate-y-[4px]" />
      <span className="pointer-events-none absolute inset-y-[-30%] left-[-28%] w-[58%] rotate-[16deg] bg-gradient-to-br from-white/0 via-white/28 to-white/0 opacity-0 blur-[2px] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[18%] group-hover:opacity-80" />

      <span className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-xl border border-sky-100/70 bg-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_rgba(15,23,42,0.08)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-active:scale-[0.99] sm:h-[82px] sm:w-[82px]">
        <Image
          src={brand.logo}
          alt={`${brand.name} logo`}
          width={320}
          height={200}
          quality={100}
          draggable={false}
          className="h-[42px] w-auto object-contain drop-shadow-[0_8px_14px_rgba(15,23,42,0.14)] sm:h-[56px]"
          style={{ imageRendering: "auto" }}
          sizes="(max-width: 640px) 120px, (max-width: 1024px) 160px, 200px"
          onError={handleBrandLogoLoadError}
        />
      </span>
      <p className="font-ui relative min-w-0 flex-1 break-words text-left text-[11px] font-medium leading-relaxed text-slate-600 transition-colors duration-300 group-hover:text-slate-700 line-clamp-4 sm:text-[12px] sm:line-clamp-4">
        {brand.description}
      </p>
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
    () => brands.map((item) => item?.name ?? "").filter(Boolean),
    []
  );
  const filteredBrands = useMemo(
    () =>
      brands.filter((brand) =>
        brand.name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [search]
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
      router.push(buildCatalogProducerPath(brandName));
    },
    [router]
  );

  return (
    <section
      className="font-ui group/brandcars relative min-h-[320px] w-full select-none overflow-hidden bg-gradient-to-br from-sky-50/92 via-blue-100/70 to-indigo-100/78 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(30,64,175,0.12),0_14px_30px_rgba(37,99,235,0.12)]"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 ease-out group-hover/brandcars:opacity-100 bg-[image:radial-gradient(circle_at_12%_16%,rgba(125,211,252,0.26),transparent_40%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.22),transparent_42%),radial-gradient(circle_at_52%_88%,rgba(147,197,253,0.2),transparent_36%)]" />
      <motion.div
        className="page-shell-inline relative z-10"
        initial={shouldAnimate ? { opacity: 0, y: 14 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
        transition={shouldAnimate ? { duration: 0.32, ease: "easeOut" } : undefined}
      >
        <div className="flex flex-col gap-3 group/brands">
          <div className="flex flex-wrap items-center gap-3 w-full sm:flex-nowrap sm:items-center sm:justify-between">
            <div className="order-1 w-full sm:w-auto flex items-center gap-3 sm:gap-4 group hover:[&_span[data-underline]]:scale-x-100 group-hover/brands:[&_span[data-underline]]:scale-x-100">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner">
                <Factory size={18} />
              </span>
              <h3 className="font-display relative inline-block text-[22px] tracking-[-0.045em] text-slate-700 sm:text-[25px]">
                <span className="relative inline-flex items-center">
                  {"Вибір із"} {filteredBrands.length} {"виробників авто"}
                  <span
                    data-underline
                    className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 group-hover/brands:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                  />
                </span>
              </h3>
            </div>

            <BrandSearchInput
              className="order-2 relative min-w-0 flex-1 sm:w-[240px] sm:mx-auto sm:flex-none"
              value={search}
              onChange={setSearch}
              brandNames={brandNames}
            />

            <div className="order-2 shrink-0 max-w-full overflow-x-auto no-scrollbar sm:mr-1">
              <div className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-sky-200/70 bg-gradient-to-r from-white/95 via-sky-50/85 to-cyan-50/80 px-1.5 py-0.5 shadow-[0_8px_18px_rgba(14,116,144,0.14),0_3px_8px_rgba(30,64,175,0.07)] backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                  aria-label="Попередня сторінка"
                >
                  <ChevronLeft size={12} />
                </button>

                <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0 text-[9px] font-semibold text-slate-600 shadow-inner">
                  <span>{safePage + 1}</span>
                  <span className="text-slate-400">/</span>
                  <span>{totalPages}</span>
                </div>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_2px_6px_rgba(14,116,144,0.14)] transition-all duration-150 hover:bg-sky-50 hover:shadow-[0_4px_10px_rgba(14,116,144,0.2)] disabled:opacity-40"
                  aria-label="Наступна сторінка"
                >
                  <ChevronRight size={12} />
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
            className="group/logogrid mt-5 grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5 place-items-stretch"
          >
            {pagedBrands.map((brand, idx) => (
              <BrandCard
                key={`${brand.name}-${safePage}-${idx}`}
                brand={brand}
                onOpen={openCatalog}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}
