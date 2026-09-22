"use client";

import { useState, useEffect, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import SmartLink from "app/components/SmartLink";
import {
  Search, Clock, X, ImageOff, ChevronRight,
  PackageCheck, PackageX, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import {
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "app/lib/safe-storage";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import { normalizeSearchQuery } from "app/lib/catalog-search";
import {
  pushAnalyticsEvent,
  pushEcommerceEvent,
  sanitizeAnalyticsSearchTerm,
} from "app/lib/gtm";

interface SearchBarProps {
  onSearch: (
    searchQuery: string,
    filterBy: "all" | "article" | "name" | "code" | "producer" | "description"
  ) => void;
}

type SuggestionProduct = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  priceEuro?: number | null;
  hasPhoto?: boolean;
};

type SuggestionResult = {
  items: SuggestionProduct[];
  totalCount: number | null;
  correctedQuery?: string;
};

const MAX_HISTORY          = 8;
const SUGGESTION_COUNT     = 8;
const SUGGESTION_MIN_CHARS = 2;
const DEBOUNCE_MS          = 180;
const DEFAULT_EURO_RATE    = 50;
const EURO_RATE_CACHE_KEY  = "partson:v1:euro-rate";

type SearchFilter = "all" | "article" | "name" | "code" | "producer" | "description";

const FILTER_ITEMS: { value: SearchFilter; label: string }[] = [
  { value: "all",         label: "Всі" },
  { value: "article",     label: "Артикул" },
  { value: "name",        label: "Назва" },
  { value: "code",        label: "Код" },
  { value: "producer",    label: "Виробник" },
  { value: "description", label: "Опис" },
];

// ── module-level suggestion cache ──────────────────────────────────────────
const CACHE_MAX   = 60;
const CACHE_TTL   = 60_000;
const sCache      = new Map<string, SuggestionResult>();
const sCacheTimes = new Map<string, number>();
const sPending    = new Map<string, Promise<SuggestionResult>>();

const normalizeSearchKey = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
const ck  = (q: string, f: SearchFilter) => `${f}:${normalizeSearchKey(q)}`;
const cGet = (key: string): SuggestionResult | null => {
  const t = sCacheTimes.get(key);
  if (!t || Date.now() - t > CACHE_TTL) return null;
  return sCache.get(key) ?? null;
};
const cSet = (key: string, val: SuggestionResult) => {
  if (sCache.size >= CACHE_MAX) {
    const oldest = [...sCacheTimes.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
    if (oldest) { sCache.delete(oldest); sCacheTimes.delete(oldest); }
  }
  sCache.set(key, val);
  sCacheTimes.set(key, Date.now());
};

// ── helpers ─────────────────────────────────────────────────────────────────
const readEuroRate = (): number => {
  if (typeof window === "undefined") return DEFAULT_EURO_RATE;
  for (const st of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = st.getItem(EURO_RATE_CACHE_KEY);
      if (!raw) continue;
      const p = JSON.parse(raw) as { v?: number };
      if (typeof p?.v === "number" && p.v > 0) return p.v;
    } catch { /* ignore */ }
  }
  return DEFAULT_EURO_RATE;
};

const formatUAH = (eur: number | null | undefined, rate: number): string | null => {
  if (typeof eur !== "number" || !Number.isFinite(eur) || eur <= 0) return null;
  return Math.round(eur * rate).toLocaleString("uk-UA") + " ₴";
};

const fetchSuggestions = async (
  query: string, filter: SearchFilter
): Promise<SuggestionResult> => {
  const key = ck(query, filter);
  const existing = sPending.get(key);
  if (existing) return existing;

  const request = fetch("/api/catalog-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searchQuery: query, searchFilter: filter, page: 1, limit: SUGGESTION_COUNT }),
    signal: AbortSignal.timeout(12_000),
  }).then(async (res) => {
    const data = await res.json() as {
      items?: SuggestionProduct[]; totalCount?: number | null; correctedQuery?: string;
      serviceUnavailable?: boolean; message?: string;
    };
    if (!res.ok || data.serviceUnavailable || !Array.isArray(data.items)) {
      throw new Error("Пошук тимчасово недоступний. Спробуйте ще раз.");
    }
    return {
      items: data.items.slice(0, SUGGESTION_COUNT),
      correctedQuery: data.correctedQuery,
      totalCount:
        typeof data.totalCount === "number" && Number.isFinite(data.totalCount)
          ? Math.max(0, data.totalCount)
          : null,
    };
  }).finally(() => {
    sPending.delete(key);
  });

  sPending.set(key, request);
  return request;
};

// ── SuggestionImage ─────────────────────────────────────────────────────────
const SuggestionImage: React.FC<{ code: string; article: string; name: string; hasPhoto?: boolean }> = ({
  code, article, name, hasPhoto,
}) => {
  const [failed, setFailed] = useState(false);
  const src = buildProductImagePath(code, article, { catalog: true });
  if (hasPhoto === false || failed || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-white/10 bg-[image:linear-gradient(145deg,rgba(51,65,85,0.72),rgba(15,23,42,0.88))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <ImageOff size={16} className="text-slate-500" strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/12 bg-white/[0.94] shadow-[0_5px_14px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.85)]">
      <Image src={src} alt={name} fill sizes="(max-width: 640px) 48px, 56px" className="object-contain p-1" onError={() => setFailed(true)} />
    </div>
  );
};

// ── SearchBar ───────────────────────────────────────────────────────────────
const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [query,      setQuery]      = useState("");
  const [filter,     setFilter]     = useState<SearchFilter>("all");
  const [history,    setHistory]    = useState<string[]>([]);
  const [dropdown,   setDropdown]   = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [suggestions, setSuggestions] = useState<SuggestionProduct[]>([]);
  const [totalCount,  setTotalCount]  = useState<number | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [fallback,    setFallback]    = useState<string | null>(null);
  const [euroRate,    setEuroRate]    = useState(DEFAULT_EURO_RATE);

  const [searchError, setSearchError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // init
  useEffect(() => {
    setEuroRate(readEuroRate());
    if (typeof window === "undefined") return;
    try {
      const raw = safeGetStorageItem(window.localStorage, "searchHistory");
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) { safeRemoveStorageItem(window.localStorage, "searchHistory"); return; }
      setHistory(
        parsed.filter((x): x is string => typeof x === "string")
              .map(x => x.trim()).filter(Boolean).slice(0, MAX_HISTORY)
      );
    } catch { safeRemoveStorageItem(window.localStorage, "searchHistory"); }
  }, []);

  // close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setDropdown(false);
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Shared network requests are independent of a particular input's lifetime.
  // An abandoned consumer cannot abort a newer consumer of the same query.
  useEffect(() => {
    let current = true;
    const trimmed = normalizeSearchQuery(query);
    setActiveIndex(-1);
    setSearchError(null);
    setSuggestions([]);
    setTotalCount(null);
    setFallback(null);
    if (!dropdown || trimmed.length < SUGGESTION_MIN_CHARS) {
      setLoading(false);
      return;
    }
    const key = ck(trimmed, filter);
    const apply = (result: SuggestionResult) => {
      setSuggestions(result.items);
      setTotalCount(result.totalCount);
      setFallback(result.correctedQuery || null);
      setLoading(false);
    };
    const cached = cGet(key);
    if (cached) { apply(cached); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      fetchSuggestions(trimmed, filter).then((result) => {
        cSet(key, result);
        if (current) apply(result);
      }).catch(() => {
        if (current) {
          setSearchError("Пошук тимчасово недоступний. Спробуйте ще раз.");
          setLoading(false);
        }
      });
    }, DEBOUNCE_MS);
    return () => { current = false; clearTimeout(timer); };
  }, [query, filter, dropdown, retry]);

  const saveHistory = (q: string) => {
    const next = [q, ...history.filter(h => h !== q)].slice(0, MAX_HISTORY);
    setHistory(next);
    if (typeof window !== "undefined")
      safeSetStorageItem(window.localStorage, "searchHistory", JSON.stringify(next));
  };

  const doSearch = (overrideQuery?: string) => {
    const raw = overrideQuery ?? query;
    const sanitized = normalizeSearchQuery(raw);
    if (!sanitized) return;
    const ef = filter;
    const analyticsSearchTerm = sanitizeAnalyticsSearchTerm(sanitized);
    if (analyticsSearchTerm) {
      pushAnalyticsEvent("search", {
        search_term: analyticsSearchTerm,
        search_filter: ef,
        search_source: "header",
      });
    }
    router.push(`/katalog?search=${encodeURIComponent(sanitized)}&filter=${ef}&reset=search`);
    onSearch(sanitized, ef);
    saveHistory(raw.trim() || sanitized);
    setQuery(""); setDropdown(false); setFallback(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault(); setDropdown(false); setFilterOpen(false); setActiveIndex(-1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); setDropdown(true);
      if (suggestions.length) {
        const next = e.key === "ArrowDown"
          ? (activeIndex + 1) % suggestions.length
          : (activeIndex <= 0 ? suggestions.length : activeIndex) - 1;
        setActiveIndex(next);
        document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (dropdown && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.click();
      else doSearch();
    }
  };

  const activeLabel = FILTER_ITEMS.find(f => f.value === filter)?.label ?? "Всі";
  const hasSugg     = query.trim().length >= SUGGESTION_MIN_CHARS;
  const formattedTotalCount = totalCount?.toLocaleString("uk-UA") ?? null;

  // shared dropdown class
  const dropClass =
    "absolute left-0 right-0 z-50 mt-2.5 overflow-hidden rounded-[20px] border border-sky-100/25 bg-[image:radial-gradient(circle_at_12%_-10%,rgba(125,211,252,0.20),transparent_38%),radial-gradient(circle_at_92%_110%,rgba(45,212,191,0.10),transparent_38%),linear-gradient(155deg,#243754_0%,#182a45_48%,#12233c_100%)] shadow-[0_32px_76px_rgba(2,6,23,0.58),0_12px_28px_rgba(2,6,23,0.36),0_0_0_1px_rgba(125,211,252,0.06),inset_0_1px_0_rgba(255,255,255,0.15)] ring-1 ring-black/10 animate-fadeIn";

  // active state for search bar
  const barActive = dropdown && (hasSugg || history.length > 0);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-full" suppressHydrationWarning>

      {/* ── Search bar row ──────────────────────────────────────────────── */}
      {/*
        NOTE: overflow-hidden clips absolutely-positioned children,
        so the filter DROPDOWN is rendered as a sibling BELOW this div.
        The filter BUTTON stays inside for correct visual placement.
      */}
      <div className={`group/search font-ui relative isolate flex h-11 w-full items-center overflow-hidden rounded-[16px] border transition-[background-color,border-color,box-shadow] duration-300 ease-out ${
        barActive
          ? "border-sky-300/65 bg-[image:linear-gradient(180deg,rgba(15,31,58,0.98)_0%,rgba(8,18,39,0.98)_100%)] shadow-[0_0_0_3px_rgba(56,189,248,0.13),0_12px_28px_rgba(2,6,23,0.44),0_4px_8px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(2,6,23,0.72)]"
          : "border-white/25 bg-[image:linear-gradient(180deg,rgba(30,45,72,0.94)_0%,rgba(12,24,48,0.96)_100%)] shadow-[0_9px_22px_rgba(2,6,23,0.38),0_3px_7px_rgba(2,6,23,0.30),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(2,6,23,0.66)] hover:border-sky-200/40 hover:shadow-[0_13px_28px_rgba(2,6,23,0.44),0_4px_9px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(2,6,23,0.70)] focus-within:border-sky-300/65 focus-within:shadow-[0_0_0_3px_rgba(56,189,248,0.13),0_12px_28px_rgba(2,6,23,0.44),0_4px_8px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.15)]"
      }`}>

        {/* One combined search action on the left: the old passive icon and
            the submit button duplicated the same magnifier at both ends. */}
        <button
          type="button"
          aria-label="Пошук"
          className="group relative flex min-w-10 self-stretch shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-l-[15px] border-r border-rose-200/25 bg-[image:linear-gradient(145deg,#fb7185_0%,#e11d48_42%,#9f1239_100%)] px-3 text-white [text-shadow:0_1px_2px_rgba(76,5,25,0.7)] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),inset_0_-3px_5px_rgba(76,5,25,0.34),4px_0_12px_rgba(225,29,72,0.18)] transition-[background-image,box-shadow,filter,transform] duration-200 ease-out before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.42),inset_0_-3px_5px_rgba(76,5,25,0.26),5px_0_18px_rgba(244,63,94,0.30)] active:translate-y-px active:brightness-95 active:shadow-[inset_0_3px_7px_rgba(76,5,25,0.40),2px_0_8px_rgba(225,29,72,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 sm:min-w-20 sm:px-3.5"
          onClick={() => doSearch()}
        >
          <Search size={15} strokeWidth={2.5} className="relative" aria-hidden="true" />
          <span className="relative hidden text-[11.5px] font-bold tracking-[0.05em] sm:inline">
            Пошук
          </span>
        </button>

        {/* input */}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Пошук товарів"
          aria-autocomplete="list"
          aria-expanded={dropdown && hasSugg}
          aria-controls={dropdown && hasSugg ? listId : undefined}
          aria-activedescendant={dropdown && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder="Назва, артикул, код..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="font-ui min-w-0 self-stretch flex-1 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.025),transparent_45%,rgba(2,6,23,0.10))] px-3 py-1.5 text-[16px] font-semibold tracking-[-0.005em] text-slate-50 shadow-[inset_0_1px_2px_rgba(255,255,255,0.025),inset_0_-2px_5px_rgba(2,6,23,0.20)] outline-none placeholder:font-normal placeholder:text-slate-400/75 sm:text-[13px]"
          value={query}
          onChange={e => { setQuery(e.target.value); setDropdown(true); }}
          onFocus={() => setDropdown(true)}
          onKeyDown={onKey}
          data-search="true"
        />

        {/* clear */}
        {query && (
          <button
            type="button"
            aria-label="Очистити"
            className="shrink-0 rounded-full p-2 text-slate-500 transition-colors duration-300 ease-out hover:bg-white/[0.06] hover:text-slate-200"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}

        {/* ── filter trigger (visual part only — dropdown is outside) ── */}
        <button
          type="button"
          aria-label="Фільтр пошуку"
          onClick={() => { setFilterOpen(v => !v); setDropdown(false); }}
          className={`flex min-w-10 self-stretch shrink-0 items-center justify-center gap-1 border-l border-white/12 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.015))] px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] shadow-[inset_1px_0_0_rgba(255,255,255,0.025),inset_0_1px_0_rgba(255,255,255,0.07)] transition-[background-color,color,box-shadow] duration-300 ease-out sm:min-w-12 ${
            filterOpen
              ? "!bg-sky-500/15 text-sky-200 shadow-[inset_0_3px_8px_rgba(2,6,23,0.30),inset_1px_0_0_rgba(255,255,255,0.04)]"
              : filter !== "all"
              ? "text-sky-300 hover:bg-white/[0.06] hover:text-sky-100"
              : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {filter === "all"
            ? <SlidersHorizontal size={13} strokeWidth={2} />
            : <span>{activeLabel}</span>
          }
          <ChevronDown
            size={10} strokeWidth={2.5}
            className={`transition-[color,transform] duration-300 ease-out ${filterOpen ? "rotate-180 text-sky-300" : ""}`}
          />
        </button>

      </div>

      {/* ── Filter dropdown ─────────────────────────────────────────────
          Rendered OUTSIDE overflow-hidden so it's not clipped.
          Positioned to align with the filter button at the right edge.
      ───────────────────────────────────────────────────────────────── */}
      {filterOpen && (
        <div className="absolute right-0 top-[calc(100%+5px)] z-[60] min-w-[130px] overflow-hidden rounded-[14px] border border-white/[0.10] bg-[rgba(9,14,30,0.98)] py-1 shadow-[0_18px_44px_rgba(2,6,23,0.58),0_6px_16px_rgba(2,6,23,0.32),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl animate-fadeIn">
          {FILTER_ITEMS.map(f => (
            <button
              key={f.value}
              type="button"
              className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[12.5px] font-semibold transition-colors duration-300 ease-out ${
                filter === f.value
                  ? "bg-sky-500/[0.13] text-sky-300"
                  : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
              }`}
              onClick={() => { setFilter(f.value); setFilterOpen(false); inputRef.current?.focus(); }}
            >
              {f.label}
              {filter === f.value && (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Suggestions dropdown (≥ 2 chars) ────────────────────────── */}
      {dropdown && hasSugg && (
        <div className={dropClass}>

          {/* header */}
          <div className="flex min-h-12 items-center justify-between border-b border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 sm:px-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.13em] text-sky-300/90">
              {fallback
                ? <><span>Пошук за запитом:</span><span className="font-mono normal-case tracking-normal text-amber-300">&nbsp;{fallback}</span></>
                : filter !== "all"
                ? <span>Результати · {activeLabel}</span>
                : "Знайдені товари"
              }
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">Оберіть товар або перегляньте всі результати</p>
            </div>
            {loading
              ? <span className="ml-3 inline-flex items-center gap-2 rounded-full border border-sky-300/10 bg-sky-400/[0.06] px-2.5 py-1 text-[10px] font-semibold text-sky-300/80"><span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-600 border-t-sky-400" />Оновлення</span>
              : null
            }
          </div>

          {/* empty */}
          {loading && suggestions.length === 0 && (
            <div className="space-y-1.5 p-2" aria-label="Завантаження товарів" aria-live="polite">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-3 rounded-[15px] border border-white/[0.04] bg-white/[0.025] p-2.5">
                  <span className="h-12 w-12 shrink-0 rounded-xl bg-white/[0.07] sm:h-14 sm:w-14" />
                  <span className="min-w-0 flex-1">
                    <span className="block h-3 w-[82%] rounded-full bg-white/[0.08]" />
                    <span className="mt-2 block h-2.5 w-[48%] rounded-full bg-white/[0.05]" />
                  </span>
                  <span className="h-5 w-16 rounded-full bg-emerald-300/[0.07]" />
                </div>
              ))}
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 px-4 py-9 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <PackageX size={19} className="text-slate-500" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <p className="text-[13px] font-bold text-slate-300">{searchError || "Товарів за цим запитом немає"}</p>
              {searchError
                ? <button type="button" className="text-sm text-sky-300 underline" onClick={() => setRetry((value) => value + 1)}>Повторити пошук</button>
                : <p className="max-w-[28ch] text-[11px] leading-relaxed text-slate-500">Перевірте артикул або спробуйте коротшу назву</p>}
            </div>
          )}

          {/* items */}
          <div id={listId} role="listbox" aria-label="Знайдені товари" aria-busy={loading} className="max-h-[min(62svh,410px)] space-y-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-gutter:stable] sm:p-2">
          {suggestions.map((p, i) => {
            const priceStr = formatUAH(p.priceEuro, euroRate);
            const inStock  = typeof p.quantity === "number" ? p.quantity > 0 : true;
            const productHref = buildProductPath({
              code: p.code,
              article: p.article,
              name: p.name,
              producer: p.producer,
            });
            return (
              <SmartLink
                key={p.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={activeIndex === i}
                style={activeIndex === i ? { backgroundColor: "rgba(125,211,252,0.15)" } : undefined}
                href={productHref}
                className="font-ui group relative flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-[15px] border border-transparent bg-white/[0.025] px-2.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-sky-300/15 hover:bg-sky-300/[0.065] hover:shadow-[0_9px_22px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.045)] active:translate-y-0 active:bg-white/[0.08] sm:gap-3 sm:px-3 sm:py-3"
                onClick={() => {
                  const price =
                    typeof p.priceEuro === "number" &&
                    Number.isFinite(p.priceEuro) &&
                    p.priceEuro > 0
                      ? Math.round(p.priceEuro * euroRate)
                      : null;
                  pushEcommerceEvent("select_item", {
                    currency: "UAH",
                    item_list_id: "search_suggestions",
                    item_list_name: "Пошукові підказки",
                    items: [
                      {
                        item_id: p.code || p.article,
                        item_name: p.name || "Товар",
                        ...(p.producer ? { item_brand: p.producer } : {}),
                        ...(p.article ? { item_variant: p.article } : {}),
                        item_list_id: "search_suggestions",
                        item_list_name: "Пошукові підказки",
                        index: i,
                        ...(price != null ? { price } : {}),
                        quantity: 1,
                      },
                    ],
                  });
                  setDropdown(false); setQuery(""); onSearch(p.name, "name");
                }}
              >
                <div className="h-12 w-12 shrink-0 sm:h-14 sm:w-14">
                  <SuggestionImage code={p.code} article={p.article} name={p.name} hasPhoto={p.hasPhoto} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12.5px] font-bold leading-[1.3] tracking-[-0.01em] text-slate-100 transition-colors group-hover:text-white sm:text-[13.5px]">
                    {p.name}
                  </p>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                    {p.article && (
                      <span className="rounded-md border border-white/[0.07] bg-white/[0.055] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-slate-400">
                        {p.article}
                      </span>
                    )}
                    {p.producer && (
                      <span className="max-w-[90px] truncate rounded-md bg-sky-400/[0.07] px-1.5 py-0.5 text-[9.5px] font-bold text-sky-300/80 sm:max-w-[150px]">
                        {p.producer}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-0.5 flex max-w-[104px] shrink-0 flex-col items-end justify-center gap-1.5 self-stretch sm:ml-1 sm:max-w-none">
                  {priceStr
                    ? <span className="whitespace-nowrap text-[12px] font-black tracking-[-0.02em] text-emerald-300 sm:text-[13.5px]">{priceStr}</span>
                    : <span className="text-right text-[9px] font-semibold leading-tight text-slate-600 sm:text-[10px]">Ціна за запитом</span>
                  }
                  <span className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${inStock ? "border-emerald-300/10 bg-emerald-400/[0.07] text-emerald-400/90" : "border-rose-300/10 bg-rose-400/[0.07] text-rose-300/80"}`}>
                    {inStock
                      ? <><PackageCheck size={10} strokeWidth={2.5} aria-hidden="true" /><span className="max-[360px]:hidden">В наявності</span></>
                      : <><PackageX size={10} strokeWidth={2.5} aria-hidden="true" /><span>Немає</span></>
                    }
                  </span>
                </div>
              </SmartLink>
            );
          })}
          </div>

          {/* show all */}
          {suggestions.length > 0 ? <button
            type="button"
            className="font-ui group flex w-full cursor-pointer items-center justify-center gap-2.5 border-t border-white/[0.08] bg-[image:linear-gradient(180deg,rgba(255,255,255,0.035),rgba(56,189,248,0.045))] px-4 py-3.5 text-[12px] font-bold text-sky-300 transition-[background-color,color] duration-200 hover:bg-sky-400/[0.09] hover:text-sky-100"
            onClick={() => doSearch()}
          >
            <span>Показати всі результати</span>
            {formattedTotalCount !== null ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-sky-200/15 bg-sky-300/[0.10] px-2 py-0.5 text-[10.5px] font-black tabular-nums text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors group-hover:bg-sky-200/[0.16]">
                {formattedTotalCount}
              </span>
            ) : loading ? (
              <span className="h-5 w-9 animate-pulse rounded-full bg-white/[0.07]" aria-hidden="true" />
            ) : null}
            <ChevronRight size={12} strokeWidth={2.5} className="transition-colors duration-300 group-hover:text-sky-200" />
          </button> : null}
        </div>
      )}

      {/* ── History dropdown (< 2 chars) ─────────────────────────────── */}
      {dropdown && !hasSugg && history.length > 0 && (
        <div className={dropClass}>
          <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-slate-500">
              <Clock size={10} strokeWidth={2} />
              Історія
            </span>
            <button
              type="button"
              aria-label="Очистити історію"
              className="text-[10.5px] font-semibold text-slate-600 transition-colors hover:text-rose-400"
              onClick={() => {
                if (typeof window !== "undefined") safeRemoveStorageItem(window.localStorage, "searchHistory");
                setHistory([]);
              }}
            >
              Очистити
            </button>
          </div>
          {history.map((item, i) => (
            <button
              key={item}
              type="button"
              className={`font-ui group flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold text-slate-300 transition-colors duration-100 hover:bg-white/[0.055] hover:text-white cursor-pointer ${
                i < history.length - 1 ? "border-b border-white/[0.04]" : ""
              }`}
              onClick={() => doSearch(item)}
            >
              <Clock size={13} className="shrink-0 text-sky-500/70" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">{item}</span>
              <ChevronRight size={12} className="shrink-0 text-slate-600 transition-colors duration-300 group-hover:text-sky-400" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
