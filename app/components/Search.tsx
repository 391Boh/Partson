"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Clock, XCircle, ImageOff, ChevronRight, PackageCheck, PackageX } from "lucide-react";
import {
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "app/lib/safe-storage";
import { buildProductImagePath } from "app/lib/product-image-path";

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

const MAX_HISTORY = 8;
const SUGGESTION_COUNT = 5;
const SUGGESTION_MIN_CHARS = 3;
const SUGGESTION_DEBOUNCE_MS = 280;
const DEFAULT_EURO_RATE = 50;
const EURO_RATE_CACHE_KEY = "partson:v1:euro-rate";
type SearchFilter = "all" | "article" | "name" | "code" | "producer" | "description";

const readEuroRate = (): number => {
  if (typeof window === "undefined") return DEFAULT_EURO_RATE;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(EURO_RATE_CACHE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { v?: number; t?: number };
      if (typeof parsed?.v === "number" && parsed.v > 0) return parsed.v;
    } catch { /* ignore */ }
  }
  return DEFAULT_EURO_RATE;
};

const formatUAH = (eur: number | null | undefined, rate: number): string | null => {
  if (typeof eur !== "number" || !Number.isFinite(eur) || eur <= 0) return null;
  const uah = Math.round(eur * rate);
  return uah.toLocaleString("uk-UA") + " ₴";
};

const SuggestionImage: React.FC<{ code: string; article: string; name: string; hasPhoto?: boolean }> = ({
  code, article, name, hasPhoto,
}) => {
  const [failed, setFailed] = useState(false);
  const imgSrc = buildProductImagePath(code, article, { catalog: true });
  const showPlaceholder = hasPhoto === false || failed || !imgSrc;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-sky-100/55 bg-gradient-to-br from-white via-sky-50 to-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
      {showPlaceholder ? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff size={14} className="text-slate-400" strokeWidth={1.6} />
        </div>
      ) : (
        <Image
          src={imgSrc}
          alt={name}
          fill
          sizes="44px"
          className="object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  "й": "q",
  "ц": "w",
  "у": "e",
  "к": "r",
  "е": "t",
  "н": "y",
  "г": "u",
  "ш": "i",
  "щ": "o",
  "з": "p",
  "ф": "a",
  "і": "s",
  "в": "d",
  "а": "f",
  "п": "g",
  "р": "h",
  "о": "j",
  "л": "k",
  "д": "l",
  "я": "z",
  "ч": "x",
  "с": "c",
  "м": "v",
  "и": "b",
  "т": "n",
  "ь": "m",
};

const sanitizeArticleQuery = (value: string) =>
  value
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? "")
    .replace(/[^a-z0-9/]/g, "");

