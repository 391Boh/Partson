"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Clock, XCircle } from "lucide-react";

interface SearchBarProps {
  onSearch: (
    searchQuery: string,
    filterBy: "all" | "article" | "name" | "code" | "producer"
  ) => void;
}

const MAX_HISTORY = 8;

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] =
    useState<"all" | "article" | "name" | "code" | "producer">("all");

  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // --- 1. Завантаження історії з localStorage ---
  useEffect(() => {
    const saved = localStorage.getItem("searchHistory");
    if (saved) setHistory(JSON.parse(saved));
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
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));
  };

  // --- 4. Пошук ---
  const sanitizeQuery = (
    value: string,
    filter: "all" | "article" | "name" | "code" | "producer"
  ) => {
    const trimmed = value.trim();
    if (filter !== "article") return trimmed;
    return trimmed.replace(/\s+/g, "").replace(/\./g, "").replace(/-/g, "");
  };

  const handleSearch = (query?: string) => {
    const trimmed = sanitizeQuery(query ?? searchQuery, filterBy);
    if (!trimmed) return;

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
    localStorage.removeItem("searchHistory");
    setHistory([]);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative w-full max-w-full"
      suppressHydrationWarning
    >

      {/* --- SEARCH BAR --- */}
      <div className="flex items-center border border-gray-500 rounded-xl overflow-hidden w-full shadow-md transition-all hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-500 bg-gray-800">

        <input
          type="text"
          placeholder="Пошук..."
          className="bg-gray-800 text-white px-3 py-2 outline-none w-full text-base sm:text-sm placeholder-gray-400 focus:bg-gray-700"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
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
          className="bg-gray-700 text-white h-9 border-l border-gray-600 outline-none text-base sm:text-sm px-2 py-2"
          value={filterBy}
          onChange={(e) =>
            setFilterBy(
              e.target.value as "all" | "article" | "name" | "code" | "producer"
            )
          }
        >
          <option value="all">Всі</option>
          <option value="article">Артикул</option>
          <option value="name">Назва</option>
          <option value="code">Код</option>
          <option value="producer">Виробник</option>
        </select>

        <button
          className="px-3 py-2 bg-gradient-to-r from-rose-600 via-rose-500 to-red-500 text-white shadow-[0_10px_18px_rgba(244,63,94,0.32)] hover:from-rose-500 hover:via-rose-400 hover:to-red-400 hover:shadow-[0_12px_22px_rgba(244,63,94,0.34)] active:scale-[0.96] transition-all duration-200 ease-out flex items-center justify-center cursor-pointer"
          onClick={() => handleSearch()}
        >
          <Search size={20} className="text-white drop-shadow-[0_0_6px_rgba(0,0,0,0.35)]" />
        </button>
      </div>

      {/* --- DROPDOWN HISTORY --- */}
      {showDropdown && history.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-gray-900/95 border border-gray-600 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn max-h-64 overflow-y-auto">

          <div className="flex justify-between items-center px-3 py-2 border-b border-gray-700 bg-gray-800 text-gray-300 text-xs uppercase tracking-wide">
            <span>Історія пошуку</span>
            <button className="text-red-400 hover:text-red-500 cursor-pointer" onClick={clearHistory} aria-label="Очистити історію">
              <XCircle size={16} />
            </button>
          </div>

          {history.map((item, index) => (
            <button
              key={index}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800/80 rounded-xl flex items-center gap-2 cursor-pointer"
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
