"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";

import { useCart } from "app/context/CartContext";
import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";

// --- Типи ---
interface DataProps {
  selectedCars: string[];
  selectedCategories: string[];
  sortOrder: "none" | "asc" | "desc";
}

export interface Product {
  Количество?: number;
  НоменклатураНаименование?: string;
  НоменклатураКод?: string;
  НомерПоКаталогу?: string;
  ПроизводительНаименование?: string;
  РодительНаименование?: string;
  РодительРодительНаименование?: string;
}

// --- Константи ---
const ITEMS_PER_PAGE = 16;
const PROXY_ROUTE = "/api/proxy";
const PRICE_CACHE_PREFIX = "partson:price:";
const PRICE_CACHE_TTL_MS = 1000 * 60 * 10;

// --- Завантаження великої картинки ---
async function fetchImageBase64(productCode: string): Promise<string | null> {
  try {
    const res = await fetch(`${PROXY_ROUTE}?endpoint=getimages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: productCode }),
    });

    if (!res.ok) return null;

    let text = await res.text();
    text = text.replace(/[\r\n]+/g, "");

    const json = JSON.parse(text);
    if (!json || !json.image_base64) return null;

    return `data:image/png;base64,${json.image_base64}`;
  } catch (e) {
    console.error("Помилка завантаження зображення:", e);
    return null;
  }
}

// -----------------------------------------------------------
//                CUSTOM HOOK useCatalogData()
// -----------------------------------------------------------
function useCatalogData(params: {
  selectedCars: string[];
  selectedCategories: string[];
  rawSearchQuery: string;
  searchFilter: "all" | "article" | "name" | "code";
  groupFromURL: string | null;
  subcategoryFromURL: string | null;
}) {
  const {
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
  } = params;

  const { addToCart, cartItems, removeFromCart } = useCart();

  const [data, setData] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ? Курс EUR (fallback 50)
  const [euroRate, setEuroRate] = useState<number>(50);

  // ? курс з НОВОГО PROXY: /api/proxy?endpoint=euro
  useEffect(() => {
    let cancelled = false;

    const loadEuroRate = async () => {
      try {
        const res = await fetch("/api/proxy?endpoint=euro", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const json: { rate?: number } = await res.json();

        if (!cancelled && typeof json?.rate === "number") {
          setEuroRate(json.rate);
        }
      } catch (e) {
        console.error("Не вдалося завантажити курс EUR", e);
      }
    };

    loadEuroRate();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchQuery = rawSearchQuery;

  // корзина > мапа
  const cartMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cartItems) {
      if (item.code) map[item.code] = item.quantity;
    }
    return map;
  }, [cartItems]);

  // товари по коду
  const productsByCode = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const it of data) {
      if (it.НоменклатураКод) map[it.НоменклатураКод] = it;
    }
    return map;
  }, [data]);

  // ключ кешу
  const buildCacheKey = useCallback(
    (pageNum: number, trimmed: string) =>
      JSON.stringify({
        endpoint: "getdata",
        page: pageNum,
        q: trimmed,
        filter: searchFilter,
        cars: selectedCars,
        cats: selectedCategories,
        group: groupFromURL,
        subcat: subcategoryFromURL,
      }),
    [searchFilter, selectedCars, selectedCategories, groupFromURL, subcategoryFromURL]
  );

  // reset при зміні фільтрів / пошуку
  useEffect(() => {
    setPage(1);
    setHasMore(true);

    const trimmed = searchQuery.trim();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
      const cacheKey = buildCacheKey(1, trimmed);
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed: Product[] = JSON.parse(cached);
        setData(parsed);
        setHasMore(parsed.length === ITEMS_PER_PAGE);
        return;
      }
    }

    setData([]);
  }, [
    searchQuery,
    searchFilter,
    selectedCars,
    selectedCategories,
    groupFromURL,
    subcategoryFromURL,
    buildCacheKey,
  ]);

  // --- Завантаження списку товарів ---
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setError(null);

      const trimmed = searchQuery.trim();
      const body: Record<string, unknown> = {
        selectedCars,
        selectedCategories,
        НомерСтраницы: page,
      };

      if (trimmed) {
        if (searchFilter === "name") body["Наименование"] = trimmed;
        else if (searchFilter === "code") body["Код"] = trimmed;
        else if (searchFilter === "article") body["НомерПоКаталогу"] = trimmed;
        else body["Наименование"] = trimmed;
      }

      if (groupFromURL && !subcategoryFromURL) body.Подгруппа = groupFromURL;
      else if (subcategoryFromURL) {
        body.Группа = groupFromURL;
        body.Подгруппа = subcategoryFromURL;
      }

      const cacheKey = buildCacheKey(page, trimmed);

      // кеш першої сторінки
      if (page === 1 && typeof window !== "undefined") {
        const cached = window.sessionStorage.getItem(cacheKey);
        if (cached) {
          if (cancelled) return;
          const parsed: Product[] = JSON.parse(cached);
          setData(parsed);
          setHasMore(parsed.length === ITEMS_PER_PAGE);
          setLoading(false);
          return;
        }
      }

      setLoading(true);

      try {
        const res = await fetch(`${PROXY_ROUTE}?endpoint=getdata`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Помилка сервера");

        const result: Product[] = await res.json();
        if (cancelled) return;

        setData((prev) => (page === 1 ? result : [...prev, ...result]));
        setHasMore(result.length === ITEMS_PER_PAGE);

        if (page === 1) {
          try {
            window.sessionStorage.setItem(cacheKey, JSON.stringify(result));
          } catch {}
        }
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Помилка сервера");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // ?? прискорюємо перший запит
    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    page,
    searchQuery,
    searchFilter,
    selectedCars,
    selectedCategories,
    groupFromURL,
    subcategoryFromURL,
    buildCacheKey,
  ]);

  // --- Ініціалізація кількостей ---
  useEffect(() => {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const item of data) {
        if (!item.НоменклатураКод) continue;
        if (next[item.НоменклатураКод] == null) next[item.НоменклатураКод] = 1;
      }
      return next;
    });
  }, [data]);

  // --- Унікальні товари ---
  const uniqueData = useMemo(() => {
    const map = new Map<string, Product>();
    for (const it of data) {
      if (it.НоменклатураКод && !map.has(it.НоменклатураКод)) {
        map.set(it.НоменклатураКод, it);
      }
    }
    return Array.from(map.values());
  }, [data]);

  // --- Локальний фільтр ---
  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase();

    return uniqueData.filter((item) => {
      const code = item.НоменклатураКод?.toLowerCase() || "";
      const art = item.НомерПоКаталогу?.toLowerCase() || "";
      const name = item.НоменклатураНаименование?.toLowerCase() || "";

      const match =
        searchFilter === "article"
          ? art.includes(q)
          : searchFilter === "name"
          ? name.includes(q)
          : searchFilter === "code"
          ? code.includes(q)
          : code.includes(q) || art.includes(q) || name.includes(q);

      const catMatch =
        selectedCategories.length === 0 ||
        selectedCategories.includes(item.РодительНаименование || "") ||
        selectedCategories.includes(item.РодительРодительНаименование || "");

      return match && catMatch;
    });
  }, [uniqueData, searchQuery, searchFilter, selectedCategories]);

  // --- Завантаження цін (батчем) ---
  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    const controller = new AbortController();

    const readCachedPrice = (code: string) => {
      if (typeof window === "undefined") return { hit: false as const };
      try {
        const raw = window.sessionStorage.getItem(`${PRICE_CACHE_PREFIX}${code}`);
        if (!raw) return { hit: false as const };
        const parsed = JSON.parse(raw) as { v: number | null; t: number };
        if (!parsed || typeof parsed.t !== "number") return { hit: false as const };
        if (Date.now() - parsed.t > PRICE_CACHE_TTL_MS) {
          window.sessionStorage.removeItem(`${PRICE_CACHE_PREFIX}${code}`);
          return { hit: false as const };
        }
        return { hit: true as const, value: parsed.v ?? null };
      } catch {
        return { hit: false as const };
      }
    };

    const writeCachedPrice = (code: string, price: number | null) => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.setItem(
          `${PRICE_CACHE_PREFIX}${code}`,
          JSON.stringify({ v: price, t: Date.now() })
        );
      } catch {}
    };

    const loadPrices = async () => {
      const codes = Array.from(
        new Set(
          filteredData
            .map((i) => (i.НомерПоКаталогу || i.НоменклатураКод || "").trim())
            .filter(Boolean)
            .filter((c) => prices[c] === undefined)
        )
      );

      if (!codes.length) return;

      const cachedUpdates: Record<string, number | null> = {};
      const missingCodes: string[] = [];

      for (const code of codes) {
        const cached = readCachedPrice(code);
        if (cached.hit) cachedUpdates[code] = cached.value;
        else missingCodes.push(code);
      }

      if (!cancelled && Object.keys(cachedUpdates).length > 0) {
        setPrices((prev) => ({ ...prev, ...cachedUpdates }));
      }

      if (!missingCodes.length) return;

      const maxConcurrency = 6;
      let cursor = 0;
      const responses: Array<{ code: string; price: number | null }> = new Array(
        missingCodes.length
      );

      const workers = Array.from(
        { length: Math.min(maxConcurrency, missingCodes.length) },
        async () => {
          while (cursor < missingCodes.length) {
            const index = cursor;
            cursor += 1;
            const code = missingCodes[index];

            try {
              const res = await fetch(`${PROXY_ROUTE}?endpoint=prices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Код: code }),
                signal: controller.signal,
              });

              const t = await res.text();
              try {
                const json = JSON.parse(t);
                const price = json?.ЦінаПрод ?? null;
                responses[index] = { code, price };
              } catch {
                responses[index] = { code, price: null };
              }
            } catch {
              responses[index] = { code, price: null };
            }
          }
        }
      );

      await Promise.all(workers);

      if (cancelled) return;

      setPrices((prev) => {
        const next = { ...prev };
        for (const item of responses) {
          if (!item) continue;
          next[item.code] = item.price;
          writeCachedPrice(item.code, item.price);
        }
        return next;
      });
    };

    const scheduleLoad = () => {
      if (typeof window === "undefined") {
        loadPrices();
        return;
      }

      if ("requestIdleCallback" in window) {
        idleId = (window as Window & {
          requestIdleCallback: (cb: () => void) => number;
        }).requestIdleCallback(() => {
          if (!cancelled) loadPrices();
        });
      } else {
        idleId = window.setTimeout(() => {
          if (!cancelled) loadPrices();
        }, 120);
      }
    };

    scheduleLoad();
    return () => {
      cancelled = true;
      controller.abort();
      if (typeof window === "undefined" || idleId === null) return;
      if ("cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleId
        );
      } else {
        clearTimeout(idleId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredData]);

  // --- handlers ---
  const handleFlip = useCallback((code: string) => {
    setFlippedCard((p) => (p === code ? null : code));
  }, []);

  const handleQtyChange = useCallback(
    (code: string, delta: number) => {
      setQuantities((prev) => {
        const current = prev[code] ?? 1;
        const max = productsByCode[code]?.Количество ?? 99;
        return { ...prev, [code]: Math.min(Math.max(1, current + delta), max) };
      });
    },
    [productsByCode]
  );

  const handleAddToCart = useCallback(
    (item: Product) => {
      const code = item.НоменклатураКод;
      if (!code) return;

      const maxQty = item.Количество ?? 0;
      const cartQty = cartMap[code] ?? 0;
      const qtyToAdd = quantities[code] ?? 1;

      if (cartQty + qtyToAdd > maxQty && maxQty > 0) {
        alert(`Максимально доступно ${maxQty} шт.`);
        return;
      }

      const key = (item.НомерПоКаталогу || code).trim();
      const euro = prices[key] ?? null;

      if (euro == null) {
        alert("Ціна не визначена");
        return;
      }

      addToCart({
        code,
        name: item.НоменклатураНаименование || "Товар",
        article: item.НомерПоКаталогу || "",
        quantity: qtyToAdd,
        price: Math.round(euro * euroRate),
      });
    },
    [cartMap, quantities, prices, euroRate, addToCart]
  );

  const handleRemoveFromCart = useCallback(
    (code: string) => {
      removeFromCart(code);
    },
    [removeFromCart]
  );

  const handleImageOpen = useCallback(async (code: string) => {
    const src = await fetchImageBase64(code);
    if (src) setSelectedImage(src);
  }, []);

  const handleImageClose = useCallback(() => setSelectedImage(null), []);

  const loadNextPage = useCallback(() => {
    if (!loading && hasMore) setPage((p) => p + 1);
  }, [loading, hasMore]);

  return {
    filteredData,
    quantities,
    prices,
    euroRate,
    flippedCard,
    selectedImage,
    loading,
    hasMore,
    error,
    cartMap,
    handleFlip,
    handleQtyChange,
    handleAddToCart,
    handleRemoveFromCart,
    handleImageOpen,
    handleImageClose,
    loadNextPage,
  };
}

