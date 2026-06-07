"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Clock, XCircle } from "lucide-react";
import {
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "app/lib/safe-storage";

interface SearchBarProps {
  onSearch: (
    searchQuery: string,
    filterBy: "all" | "article" | "name" | "code" | "producer" | "description"
  ) => void;
}

const MAX_HISTORY = 8;
type SearchFilter = "all" | "article" | "name" | "code" | "producer" | "description";

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<SearchFilter>("all");

  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const catalogPrefetchedRef = useRef(false);

  const prefetchCatalog = useCallback(() => {
    if (catalogPrefetchedRef.current) return;
    catalogPrefetchedRef.current = true;
    router.prefetch("/katalog");
  }, [router]);

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
    const trimmed = value.trim();
    const looksLikePartNumber =
      filter === "article" ||
      filter === "code" ||
      (/\d/.test(trimmed) && /^[\w.\-\s/]+$/i.test(trimmed));
    if (!looksLikePartNumber) return trimmed;
    return trimmed.replace(/[\s.\-/]+/g, "");
  };

  const handleSearch = (query?: string) => {
    const trimmed = sanitizeQuery(query ?? searchQuery, filterBy);
    if (!trimmed) return;

    prefetchCatalog();
    router.push(`/katalog?search=${encodeURIComponent(trimmed)}&filter=${filterBy}`);

    onSearch(trimmed, filterBy);
    saveToHistory(trimmed);
    setSearchQuery("");
    setShowDropdown(false);
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
      <div className="font-ui flex w-full items-center overflow-hidden rounded-xl border border-gray-500 bg-gray-800 shadow-md transition-all hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-500">

        <input
          type="text"
          placeholder="Пошук..."
          className="font-ui w-full bg-gray-800 px-3 py-2 text-base font-semibold tracking-normal text-white outline-none placeholder:font-medium placeholder:text-gray-400 focus:bg-gray-700 sm:text-sm"
          value={searchQuery}
          onChange={(e) => {
            prefetchCatalog();
            const nextValue =
              filterBy === "article" || filterBy === "code"
                ? sanitizeQuery(e.target.value, filterBy)
                : e.target.value;
            setSearchQuery(nextValue);
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
            className="bg-gray-800 px-2 text-gray-400 hover:text-white transition cursor-pointer"
            onClick={() => setSearchQuery("")}
            aria-label="Очистити поле пошуку"
          >
            <XCircle size={18} />
          </button>
        )}

        <select
          aria-label="Фільтр пошуку"
          className="font-ui h-9 border-l border-gray-600 bg-gray-700 px-2 py-2 text-base font-semibold tracking-normal text-white outline-none sm:text-sm"
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
          className="px-3 py-2 bg-gradient-to-r from-rose-600 via-rose-500 to-red-500 text-white shadow-[0_10px_18px_rgba(244,63,94,0.32)] hover:from-rose-500 hover:via-rose-400 hover:to-red-400 hover:shadow-[0_12px_22px_rgba(244,63,94,0.34)] active:scale-[0.96] transition-all duration-200 ease-out flex items-center justify-center cursor-pointer"
          onClick={() => handleSearch()}
        >
          <Search size={20} className="text-white drop-shadow-[0_0_6px_rgba(0,0,0,0.35)]" />
        </button>
      </div>

      {/* --- DROPDOWN HISTORY --- */}
      {showDropdown && history.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-gray-900/95 border border-gray-600 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn max-h-64 overflow-y-auto">

          <div className="font-display flex items-center justify-between border-b border-gray-700 bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-gray-300">
            <span>Історія пошуку</span>
            <button className="text-red-400 hover:text-red-500 cursor-pointer" onClick={clearHistory} aria-label="Очистити історію">
              <XCircle size={16} />
            </button>
          </div>

          {history.map((item) => (
            <button
              key={item}
              className="font-ui flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold tracking-normal text-gray-200 hover:bg-gray-800/80 cursor-pointer"
              onClick={() => handleSearch(item)}
            >
              <Clock size={14} className="text-gray-400" />
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
