"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

const MAX_HISTORY          = 8;
const SUGGESTION_COUNT     = 5;
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
const CACHE_TTL   = 90_000;
const sCache      = new Map<string, SuggestionProduct[]>();
const sCacheTimes = new Map<string, number>();

const ck  = (q: string, f: SearchFilter) => `${f}:${q}`;
const cGet = (key: string): SuggestionProduct[] | null => {
  const t = sCacheTimes.get(key);
  if (!t || Date.now() - t > CACHE_TTL) return null;
  return sCache.get(key) ?? null;
};
const cSet = (key: string, val: SuggestionProduct[]) => {
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

const CYR: Record<string, string> = {
  й:"q",ц:"w",у:"e",к:"r",е:"t",н:"y",г:"u",ш:"i",щ:"o",з:"p",
  ф:"a",і:"s",в:"d",а:"f",п:"g",р:"h",о:"j",л:"k",д:"l",
  я:"z",ч:"x",с:"c",м:"v",и:"b",т:"n",ь:"m",
};
const toArticle = (v: string) =>
  v.toLowerCase().replace(/[Ѐ-ӿ]/g, ch => CYR[ch] ?? "").replace(/[^a-z0-9/]/g, "");

const fetchSuggestions = async (
  query: string, filter: SearchFilter, signal: AbortSignal
): Promise<SuggestionProduct[]> => {
  const res = await fetch("/api/catalog-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searchQuery: query, searchFilter: filter, page: 1, limit: SUGGESTION_COUNT }),
    signal,
  });
  if (!res.ok) return [];
  const data = await res.json() as { items?: SuggestionProduct[] };
  return (data.items ?? []).slice(0, SUGGESTION_COUNT);
};