const fetchSuggestionsFromApi = async (
  query: string,
  filter: SearchFilter,
  signal: AbortSignal
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

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<SearchFilter>("all");

  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [suggestions, setSuggestions] = useState<SuggestionProduct[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsFallback, setSuggestionsFallback] = useState<{
    query: string;
    filter: SearchFilter;
  } | null>(null);
  const [euroRate, setEuroRate] = useState<number>(DEFAULT_EURO_RATE);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const suggestionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const catalogPrefetchedRef = useRef(false);

  const prefetchCatalog = useCallback(() => {
    if (catalogPrefetchedRef.current) return;
    catalogPrefetchedRef.current = true;
    router.prefetch("/katalog");
  }, [router]);

  useEffect(() => {
    setEuroRate(readEuroRate());
  }, []);

  // --- 1. Завантаження історії з localStorage ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = safeGetStorageItem(window.localStorage, "searchHistory");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (!Array.isArray(parsed)) {
        safeRemoveStorageItem(window.localStorage, "searchHistory");
        return;
      }
      const normalized = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, MAX_HISTORY);
      setHistory(normalized);
    } catch {
      safeRemoveStorageItem(window.localStorage, "searchHistory");
    }
  }, []);

  // --- 2. Закриття випадаючого при кліку поза полем ---
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // --- 2b. Завантаження підказок при введенні 3+ символів ---
  useEffect(() => {
    if (suggestionsDebounceRef.current) clearTimeout(suggestionsDebounceRef.current);

    const trimmed = searchQuery.trim();
    if (trimmed.length < SUGGESTION_MIN_CHARS) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsFallback(null);
      suggestionsAbortRef.current?.abort();
      return;
    }

    setSuggestionsLoading(true);

    suggestionsDebounceRef.current = setTimeout(async () => {
      suggestionsAbortRef.current?.abort();
      const controller = new AbortController();
      suggestionsAbortRef.current = controller;

      try {
        const effectiveFilter: SearchFilter = filterBy === "article" ? "name" : filterBy;

        // Рівень 1: звичайний пошук
        const results = await fetchSuggestionsFromApi(trimmed, effectiveFilter, controller.signal);
        if (controller.signal.aborted) return;
        if (results.length > 0) {
          setSuggestions(results);
          setSuggestionsFallback(null);
          return;
        }

        if (effectiveFilter === "all" || effectiveFilter === "name") {
          // Рівень 2: артикул — тільки для однослівних запитів (без пробілів)
          if (!trimmed.includes(" ")) {
            const articleQ = sanitizeArticleQuery(trimmed);
            if (articleQ.length >= 2 && articleQ !== trimmed) {
              const articleResults = await fetchSuggestionsFromApi(articleQ, "name", controller.signal);
              if (controller.signal.aborted) return;
              if (articleResults.length > 0) {
                setSuggestions(articleResults);
                setSuggestionsFallback({ query: articleQ, filter: "name" });
                return;
              }
            }
          }

          // Рівень 3: опис
          const descResults = await fetchSuggestionsFromApi(trimmed, "description", controller.signal);
          if (controller.signal.aborted) return;
          if (descResults.length > 0) {
            setSuggestions(descResults);
            setSuggestionsFallback({ query: trimmed, filter: "description" });
            return;
          }
        }

        setSuggestions([]);
        setSuggestionsFallback(null);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSuggestionsFallback(null);
        }
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      if (suggestionsDebounceRef.current) clearTimeout(suggestionsDebounceRef.current);
    };
  }, [searchQuery, filterBy]);

  // --- 3. Збереження історії ---
  const saveToHistory = (query: string) => {
    let newHistory = [query, ...history.filter((q) => q !== query)];
    if (newHistory.length > MAX_HISTORY) newHistory = newHistory.slice(0, MAX_HISTORY);

    setHistory(newHistory);
    if (typeof window !== "undefined") {
      safeSetStorageItem(
        window.localStorage,
        "searchHistory",
        JSON.stringify(newHistory)
      );
    }
  };

  // --- 4. Пошук ---
  const sanitizeQuery = (value: string, filter: SearchFilter) => {
    if (filter === "article") return sanitizeArticleQuery(value);
    return value.replace(/\s+/g, " ").trim();
  };

  const handleSearch = (query?: string) => {
    const explicitQuery = query !== undefined;
    const rawQuery = explicitQuery ? query : searchQuery;

    // Якщо є fallback з підказок — використати його запит і фільтр
    const useFallback = !explicitQuery && suggestionsFallback !== null;
    const queryToUse = useFallback ? suggestionsFallback!.query : rawQuery;
    const filterToUse: SearchFilter = useFallback ? suggestionsFallback!.filter : filterBy;

    const sanitized = sanitizeQuery(queryToUse, filterToUse);
    if (!sanitized) return;

    prefetchCatalog();
    const effectiveFilter: SearchFilter = filterToUse === "article" ? "name" : filterToUse;
    router.push(`/katalog?search=${encodeURIComponent(sanitized)}&filter=${effectiveFilter}`);

    onSearch(sanitized, effectiveFilter);
    saveToHistory(rawQuery.trim() || sanitized);
    setSearchQuery("");
    setShowDropdown(false);
    setSuggestionsFallback(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // --- 5. Видалення історії ---
  const clearHistory = () => {
    if (typeof window !== "undefined") {
      safeRemoveStorageItem(window.localStorage, "searchHistory");
    }
    setHistory([]);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative w-full max-w-full"
      suppressHydrationWarning
    >

      {/* --- SEARCH BAR --- */}
      <div className="font-ui flex w-full items-center overflow-hidden rounded-[16px] border border-sky-100/28 bg-[image:linear-gradient(145deg,rgba(71,85,105,0.96),rgba(37,78,117,0.94)_54%,rgba(14,116,144,0.92))] shadow-[0_10px_24px_rgba(15,23,42,0.16),0_0_18px_rgba(56,189,248,0.10),inset_0_1px_0_rgba(255,255,255,0.16)] transition-[border-color,box-shadow] duration-200 hover:border-sky-100/44 hover:shadow-[0_12px_28px_rgba(15,23,42,0.18),0_0_22px_rgba(56,189,248,0.14),inset_0_1px_0_rgba(255,255,255,0.2)] focus-within:border-sky-100/70 focus-within:shadow-[0_12px_30px_rgba(15,23,42,0.18),0_0_24px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.24)]">

        <input
          type="text"
          placeholder="Пошук..."
          className="font-ui w-full bg-transparent px-3 py-2 text-base font-semibold tracking-normal text-sky-50 outline-none placeholder:font-medium placeholder:text-sky-100/58 sm:text-sm"
          value={searchQuery}
          onChange={(e) => {
            prefetchCatalog();
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => {
            prefetchCatalog();
            setShowDropdown(true);
          }}
          onKeyDown={handleKeyPress}
          data-search="true"
        />

        {searchQuery && (
          <button
            type="button"
            className="px-2 text-sky-100/62 transition hover:text-white cursor-pointer"
            onClick={() => setSearchQuery("")}
            aria-label="Очистити поле пошуку"
          >
            <XCircle size={18} />
          </button>
        )}

        <select
          aria-label="Фільтр пошуку"
          className="font-ui h-9 border-l border-sky-100/18 bg-slate-900/18 px-2 py-2 text-base font-semibold tracking-normal text-sky-50 outline-none transition hover:bg-white/8 sm:text-sm"
          value={filterBy}
          onFocus={prefetchCatalog}
          onChange={(e) => {
            prefetchCatalog();
            setFilterBy(e.target.value as SearchFilter);
          }}
        >
          <option value="all">Всі</option>
          <option value="article">Артикул</option>
          <option value="name">Назва</option>
          <option value="code">Код</option>
          <option value="producer">Виробник</option>
          <option value="description">Опис</option>
        </select>

        <button
          type="submit"
          aria-label="Знайти"
          className="flex items-center justify-center bg-[image:linear-gradient(145deg,rgba(225,29,72,0.98),rgba(244,63,94,0.95)_54%,rgba(251,113,133,0.92))] px-3 py-2 text-white shadow-[0_10px_20px_rgba(190,18,60,0.24),0_0_18px_rgba(251,113,133,0.15),inset_0_1px_0_rgba(255,255,255,0.24)] transition-[filter,box-shadow] duration-200 ease-out hover:brightness-105 hover:shadow-[0_12px_24px_rgba(190,18,60,0.26),0_0_22px_rgba(251,113,133,0.2),inset_0_1px_0_rgba(255,255,255,0.28)] active:scale-[0.97] cursor-pointer"
          onClick={() => handleSearch()}
        >
          <Search size={20} className="text-white drop-shadow-[0_0_6px_rgba(0,0,0,0.35)]" />
        </button>
      </div>

      {/* --- SUGGESTIONS DROPDOWN (3+ chars) --- */}
      {showDropdown && searchQuery.trim().length >= SUGGESTION_MIN_CHARS && (
        <div className="absolute left-0 right-0 z-50 mt-3 overflow-hidden rounded-[18px] border border-sky-100/70 bg-white/96 shadow-[0_22px_48px_rgba(15,23,42,0.20),0_8px_20px_rgba(14,116,144,0.10),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl animate-fadeIn sm:left-1/2 sm:right-auto sm:w-[480px] sm:-translate-x-1/2">

          {/* header */}
          <div className="flex items-center justify-between border-b border-sky-100/70 bg-sky-50/70 px-3 py-2 sm:px-3.5">
            <span className="font-display flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              <Search size={11} className="text-sky-600" strokeWidth={2.5} />
              {suggestionsFallback?.filter === "description"
                ? <span className="text-violet-700 normal-case tracking-normal">Результат за описом</span>
                : suggestionsFallback?.filter === "name"
                ? <span>Артикул: <span className="font-mono text-amber-700 normal-case tracking-normal">{suggestionsFallback.query}</span></span>
                : "Швидкий пошук"
              }
            </span>
            {suggestionsLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-100 border-t-sky-500" />
            ) : (
              <span className="text-[11px] text-slate-400">{suggestions.length > 0 ? `${suggestions.length} з 5` : ""}</span>
            )}
          </div>

          {/* empty state */}
          {!suggestionsLoading && suggestions.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-4 py-5 text-center">
              <Search size={20} className="text-slate-300" strokeWidth={1.5} />
              <span className="text-sm text-slate-500">Нічого не знайдено</span>
            </div>
          )}

          {/* items */}
          {suggestions.map((product, idx) => {
            const priceStr = formatUAH(product.priceEuro, euroRate);
            const inStock = typeof product.quantity === "number" ? product.quantity > 0 : true;

            return (
              <button
                key={product.code}
                className={`font-ui flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 hover:bg-sky-50/78 active:bg-sky-100/70 cursor-pointer sm:gap-3 sm:px-3.5 sm:py-2.5 ${idx < suggestions.length - 1 ? "border-b border-slate-100" : ""}`}
                onClick={() => {
                  router.push(`/product/${encodeURIComponent(product.code)}`);
                  setShowDropdown(false);
                  setSearchQuery("");
                  onSearch(product.name, "name");
                }}
              >
                <div className="w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0">
                  <SuggestionImage code={product.code} article={product.article} name={product.name} hasPhoto={product.hasPhoto} />
                </div>

                {/* center: name + meta */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold leading-snug text-slate-900 sm:text-[13px]">{product.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {product.article && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-px font-mono text-[10.5px] text-slate-500 sm:text-[11px]">{product.article}</span>
                    )}
                    {product.producer && (
                      <span className="max-w-[90px] truncate text-[10.5px] text-sky-700/80 sm:max-w-[130px] sm:text-[11px]">{product.producer}</span>
                    )}
                  </div>
                </div>

                {/* right: price + stock */}
                <div className="flex-shrink-0 text-right flex flex-col items-end gap-1 min-w-[64px] sm:min-w-[72px]">
                  {priceStr ? (
                    <span className="whitespace-nowrap text-[12px] font-bold leading-none tracking-tight text-emerald-600 sm:text-[13px]">{priceStr}</span>
                  ) : (
                    <span className="text-[11px] leading-none text-slate-300">—</span>
                  )}
                  <span className={`flex items-center gap-0.5 text-[10px] font-semibold leading-none whitespace-nowrap ${inStock ? "text-emerald-600/80" : "text-red-500/75"}`}>
                    {inStock ? (
                      <><PackageCheck size={10} strokeWidth={2.5} /><span className="hidden xs:inline sm:inline">В наявн.</span></>
                    ) : (
                      <><PackageX size={10} strokeWidth={2.5} /><span className="hidden xs:inline sm:inline">Немає</span></>
                    )}
                  </span>
                </div>
              </button>
            );
          })}

          {/* show all */}
          <button
            className="font-ui flex w-full items-center justify-center gap-2 border-t border-sky-100/70 bg-sky-50/50 px-3.5 py-2.5 text-[12.5px] font-semibold text-sky-700 transition-colors hover:bg-sky-100/70 hover:text-sky-800 cursor-pointer"
            onClick={() => handleSearch()}
          >
            <Search size={13} strokeWidth={2.5} />
            Показати всі результати
            <ChevronRight size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* --- DROPDOWN HISTORY (shown only when < 3 chars) --- */}
      {showDropdown && searchQuery.trim().length < SUGGESTION_MIN_CHARS && history.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto overflow-x-hidden rounded-[18px] border border-sky-100/70 bg-white/96 shadow-[0_18px_38px_rgba(15,23,42,0.18),0_8px_18px_rgba(14,116,144,0.08),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl animate-fadeIn">

          <div className="font-display flex items-center justify-between border-b border-sky-100/70 bg-sky-50/75 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span>Історія пошуку</span>
            <button className="text-rose-500 transition hover:text-rose-600 cursor-pointer" onClick={clearHistory} aria-label="Очистити історію">
              <XCircle size={16} />
            </button>
          </div>

          {history.map((item) => (
            <button
              key={item}
              className="font-ui flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold tracking-normal text-slate-700 transition hover:bg-sky-50/80 cursor-pointer"
              onClick={() => handleSearch(item)}
            >
              <Clock size={14} className="text-sky-600" />
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
