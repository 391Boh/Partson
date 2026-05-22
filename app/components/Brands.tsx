"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildManufacturerPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";
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
      aria-label={`Обрати ${brand.name}`}
      onClick={(event) => {
        event.currentTarget.blur();
        onOpen(brand.name);
      }}
      onMouseLeave={(event) => event.currentTarget.blur()}
      className="group relative isolate flex h-[198px] w-full flex-col gap-3 overflow-hidden rounded-2xl border-2 border-cyan-100/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.97),rgba(240,249,255,0.91))] px-3.5 py-3.5 text-left shadow-[0_10px_22px_rgba(15,23,42,0.08),0_0_0_1px_rgba(255,255,255,0.82)_inset] ring-1 ring-sky-200/35 transition-[border-color,background-color,box-shadow,ring-color] duration-300 ease-out hover:border-sky-200/95 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/80 hover:to-blue-50/80 hover:shadow-[0_12px_26px_rgba(59,130,246,0.11),0_5px_16px_rgba(14,165,233,0.08),0_0_0_1px_rgba(34,211,238,0.2)_inset] hover:ring-cyan-200/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 touch-pan-y sm:h-[206px] sm:px-4"
    >
      <span className="pointer-events-none absolute inset-0 z-0 rounded-[14px] border border-white/80" />
      <span className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.12),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.08),transparent_34%)] opacity-55 transition-opacity duration-300 ease-out group-hover:opacity-68" />
      <span className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-white via-sky-50/50 to-blue-50/40 transition-colors duration-300 ease-out group-hover:from-white group-hover:via-sky-50/80 group-hover:to-blue-50/70" />

      <span className="relative z-10 flex min-w-0 items-center gap-3">
        <span className="flex h-[54px] w-[78px] shrink-0 items-center justify-center rounded-xl border border-sky-100/80 bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_14px_rgba(15,23,42,0.07)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.015] group-active:scale-[0.99] sm:h-[58px] sm:w-[86px]">
          <Image
            src={brand.logo}
            alt={`${brand.name} logo`}
            width={320}
            height={200}
            quality={100}
            draggable={false}
            className="max-h-[34px] w-auto max-w-[64px] object-contain drop-shadow-[0_5px_10px_rgba(15,23,42,0.1)] sm:max-h-[38px] sm:max-w-[72px]"
            style={{ imageRendering: "auto" }}
            sizes="(max-width: 640px) 96px, (max-width: 1024px) 128px, 150px"
            onError={handleBrandLogoLoadError}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <span className="block max-w-full break-words text-left text-[15px] font-black leading-tight tracking-[-0.02em] text-slate-800 transition-colors duration-300 group-hover:text-sky-800 sm:text-[16px]">
            {brand.name}
          </span>
          <span className="block h-0.5 w-14 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500 transition-all duration-300 group-hover:w-20" />
        </span>
      </span>
      <span className="relative z-10 block min-w-0 border-t border-sky-100/80 pt-2.5">
        <span className="font-ui block min-w-0 break-words text-left text-[11.5px] font-semibold leading-[1.48] text-slate-600 transition-colors duration-300 group-hover:text-slate-700 line-clamp-5 sm:text-[12.5px]">
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
      router.push(buildManufacturerPath(buildSeoSlug(brandName)));
    },
    [router]
  );

  return (
    <section
      className="home-glow-section home-glow-section-indigo font-ui group/brandcars relative min-h-[320px] w-full select-none overflow-hidden bg-gradient-to-br from-sky-50/92 via-blue-100/70 to-indigo-100/78 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(30,64,175,0.12),0_14px_30px_rgba(37,99,235,0.12)]"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 ease-out group-hover/brandcars:opacity-30 bg-[image:radial-gradient(circle_at_12%_16%,rgba(125,211,252,0.16),transparent_40%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.12),transparent_42%),radial-gradient(circle_at_52%_88%,rgba(147,197,253,0.1),transparent_36%)]" />
      <motion.div
        className="page-shell-inline relative z-10"
        initial={shouldAnimate ? { opacity: 0, y: 14 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
        transition={shouldAnimate ? { duration: 0.32, ease: "easeOut" } : undefined}
      >
        <div className="flex flex-col gap-4 group/brands">
          <div className="grid w-full gap-3 rounded-2xl border border-white/80 bg-white/62 p-3 shadow-[0_12px_28px_rgba(37,99,235,0.08)] backdrop-blur-md sm:grid-cols-[minmax(0,1fr)_240px_auto] sm:items-center">
            <div className="flex min-w-0 items-center gap-3 group hover:[&_span[data-underline]]:scale-x-100 group-hover/brands:[&_span[data-underline]]:scale-x-100">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner">
                <Factory size={18} />
              </span>
              <h3 className="font-display relative min-w-0 text-[21px] leading-tight tracking-[-0.035em] text-slate-800 sm:text-[25px]">
                <span className="relative inline-block max-w-full break-words">
                  {"Вибір із"} {filteredBrands.length} {"виробників авто"}
                  <span
                    data-underline
                    className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 group-hover/brands:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                  />
                </span>
              </h3>
            </div>

            <BrandSearchInput
              className="relative min-w-0"
              value={search}
              onChange={setSearch}
              brandNames={brandNames}
            />

            <div className="max-w-full overflow-x-auto no-scrollbar sm:justify-self-end">
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
            className="group/logogrid mt-4 grid grid-cols-1 gap-3.5 place-items-stretch min-[420px]:grid-cols-2 sm:grid-cols-4 sm:gap-4"
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
