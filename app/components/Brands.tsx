"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Factory, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { brands } from "app/components/brandsData";

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
  ({ value, onChange, brandNames, className }: BrandSearchInputProps) => {
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");

    useEffect(() => {
      if (!brandNames.length || isInputFocused || value.trim()) {
        setAnimatedPlaceholder("");
        return;
      }

      let active = true;
      let wordIndex = 0;
      let charIndex = 0;
      let direction: "forward" | "back" = "forward";
      let timeoutId: ReturnType<typeof setTimeout>;

      const tick = () => {
        if (!active) return;
        const word = brandNames[wordIndex] || "";

        if (direction === "forward") {
          charIndex = Math.min(word.length, charIndex + 1);
          setAnimatedPlaceholder(word.slice(0, charIndex).toUpperCase());
          if (charIndex === word.length) {
            direction = "back";
            timeoutId = setTimeout(tick, 900);
            return;
          }
          timeoutId = setTimeout(tick, 85);
          return;
        }

        charIndex = Math.max(0, charIndex - 1);
        setAnimatedPlaceholder(word.slice(0, charIndex).toUpperCase());
        if (charIndex === 0) {
          direction = "forward";
          wordIndex = (wordIndex + 1) % brandNames.length;
          timeoutId = setTimeout(tick, 260);
          return;
        }
        timeoutId = setTimeout(tick, 45);
      };

      tick();
      return () => {
        active = false;
        clearTimeout(timeoutId);
      };
    }, [brandNames, isInputFocused, value]);

    return (
      <label className={`relative block ${className ?? ""}`}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
        <input
          type="text"
          placeholder=""
          aria-label="Пошук виробника"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          className="w-full rounded-xl border border-blue-200 bg-white/90 px-9 py-2 text-xs sm:text-sm font-semibold text-gray-700 placeholder:text-transparent shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition select-text"
        />
        {!value && !isInputFocused && (
          <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-blue-400 uppercase tracking-[0.14em] truncate">
            {animatedPlaceholder || "ВИРОБНИК"}
          </span>
        )}
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
      className="group relative isolate flex w-full min-h-[182px] flex-col items-start justify-start overflow-hidden rounded-2xl border border-slate-100/85 bg-white/94 px-3 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.12)] ring-1 ring-transparent transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[4px] hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:via-sky-50/75 hover:to-blue-50 hover:shadow-[0_24px_60px_rgba(59,130,246,0.2),0_10px_26px_rgba(14,165,233,0.16)] hover:ring-2 hover:ring-sky-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 sm:min-h-[178px]"
      aria-label={`Обрати ${brand.name}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.18),transparent_34%)] opacity-70 transition-opacity duration-500 ease-out group-hover:opacity-100" />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/46 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-white group-hover:via-sky-100 group-hover:to-indigo-100" />
      <span className="pointer-events-none absolute -right-12 -top-16 h-28 w-28 rounded-full bg-sky-200/26 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[6px] group-hover:-translate-y-[6px]" />
      <span className="pointer-events-none absolute -left-14 -bottom-16 h-32 w-32 rounded-full bg-cyan-200/22 blur-3xl transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-[4px] group-hover:translate-y-[4px]" />
      <span className="pointer-events-none absolute inset-y-[-30%] left-[-28%] w-[58%] rotate-[16deg] bg-gradient-to-br from-white/0 via-white/28 to-white/0 opacity-0 blur-[2px] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[18%] group-hover:opacity-80" />

      <div className="relative flex w-full items-center gap-2.5 rounded-xl border border-sky-100/80 bg-white/82 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.96),inset_0_-1px_0_rgba(148,163,184,0.2),0_8px_18px_rgba(15,23,42,0.08)] sm:gap-3 sm:px-3 sm:py-2.5">
        <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-xl border border-sky-100/70 bg-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_rgba(15,23,42,0.08)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-active:scale-[0.99] sm:h-[72px] sm:w-[72px]">
          <Image
            src={brand.logo}
            alt={`${brand.name} logo`}
            width={320}
            height={200}
            quality={100}
            draggable={false}
            className="h-[40px] w-auto object-contain drop-shadow-[0_8px_14px_rgba(15,23,42,0.14)] sm:h-[50px]"
            style={{ imageRendering: "auto" }}
            sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 240px"
            onError={handleBrandLogoLoadError}
          />
        </div>
        <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-800 drop-shadow-[0_2px_6px_rgba(15,23,42,0.16)] transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-sky-800 sm:text-[14px] sm:leading-[1.2] sm:tracking-[0.06em] sm:whitespace-normal sm:line-clamp-2">
          {brand.name}
        </p>
      </div>
      <p className="relative mt-2 w-full break-words rounded-xl border border-sky-100/75 bg-white/82 px-3 py-2 text-left text-[11px] leading-relaxed text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] line-clamp-3 sm:mt-1.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-[12px] sm:shadow-none sm:line-clamp-none">
        {brand.description}
      </p>
    </button>
  );
}

export default function BrandCarousel() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion() ?? false;
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
      router.push(`/katalog?producer=${encodeURIComponent(brandName)}`);
    },
    [router]
  );

  return (
    <section
      className="group/brandcars relative w-full select-none overflow-hidden bg-gradient-to-br from-sky-50/92 via-blue-100/70 to-indigo-100/78 pb-5 pt-5 font-[Montserrat] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(30,64,175,0.12),0_14px_30px_rgba(37,99,235,0.12)]"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      style={{ contain: "layout paint" }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 ease-out group-hover/brandcars:opacity-100 bg-[radial-gradient(circle_at_12%_16%,rgba(125,211,252,0.26),transparent_40%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.22),transparent_42%),radial-gradient(circle_at_52%_88%,rgba(147,197,253,0.2),transparent_36%)]" />
      <motion.div
        className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-5 lg:px-7"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? undefined : { duration: 0.32, ease: "easeOut" }}
        viewport={shouldReduceMotion ? undefined : { once: false, amount: 0.22, margin: "0px 0px -8% 0px" }}
      >
        <div className="flex flex-col gap-3 group/brands">
          <div className="flex flex-wrap items-center gap-3 w-full sm:flex-nowrap sm:items-center sm:justify-between">
            <div className="order-1 w-full sm:w-auto flex items-center gap-3 sm:gap-4 group hover:[&_span[data-underline]]:scale-x-100 group-hover/brands:[&_span[data-underline]]:scale-x-100">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner">
                <Factory size={18} />
              </span>
              <h3 className="text-xl font-semibold tracking-tight text-slate-700 relative inline-block drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)]">
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
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? undefined : { duration: 0.22, ease: "easeOut" }}
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