// ── SuggestionImage ─────────────────────────────────────────────────────────
const SuggestionImage: React.FC<{ code: string; article: string; name: string; hasPhoto?: boolean }> = ({
  code, article, name, hasPhoto,
}) => {
  const [failed, setFailed] = useState(false);
  const src = buildProductImagePath(code, article, { catalog: true });
  if (hasPhoto === false || failed || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-white/8 bg-slate-700/60">
        <ImageOff size={13} className="text-slate-500" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/8 bg-slate-700/60">
      <Image src={src} alt={name} fill sizes="44px" className="object-contain p-0.5" onError={() => setFailed(true)} />
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
  const [loading,     setLoading]     = useState(false);
  const [fallback,    setFallback]    = useState<string | null>(null);
  const [euroRate,    setEuroRate]    = useState(DEFAULT_EURO_RATE);

  const abortRef    = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const prefetched  = useRef(false);
  const router = useRouter();

  const prefetch = useCallback(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    router.prefetch("/katalog");
  }, [router]);

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

  // suggestions with cache
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();

    if (trimmed.length < SUGGESTION_MIN_CHARS) {
      setSuggestions([]); setLoading(false); setFallback(null);
      abortRef.current?.abort();
      return;
    }

    const ef: SearchFilter = filter === "article" ? "name" : filter;
    const key = ck(trimmed, ef);
    const cached = cGet(key);

    if (cached) {
      setSuggestions(cached); setLoading(false); setFallback(null);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const results = await fetchSuggestions(trimmed, ef, ctrl.signal);
        if (ctrl.signal.aborted) return;

        if (results.length > 0) {
          cSet(key, results);
          setSuggestions(results); setFallback(null);
          return;
        }

        // fallback: cyrillic → article transliteration
        if ((ef === "all" || ef === "name") && !trimmed.includes(" ")) {
          const artQ = toArticle(trimmed);
          if (artQ.length >= 2 && artQ !== trimmed && /\d/.test(artQ)) {
            const artKey = ck(artQ, "name");
            const artCached = cGet(artKey);
            const artRes = artCached ?? await fetchSuggestions(artQ, "name", ctrl.signal);
            if (ctrl.signal.aborted) return;
            if (artRes.length > 0) {
              if (!artCached) cSet(artKey, artRes);
              setSuggestions(artRes); setFallback(artQ);
              return;
            }
          }
        }

        setSuggestions([]); setFallback(null);
      } catch {
        if (!ctrl.signal.aborted) { setSuggestions([]); setFallback(null); }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter]);

  const saveHistory = (q: string) => {
    const next = [q, ...history.filter(h => h !== q)].slice(0, MAX_HISTORY);
    setHistory(next);
    if (typeof window !== "undefined")
      safeSetStorageItem(window.localStorage, "searchHistory", JSON.stringify(next));
  };

  const doSearch = (overrideQuery?: string) => {
    const raw = overrideQuery ?? query;
    const sanitized = filter === "article"
      ? toArticle(raw)
      : raw.replace(/\s+/g, " ").trim();
    if (!sanitized) return;
    prefetch();
    const ef: SearchFilter = filter === "article" ? "name" : filter;
    const analyticsSearchTerm = sanitizeAnalyticsSearchTerm(sanitized);
    if (analyticsSearchTerm) {
      pushAnalyticsEvent("search", {
        search_term: analyticsSearchTerm,
        search_filter: ef,
        search_source: "header",
      });
    }
    router.push(`/katalog?search=${encodeURIComponent(sanitized)}&filter=${ef}`);
    onSearch(sanitized, ef);
    saveHistory(raw.trim() || sanitized);
    setQuery(""); setDropdown(false); setFallback(null);
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") doSearch(); };

  const activeLabel = FILTER_ITEMS.find(f => f.value === filter)?.label ?? "Всі";
  const hasSugg     = query.trim().length >= SUGGESTION_MIN_CHARS;

  // shared dropdown class
  const dropClass =
    "absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-white/[0.09] bg-[rgba(8,13,28,0.97)] shadow-[0_28px_64px_rgba(2,6,23,0.65),0_8px_24px_rgba(2,6,23,0.40),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl animate-fadeIn";

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
      <div className={`font-ui flex w-full items-center overflow-hidden rounded-[16px] border transition-[border-color,box-shadow] duration-200 ${
        barActive
          ? "border-sky-400/40 bg-[image:linear-gradient(145deg,rgba(26,46,82,0.98),rgba(12,80,130,0.96)_54%,rgba(8,96,128,0.94))] shadow-[0_0_0_3px_rgba(56,189,248,0.10),0_6px_20px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.16)]"
          : "border-white/[0.13] bg-[image:linear-gradient(145deg,rgba(255,255,255,0.06)_0%,rgba(56,189,248,0.08)_55%,rgba(99,102,241,0.07)_100%)] shadow-[0_2px_8px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.10)] hover:border-white/[0.22] hover:shadow-[0_4px_14px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.14)]"
      }`}>

        {/* search icon */}
        <span className="pointer-events-none shrink-0 pl-3 pr-1.5 text-slate-400">
          <Search size={15} strokeWidth={2.2} aria-hidden="true" />
        </span>

        {/* input */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Назва, артикул, код..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="font-ui min-w-0 flex-1 bg-transparent py-2 text-[13.5px] font-semibold tracking-[-0.005em] text-slate-100 outline-none placeholder:font-normal placeholder:text-slate-400/55 sm:text-sm"
          value={query}
          onChange={e => { prefetch(); setQuery(e.target.value); setDropdown(true); }}
          onFocus={() => { prefetch(); setDropdown(true); }}
          onKeyDown={onKey}
          data-search="true"
        />

        {/* clear */}
        {query && (
          <button
            type="button"
            aria-label="Очистити"
            className="shrink-0 p-2 text-slate-500 transition-colors duration-100 hover:text-slate-200"
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
          className={`flex self-stretch shrink-0 items-center gap-1 border-l border-white/[0.09] px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors duration-100 ${
            filterOpen
              ? "bg-sky-500/10 text-sky-300"
              : filter !== "all"
              ? "text-sky-400 hover:text-sky-200"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {filter === "all"
            ? <SlidersHorizontal size={13} strokeWidth={2} />
            : <span>{activeLabel}</span>
          }
          <ChevronDown
            size={10} strokeWidth={2.5}
            className={`transition-transform duration-150 ${filterOpen ? "rotate-180 text-sky-300" : ""}`}
          />
        </button>

        {/* ── submit ─────────────────────────────────────────────────── */}
        <button
          type="submit"
          aria-label="Пошук"
          className="group relative flex self-stretch shrink-0 items-center gap-1.5 overflow-hidden rounded-r-[15px] bg-[image:linear-gradient(145deg,rgba(215,30,55,0.97),rgba(239,56,72,0.94)_50%,rgba(252,100,115,0.90))] px-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.14)] transition-[filter,box-shadow] duration-150 hover:brightness-[1.09] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_16px_rgba(239,68,68,0.22)] active:brightness-90 active:scale-[0.97] cursor-pointer sm:px-4"
          onClick={() => doSearch()}
        >
          {/* shimmer sweep */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 ease-out group-hover:translate-x-full"
          />
          <Search size={15} strokeWidth={2.5} className="relative" />
          <span className="relative hidden text-[11.5px] font-bold tracking-[0.05em] sm:inline">
            Пошук
          </span>
        </button>
      </div>

      {/* ── Filter dropdown ─────────────────────────────────────────────
          Rendered OUTSIDE overflow-hidden so it's not clipped.
          Positioned to align with the filter button (right of submit btn).
      ───────────────────────────────────────────────────────────────── */}
      {filterOpen && (
        <div className="absolute right-[52px] top-[calc(100%+5px)] z-[60] min-w-[130px] overflow-hidden rounded-[14px] border border-white/[0.10] bg-[rgba(9,14,30,0.98)] py-1 shadow-[0_18px_44px_rgba(2,6,23,0.58),0_6px_16px_rgba(2,6,23,0.32),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl animate-fadeIn">
          {FILTER_ITEMS.map(f => (
            <button
              key={f.value}
              type="button"
              className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[12.5px] font-semibold transition-colors duration-100 ${
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
          <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-slate-500">
              <Search size={10} className="text-sky-500" strokeWidth={2.5} />
              {fallback
                ? <><span>Артикул:</span><span className="font-mono normal-case tracking-normal text-amber-400">&nbsp;{fallback}</span></>
                : filter !== "all"
                ? <span className="normal-case tracking-[0.04em] capitalize text-sky-400/80">{activeLabel}</span>
                : "Швидкий пошук"
              }
            </span>
            {loading
              ? <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-600 border-t-sky-400" />
              : suggestions.length > 0
              ? <span className="text-[10.5px] text-slate-600">{suggestions.length}/{SUGGESTION_COUNT}</span>
              : null
            }
          </div>

          {/* empty */}
          {!loading && suggestions.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]">
                <Search size={18} className="text-slate-600" strokeWidth={1.5} />
              </span>
              <p className="text-[12.5px] font-semibold text-slate-500">Нічого не знайдено</p>
              <p className="text-[11px] text-slate-600">Спробуйте змінити запит або фільтр</p>
            </div>
          )}

          {/* items */}
          <div className="max-h-[min(60svh,360px)] overflow-y-auto overscroll-contain">
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
                href={productHref}
                className={`font-ui group flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors duration-100 hover:bg-white/[0.055] active:bg-white/[0.08] cursor-pointer sm:gap-3 sm:px-3.5 sm:py-3.5 ${
                  i < suggestions.length - 1 ? "border-b border-white/[0.05]" : ""
                }`}
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
                <div className="h-10 w-10 shrink-0 sm:h-11 sm:w-11">
                  <SuggestionImage code={p.code} article={p.article} name={p.name} hasPhoto={p.hasPhoto} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold leading-snug text-slate-100 group-hover:text-white sm:text-[13px]">
                    {p.name.replace(/\s*\(.*?\)\s*/g, " ").trim()}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1">
                    {p.article && (
                      <span className="rounded bg-white/[0.07] px-1.5 py-px font-mono text-[10px] text-slate-400">
                        {p.article}
                      </span>
                    )}
                    {p.producer && (
                      <span className="max-w-[70px] truncate text-[10px] text-sky-400/75 sm:max-w-[120px]">
                        {p.producer}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {priceStr
                    ? <span className="whitespace-nowrap text-[11.5px] font-bold tracking-tight text-emerald-400 sm:text-[12.5px]">{priceStr}</span>
                    : <span className="text-[10px] text-slate-700">—</span>
                  }
                  <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${inStock ? "text-emerald-500/75" : "text-red-400/70"}`}>
                    {inStock
                      ? <><PackageCheck size={10} strokeWidth={2.5} /><span className="hidden sm:inline"> В наявн.</span></>
                      : <><PackageX size={10} strokeWidth={2.5} /><span className="hidden sm:inline"> Немає</span></>
                    }
                  </span>
                </div>
              </SmartLink>
            );
          })}
          </div>

          {/* show all */}
          <button
            type="button"
            className="font-ui group flex w-full items-center justify-center gap-2 border-t border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[12px] font-semibold text-sky-400 transition-colors duration-100 hover:bg-white/[0.06] hover:text-sky-300 cursor-pointer"
            onClick={() => doSearch()}
          >
            <Search size={12} strokeWidth={2.5} />
            Показати всі результати
            <ChevronRight size={12} strokeWidth={2.5} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
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
              <ChevronRight size={12} className="shrink-0 text-slate-600 transition-transform duration-100 group-hover:translate-x-0.5" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