// -----------------------------------------------------------
//                ОСНОВНИЙ КОМПОНЕНТ DATA
// -----------------------------------------------------------
const Data: React.FC<DataProps> = ({
  selectedCars,
  selectedCategories,
  sortOrder,
}) => {
  const searchParams = useSearchParams();

  const rawSearchQuery = searchParams.get("search") || "";
  const searchFilter =
    (searchParams.get("filter") as "all" | "article" | "name" | "code") || "all";

  const groupFromURL = searchParams.get("group");
  const subcategoryFromURL = searchParams.get("subcategory");

  const {
    filteredData,
    quantities,
    prices,
    euroRate,
    flippedCard,
    selectedImage,
    loading,
    hasMore,
    error,
    cartMap,
    handleFlip,
    handleQtyChange,
    handleAddToCart,
    handleRemoveFromCart,
    handleImageOpen,
    handleImageClose,
    loadNextPage,
  } = useCatalogData({
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
  });

  const sortedData = useMemo(() => {
    if (sortOrder === "none") return filteredData;
    const copy = [...filteredData];
    const isAsc = sortOrder === "asc";

    copy.sort((a, b) => {
      const keyA = (a.НомерПоКаталогу || a.НоменклатураКод || "").trim();
      const keyB = (b.НомерПоКаталогу || b.НоменклатураКод || "").trim();
      const euroA = prices[keyA] ?? null;
      const euroB = prices[keyB] ?? null;
      const priceA = euroA != null ? Math.round(euroA * euroRate) : null;
      const priceB = euroB != null ? Math.round(euroB * euroRate) : null;

      if (priceA == null && priceB == null) return 0;
      if (priceA == null) return 1;
      if (priceB == null) return -1;

      return isAsc ? priceA - priceB : priceB - priceA;
    });

    return copy;
  }, [filteredData, prices, euroRate, sortOrder]);

  const isInitialLoading = loading && sortedData.length === 0;
  const isEmptyState = !isInitialLoading && !loading && sortedData.length === 0 && !error;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isInitialLoading) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [isInitialLoading]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isEmptyState) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isEmptyState]);
  const handleSendRequest = useCallback(() => {
    const query = rawSearchQuery.trim();
    const categoryLabel = subcategoryFromURL
      ? `${groupFromURL || ""} / ${subcategoryFromURL}`
      : groupFromURL || "";
    const selectedCategoryLabel =
      !categoryLabel && selectedCategories.length > 0
        ? selectedCategories.join(", ")
        : "";
    const carLabel =
      selectedCars.length > 0 ? selectedCars.join(", ") : "";

    const parts: string[] = [];
    if (query) parts.push(`Пошук: ${query}`);
    if (categoryLabel) parts.push(`Категорія: ${categoryLabel}`);
    if (selectedCategoryLabel) parts.push(`Категорія: ${selectedCategoryLabel}`);
    if (carLabel) parts.push(`Авто: ${carLabel}`);

    const message = parts.length > 0
      ? `Не знайшов товар. ${parts.join(" | ")}`
      : "Не знайшов товар у каталозі. Потрібна допомога з підбором.";

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("openChatWithMessage", { detail: message })
      );
    }
  }, [
    rawSearchQuery,
    groupFromURL,
    subcategoryFromURL,
    selectedCategories,
    selectedCars,
  ]);

  return (
    <>
      <div
        id="catalog-results"
        className={`w-full px-6 pb-8 pt-0 transition-all duration-300 sm:px-4 lg:px-6 ${
          isEmptyState ? 'overflow-hidden h-[calc(100dvh-96px)]' : ''
        }`}
        style={{ minHeight: "calc(100dvh - 96px)" }}
      >
        {!loading && error && (
          <div className="text-center text-red-500 mb-4">{error}</div>
        )}

        {isInitialLoading && (
          <div className="mt-3">
            <div className="flex flex-col items-center justify-center gap-2 pb-3">
              <div className="loader" />
              <p className="text-gray-400 text-xs">Завантаження товарів...</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[320px] w-full rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {!isInitialLoading && sortedData.length > 0 && (
          <VirtuosoGrid
            useWindowScroll
            totalCount={sortedData.length}
            overscan={300}
            endReached={loadNextPage}
            listClassName="mx-auto grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 mt-2"
            itemContent={(index) => {
              const item = sortedData[index];
              if (!item?.НоменклатураКод) return null;

              const code = item.НоменклатураКод;
              const qty = quantities[code] ?? 1;
              const cartQty = cartMap[code] ?? 0;

              const key = (item.НомерПоКаталогу || code).trim();
              const euro = prices[key] ?? null;
              const priceUAH = euro != null ? Math.round(euro * euroRate) : null;

              return (
                <ProductCard
                  key={code}
                  item={item}
                  index={index}
                  qty={qty}
                  cartQty={cartQty}
                  priceUAH={priceUAH}
                  isFlipped={flippedCard === code}
                  onAddToCart={handleAddToCart}
                  onRemoveFromCart={handleRemoveFromCart}
                  onQtyChange={handleQtyChange}
                  onFlip={handleFlip}
                  onImageOpen={handleImageOpen}
                />
              );
            }}
          />
        )}

        {isEmptyState && (
          <div className="col-span-full mt-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.1)]">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Search size={20} />
              </div>
              <div className="space-y-1.5">
                <p className="text-base sm:text-lg font-semibold text-slate-800">
                  {rawSearchQuery.trim()
                    ? `Нічого не знайдено для «${rawSearchQuery.trim()}»`
                    : "Товари за цим фільтром не знайдені"}
                </p>
                <p className="text-xs sm:text-sm text-slate-500 max-w-lg leading-snug">
                  Спробуйте змінити критерії або надішліть запит менеджеру — ми
                  швидко підберемо потрібну запчастину.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendRequest}
                className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm shadow-sky-300/50 transition hover:bg-sky-600 active:scale-[0.98]"
              >
                Надіслати запит в чат
              </button>
            </div>
          </div>
        )}

        {loading && !isInitialLoading && (
          <div className="text-center mt-6">
            <div className="loader mx-auto" />
          </div>
        )}

        {!loading && hasMore && sortedData.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-3">
            Прокрутіть нижче, щоб завантажити більше товарів...
          </p>
        )}
      </div>

      <AnimatePresence>
        {selectedImage && <ImageModal src={selectedImage} onClose={handleImageClose} />}
      </AnimatePresence>
    </>
  );
};

export default Data;
                                                          
