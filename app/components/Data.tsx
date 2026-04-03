"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useDeferredValue,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";

import { useCart } from "app/context/CartContext";
import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";
import { buildProductPath } from "app/lib/product-url";

// --- Types ---
interface DataProps {
  selectedCars: string[];
  selectedCategories: string[];
  sortOrder: "none" | "asc" | "desc";
}

export interface Product {
  raw?: Record<string, unknown>;
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  priceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
}

// --- Constants ---
// Keep pages small to avoid overloading 1C and shorten perceived waits.
const ITEMS_PER_PAGE = 10;
const PROXY_ROUTE = "/api/proxy";
const CATALOG_PRICE_BATCH_ROUTE = "/api/catalog-prices";
const PRICE_CACHE_PREFIX = "partson:v2:price:";
const IMAGE_CACHE_PREFIX = "partson:v2:img:";
const IMAGE_CACHE_FALLBACK = "__NO_IMAGE__";
const PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
const PRICE_MAX_RETRY_ATTEMPTS = 5;
const PRICE_RETRY_DELAY_MS = 650;
const PRICE_REVALIDATE_AFTER_NULL_MS = 1000 * 20;
const PRICE_PRIORITY_ITEMS_COUNT = 16;
const PRICE_IMMEDIATE_ITEMS_COUNT = 6;
const PRICE_IMMEDIATE_BATCH_SIZE = 1;
const PRICE_IMMEDIATE_BATCH_CONCURRENCY = 6;
const PRICE_PRIORITY_BATCH_SIZE = 4;
const PRICE_PRIORITY_BATCH_CONCURRENCY = 5;
const PRICE_BACKGROUND_BATCH_SIZE = 12;
const PRICE_BACKGROUND_BATCH_CONCURRENCY = 4;
const MEMORY_CACHE_TTL_MS_FIRST_PAGE = 1000 * 30;
const MEMORY_CACHE_TTL_MS_NEXT_PAGES = 1000 * 20;

// Backend field aliases (use escapes to stay ASCII-friendly)
const PAGE_FIELD = "\u041d\u043e\u043c\u0435\u0440\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u044b"; // РќРѕРјРµСЂРЎС‚СЂР°РЅРёС†С‹
const OFFSET_FIELD = "\u0421\u043c\u0435\u0449\u0435\u043d\u0438\u0435"; // РЎРјРµС‰РµРЅРёРµ
const LIMIT_FIELD = "\u041b\u0438\u043c\u0438\u0442"; // Р›РёРјРёС‚
const NAME_FIELDS = [
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // РќРѕРјРµРЅРєР»Р°С‚СѓСЂР°РќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // РќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "\u041d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f", // РќР°Р№РјРµРЅСѓРІР°РЅРЅСЏ
  "name",
];
const CODE_FIELDS = [
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041a\u043e\u0434", // РќРѕРјРµРЅРєР»Р°С‚СѓСЂР°РљРѕРґ
  "\u041a\u043e\u0434", // РљРѕРґ
  "code",
  "ID",
  "Id",
];
const ARTICLE_FIELDS = [
  "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443", // РќРѕРјРµСЂРџРѕРљР°С‚Р°Р»РѕРіСѓ
  "\u0410\u0440\u0442\u0438\u043a\u0443\u043b", // РђСЂС‚РёРєСѓР»
  "article",
];
const PRODUCER_FIELDS = [
  "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a", // Р’РёСЂРѕР±РЅРёРє
  "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c", // РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊ
  "\u0411\u0440\u0435\u043d\u0434", // Р‘СЂРµРЅРґ
  "producer",
];
const QTY_FIELDS = [
  "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e", // РљРѕР»РёС‡РµСЃС‚РІРѕ
  "\u041a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c", // РљС–Р»СЊРєС–СЃС‚СЊ
  "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u043e", // РљРѕР»РёС‡РµСЃС‚РІРѕРЎРІРѕР±РѕРґРЅРѕ
  "\u041e\u0441\u0442\u0430\u0442\u043e\u043a", // РћСЃС‚Р°С‚РѕРє
  "quantity",
  "Quantity",
];
const GROUP_FIELDS = [
  "\u0413\u0440\u0443\u043f\u043f\u0430", // Р“СЂСѓРїРїР°
  "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // Р РѕРґРёС‚РµР»СЊРќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "Category",
  "group",
];
const SUBGROUP_FIELDS = [
  "\u041f\u043e\u0434\u0433\u0440\u0443\u043f\u043f\u0430", // РџРѕРґРіСЂСѓРїРїР°
  "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // Р РѕРґРёС‚РµР»СЊР РѕРґРёС‚РµР»СЊРќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "Subcategory",
  "subGroup",
];
const CATEGORY_FIELDS = [
  "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f",
  "Category",
  "category",
]; // РљР°С‚РµРіРѕСЂРёСЏ
const PRICE_VALUE_FIELDS = [
  "\u0426\u0456\u043d\u0430\u041f\u0440\u043e\u0434", // Р¦С–РЅР°РџСЂРѕРґ
  "\u0426\u0435\u043d\u0430\u041f\u0440\u043e\u0434", // Р¦РµРЅР°РџСЂРѕРґ
  "\u0426\u0435\u043d\u0430", // Р¦РµРЅР°
  "\u0426\u0456\u043d\u0430", // Р¦С–РЅР°
  "price",
];
const readFirstString = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = ""
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return fallback;
};

const readFirstNumber = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = 0
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/\s+/g, "").replace(",", "."); // handle "1 200", "1,5"
      const num = Number(cleaned);
      if (Number.isFinite(num)) return num;
    }
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
};

const toPriceUAH = (euro: number | null | undefined, euroRate: number) => {
  if (typeof euro !== "number" || !Number.isFinite(euro) || euro <= 0) return null;
  return Math.round(euro * euroRate);
};

const getProductPriceStateKey = (item: Pick<Product, "code" | "article">) =>
  (item.code || item.article || "").trim();

const getProductPriceLookupKeys = (item: Pick<Product, "code" | "article">) =>
  Array.from(
    new Set([(item.article || "").trim(), (item.code || "").trim()].filter(Boolean))
  );

const normalizeProduct = (raw: unknown): Product => {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const code = readFirstString(record, CODE_FIELDS);
  const article = readFirstString(record, ARTICLE_FIELDS);
  const name =
    readFirstString(record, NAME_FIELDS) || code || article || "Товар";
  const rawProducer = readFirstString(record, PRODUCER_FIELDS);
  const producer = (() => {
    const trimmed = rawProducer.trim();
    if (!trimmed) return "";
    // Р”РµСЏРєС– Р·Р°РїРёСЃРё РїСЂРёС…РѕРґСЏС‚СЊ Р· "seiken" СЏРє РґРµС„РѕР»С‚РЅРёРј РїРѕСЃС‚Р°С‡Р°Р»СЊРЅРёРєРѕРј вЂ” С…РѕРІР°С”РјРѕ Р№РѕРіРѕ.
    if (trimmed.toLowerCase() === "seiken") return "";
    return trimmed;
  })();
  const quantity = readFirstNumber(record, QTY_FIELDS, 0);
  const priceEuro = readFirstNumber(record, PRICE_VALUE_FIELDS, Number.NaN);

  const group = readFirstString(record, GROUP_FIELDS);
  const subGroup = readFirstString(record, SUBGROUP_FIELDS);
  const category = readFirstString(record, CATEGORY_FIELDS);

  const resolvedCode =
    code ||
    article ||
    readFirstString(record, ["ID", "Id"]) ||
    readFirstString(record, NAME_FIELDS);

  return {
    raw: record,
    code: resolvedCode,
    article,
    name,
    producer,
    quantity,
    priceEuro: Number.isFinite(priceEuro) && priceEuro > 0 ? priceEuro : null,
    group,
    subGroup,
    category,
  };
};

const getProductIdentity = (item: Product) => {
  const code = typeof item.code === "string" ? item.code.trim() : "";
  if (code) return `code:${code}`;
  const article = typeof item.article === "string" ? item.article.trim() : "";
  if (article) return `article:${article}`;
  const name = typeof item.name === "string" ? item.name.trim().toLowerCase() : "";
  return name ? `name:${name}` : "";
};

const mergeUniqueProducts = (current: Product[], incoming: Product[]) => {
  if (incoming.length === 0) return current;

  const map = new Map<string, Product>();
  for (const item of current) {
    const key = getProductIdentity(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }

  for (const item of incoming) {
    const key = getProductIdentity(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }

  return Array.from(map.values());
};

type PageCacheEntry = { items: Product[]; expiresAt: number };
const pageCache = new Map<string, PageCacheEntry>();
const inFlightPageRequests = new Map<string, Promise<Product[]>>();
const now = () => Date.now();
const abortControllerSafely = (controller: AbortController) => {
  if (controller.signal.aborted) return;
  try {
    controller.abort();
  } catch {
    // Prevent teardown-time abort edge cases from surfacing as runtime errors.
  }
};

const readPageFromMemory = (key: string) => {
  const entry = pageCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    pageCache.delete(key);
    return null;
  }
  return entry.items;
};

const writePageToMemory = (key: string, items: Product[], ttlMs: number) => {
  if (ttlMs <= 0) return;
  pageCache.set(key, { items, expiresAt: now() + ttlMs });
};

const readPageFromSession = (key: string): Product[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const cached = window.sessionStorage.getItem(key);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    const cachedItems = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.items)
      ? (parsed as { items: unknown[] }).items
      : [];
    if (!Array.isArray(cachedItems) || cachedItems.length === 0) return null;
    return cachedItems.map(normalizeProduct);
  } catch {
    return null;
  }
};

const writePageToSession = (key: string, items: Product[]) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ items }));
  } catch {
    // Ignore sessionStorage quota issues to avoid blocking UI.
  }
};

// --- Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РІРµР»РёРєРѕС— РєР°СЂС‚РёРЅРєРё ---
async function fetchImageBase64(
  productCode: string,
  articleHint?: string
): Promise<string | null> {
  try {
    const lookupKeys = Array.from(
      new Set(
        [(articleHint || "").trim(), (productCode || "").trim()].filter(Boolean)
      )
    );
    if (lookupKeys.length === 0) return null;

    if (typeof window !== "undefined") {
      for (const lookupKey of lookupKeys) {
        try {
          const cached = window.sessionStorage.getItem(
            `${IMAGE_CACHE_PREFIX}${lookupKey}`
          );
          if (cached && cached !== IMAGE_CACHE_FALLBACK && cached.startsWith("data:image/")) {
            return cached;
          }
        } catch {}
      }
    }

    for (const lookupKey of lookupKeys) {
      const requestBodies = [
        { code: lookupKey },
        { article: lookupKey },
      ];

      for (const body of requestBodies) {
        const res = await fetch(`${PROXY_ROUTE}?endpoint=getimages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) continue;

        let text = await res.text();
        text = text.replace(/[\r\n]+/g, "");

        let json: { image_base64?: string } | null = null;
        try {
          json = JSON.parse(text) as { image_base64?: string };
        } catch {
          json = null;
        }

        if (!json?.image_base64) continue;

        const image = `data:image/png;base64,${json.image_base64}`;
        try {
          if (typeof window !== "undefined") {
            for (const cacheKey of lookupKeys) {
              window.sessionStorage.setItem(
                `${IMAGE_CACHE_PREFIX}${cacheKey}`,
                image
              );
            }
          }
        } catch {}

        return image;
      }
    }

    return null;
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
  searchFilter: "all" | "article" | "name" | "code" | "producer";
  groupFromURL: string | null;
  subcategoryFromURL: string | null;
  producerFromURL: string | null;
}) {
  const {
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
  } = params;

  const { addToCart, cartItems, removeFromCart } = useCart();
  const searchQuery = useDeferredValue(rawSearchQuery);
  const normalizedSearch = useMemo(() => searchQuery.trim(), [searchQuery]);
  const normalizedSearchLower = useMemo(
    () => normalizedSearch.toLowerCase(),
    [normalizedSearch]
  );
  const hasUrlCategoryFilter = Boolean(groupFromURL || subcategoryFromURL);
  const effectiveSelectedCategories = useMemo(
    () => (hasUrlCategoryFilter ? [] : selectedCategories),
    [hasUrlCategoryFilter, selectedCategories]
  );
  const [data, setData] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [priceRetryTick, setPriceRetryTick] = useState(0);
  const isRefetching = loading && page === 1;
  const querySignature = useMemo(
    () =>
      JSON.stringify({
        q: normalizedSearch,
        filter: searchFilter,
        cars: selectedCars,
        cats: effectiveSelectedCategories,
        group: groupFromURL,
        subcat: subcategoryFromURL,
        producer: producerFromURL,
      }),
    [
      normalizedSearch,
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
    ]
  );
  const activeQuerySignatureRef = useRef(querySignature);
  const firstPageReadySignatureRef = useRef<string | null>(null);
  const pagingRequestedRef = useRef(false);
  const pricesRef = useRef<Record<string, number | null>>({});
  const priceAttemptsRef = useRef<Record<string, number>>({});
  const priceLoadingKeysRef = useRef<Set<string>>(new Set());
  const priceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceRetryCooldownUntilRef = useRef<Record<string, number>>({});

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  // ? Курс EUR (fallback 50)
  const [euroRate, setEuroRate] = useState<number>(50);

  // ? РєСѓСЂСЃ Р· РќРћР’РћР“Рћ PROXY: /api/proxy?endpoint=euro
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

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Safety net: якщо дані вже є, але фільтр-оверлей лишився після скасованого запиту — ховаємо тільки його.
  useEffect(() => {
    if (filterLoading && safeData.length > 0) {
      setFilterLoading(false);
    }
  }, [filterLoading, safeData]);

  // РєРѕСЂР·РёРЅР° > РјР°РїР°
  const cartMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cartItems) {
      if (item.code) map[item.code] = item.quantity;
    }
    return map;
  }, [cartItems]);

  // С‚РѕРІР°СЂРё РїРѕ РєРѕРґСѓ
  const productsByCode = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const it of safeData) {
      if (it.code) map[it.code] = it;
    }
    return map;
  }, [safeData]);

  // РєР»СЋС‡ РєРµС€Сѓ
  const buildCacheKey = useCallback(
    (pageNum: number, trimmed: string) =>
      JSON.stringify({
        endpoint: "getdata",
        page: pageNum,
        limit: ITEMS_PER_PAGE,
        q: trimmed,
        filter: searchFilter,
        cars: selectedCars,
        cats: effectiveSelectedCategories,
        group: groupFromURL,
        subcat: subcategoryFromURL,
        producer: producerFromURL,
      }),
    [
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
    ]
  );

  // reset при зміні фільтрів / пошуку
  useEffect(() => {
    activeQuerySignatureRef.current = querySignature;
    firstPageReadySignatureRef.current = null;
    pagingRequestedRef.current = false;
    priceAttemptsRef.current = {};
    priceLoadingKeysRef.current.clear();
    priceRetryCooldownUntilRef.current = {};
    if (priceRetryTimerRef.current) {
      clearTimeout(priceRetryTimerRef.current);
      priceRetryTimerRef.current = null;
    }
    setPage(1);
    setHasMore(true);
    setHasLoadedOnce(false);
    setFlippedCard(null);
    setSelectedImage(null);
    setError(null);
    setLoading(true);
    setFilterLoading(true);

    const trimmed = normalizedSearch;
    if (typeof window !== "undefined") {
      const cacheKey = buildCacheKey(1, trimmed);

      const memoryHit = readPageFromMemory(cacheKey);
      if (memoryHit) {
        setData(mergeUniqueProducts([], memoryHit));
        setHasMore(memoryHit.length === ITEMS_PER_PAGE);
        setLoading(false);
        setError(null);
        setHasLoadedOnce(true);
        setFilterLoading(false);
        firstPageReadySignatureRef.current = querySignature;
        return;
      }

      const sessionHit = readPageFromSession(cacheKey);
      if (sessionHit) {
        writePageToMemory(cacheKey, sessionHit, MEMORY_CACHE_TTL_MS_FIRST_PAGE);
        setData(mergeUniqueProducts([], sessionHit));
        setHasMore(sessionHit.length === ITEMS_PER_PAGE);
        setLoading(false);
        setError(null);
        setHasLoadedOnce(true);
        setFilterLoading(false);
        firstPageReadySignatureRef.current = querySignature;
        return;
      }
    }
    // Без cache показуємо чистий стан, щоб не змішувати товари старого та нового фільтра.
  }, [
    querySignature,
    normalizedSearch,
    buildCacheKey,
  ]);

  // --- Завантаження списку товарів ---
  useEffect(() => {
    const currentQuerySignature = querySignature;
    if (
      page > 1 &&
      firstPageReadySignatureRef.current !== currentQuerySignature
    ) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const debounceDelay = 0;

    const trimmed = normalizedSearch;
    const cacheKey = buildCacheKey(page, trimmed);

    const applyCachedItems = (items: Product[]) => {
      if (cancelled) {
        pagingRequestedRef.current = false;
        return true;
      }
      if (activeQuerySignatureRef.current !== currentQuerySignature) {
        pagingRequestedRef.current = false;
        return true;
      }
      const uniqueIncoming = mergeUniqueProducts([], items);
      setData((prev) => {
        const prevSafe = Array.isArray(prev) ? prev : [];
        if (page === 1) return uniqueIncoming;
        return mergeUniqueProducts(prevSafe, uniqueIncoming);
      });
      if (page === 1) {
        firstPageReadySignatureRef.current = currentQuerySignature;
      }
      setHasMore(items.length === ITEMS_PER_PAGE);
      setError(null);
      setHasLoadedOnce(true);
      setFilterLoading(false);
      setLoading(false);
      pagingRequestedRef.current = false;
      return true;
    };

    const memoryHit = readPageFromMemory(cacheKey);
    if (memoryHit && memoryHit.length > 0) {
      applyCachedItems(memoryHit);
      return () => {};
    }

    if (page === 1) {
      const sessionHit = readPageFromSession(cacheKey);
      if (sessionHit && sessionHit.length > 0) {
        writePageToMemory(cacheKey, sessionHit, MEMORY_CACHE_TTL_MS_FIRST_PAGE);
        applyCachedItems(sessionHit);
        return () => {};
      }
    }

    setLoading(true);

    const fetchData = async () => {
      setError(null);

      const normalizeForFilter = (value: string) =>
        value.replace(/\s+/g, " ").trim();

      const baseBody: Record<string, unknown> = {
        selectedCars,
        selectedCategories: effectiveSelectedCategories,
        [PAGE_FIELD]: page,
        page,
        [OFFSET_FIELD]: (page - 1) * ITEMS_PER_PAGE,
        [LIMIT_FIELD]: ITEMS_PER_PAGE,
      };

      const producerName = normalizeForFilter(
        producerFromURL || (searchFilter === "producer" ? trimmed : "")
      );
      const applySearchKeys = (body: Record<string, unknown>, keys: string[], value: string) => {
        for (const key of keys) body[key] = value;
      };

      let primaryKeys: string[] | null = null;
      let fallbackKeys: string[] | null = null;

      if (producerName) {
        for (const key of PRODUCER_FIELDS) baseBody[key] = producerName;
      }

      if (trimmed) {
        if (searchFilter === "name") {
          primaryKeys = [...NAME_FIELDS];
        } else if (searchFilter === "code") {
          primaryKeys = [...CODE_FIELDS];
        } else if (searchFilter === "article") {
          primaryKeys = [...ARTICLE_FIELDS];
        } else if (searchFilter === "producer") {
          primaryKeys = [...PRODUCER_FIELDS];
        } else {
          primaryKeys = [...NAME_FIELDS];
          fallbackKeys = [...ARTICLE_FIELDS, ...CODE_FIELDS];
        }
      }

      const normalizedValue = normalizeForFilter(trimmed);

      const makeBody = (keys: string[] | null) => {
        const b = { ...baseBody };
        if (normalizedValue && keys) applySearchKeys(b, keys, normalizedValue);
        return b;
      };

      if (groupFromURL && !subcategoryFromURL) {
        // Historical behavior: send group as "Підгрупа" to 1C; also duplicate into aliases.
        for (const key of SUBGROUP_FIELDS) baseBody[key] = groupFromURL;
        for (const key of GROUP_FIELDS) baseBody[key] = groupFromURL;
      } else if (subcategoryFromURL) {
        for (const key of GROUP_FIELDS) baseBody[key] = groupFromURL ?? "";
        for (const key of SUBGROUP_FIELDS) baseBody[key] = subcategoryFromURL;
      } else if (effectiveSelectedCategories.length > 0) {
        const picked = effectiveSelectedCategories[0];
        for (const key of SUBGROUP_FIELDS) baseBody[key] = picked;
      }

      const runRequest = async (payload: Record<string, unknown>) => {
        const res = await fetch(`${PROXY_ROUTE}?endpoint=getdata`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Помилка сервера");

        const raw = await res.json();
        const itemsArray = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.items)
          ? (raw as { items: unknown[] }).items
          : [];

        return itemsArray.map(normalizeProduct);
      };

      const requestPromise =
        inFlightPageRequests.get(cacheKey) ||
        (async () => {
          let normalized = await runRequest(makeBody(primaryKeys));
        if (!cancelled && normalized.length === 0 && fallbackKeys) {
            normalized = await runRequest(makeBody(fallbackKeys));
          }
          return normalized;
        })();

      if (!inFlightPageRequests.has(cacheKey)) {
        inFlightPageRequests.set(cacheKey, requestPromise);
        requestPromise.then(
          () => inFlightPageRequests.delete(cacheKey),
          () => inFlightPageRequests.delete(cacheKey)
        );
      }

      let normalized: Product[] = [];
      try {
        normalized = await requestPromise;
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") {
          setFilterLoading(false);
          setLoading(false);
          pagingRequestedRef.current = false;
          return;
        }
        setError("Помилка сервера");
        setHasLoadedOnce(true);
        setFilterLoading(false);
        setLoading(false);
        pagingRequestedRef.current = false;
        return;
      }

      if (cancelled) return;

      applyCachedItems(normalized);

      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, normalized, ttl);
      if (page === 1 && normalized.length > 0) {
        writePageToSession(cacheKey, normalized);
      }
    };

    const timerId = typeof window !== "undefined"
      ? window.setTimeout(fetchData, debounceDelay)
      : setTimeout(fetchData, debounceDelay);

    return () => {
      cancelled = true;
      abortControllerSafely(controller);
      if (typeof window !== "undefined") {
        window.clearTimeout(timerId as number);
      } else {
        clearTimeout(timerId as NodeJS.Timeout);
      }
    };
  }, [
    page,
    querySignature,
    normalizedSearch,
    searchFilter,
    selectedCars,
    effectiveSelectedCategories,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    buildCacheKey,
  ]);
// --- Р†РЅС–С†С–Р°Р»С–Р·Р°С†С–СЏ РєС–Р»СЊРєРѕСЃС‚РµР№ ---
  useEffect(() => {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const item of safeData) {
        if (!item.code) continue;
        if (next[item.code] == null) next[item.code] = 1;
      }
      return next;
    });
  }, [safeData]);

  useEffect(() => {
    if (safeData.length === 0) return;

    setPrices((prev) => {
      let didChange = false;
      const next = { ...prev };

      for (const item of safeData) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey || next[stateKey] !== undefined) continue;

        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;

        if (inlinePrice == null) continue;

        next[stateKey] = inlinePrice;
        didChange = true;
      }

      return didChange ? next : prev;
    });

    if (typeof window === "undefined") return;

    for (const item of safeData) {
      const inlinePrice =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      if (inlinePrice == null) continue;

      const lookupKeys = getProductPriceLookupKeys(item);
      for (const lookupKey of lookupKeys) {
        try {
          window.sessionStorage.setItem(
            `${PRICE_CACHE_PREFIX}${lookupKey}`,
            JSON.stringify({ v: inlinePrice, t: Date.now() })
          );
        } catch {}
      }
    }
  }, [safeData]);

  // --- РЈРЅС–РєР°Р»СЊРЅС– С‚РѕРІР°СЂРё ---
  const uniqueData = useMemo(() => {
    const map = new Map<string, Product>();
    for (const it of safeData) {
      if (it.code && !map.has(it.code)) {
        map.set(it.code, it);
      }
    }
    return Array.from(map.values());
  }, [safeData]);

  // --- Р›РѕРєР°Р»СЊРЅРёР№ С„С–Р»СЊС‚СЂ ---
  const filteredData = useMemo(() => {
    const q = normalizedSearchLower;

    return uniqueData.filter((item) => {
      const code = item.code?.toLowerCase() || "";
      const art = item.article?.toLowerCase() || "";
      const name = item.name?.toLowerCase() || "";
      const producer = item.producer?.toLowerCase() || "";

      const producerQuery = (producerFromURL || "").toLowerCase();
      const producerMatch = !producerQuery || producer.includes(producerQuery);

      const match =
        searchFilter === "article"
          ? art.includes(q)
          : searchFilter === "name"
          ? name.includes(q)
          : searchFilter === "code"
          ? code.includes(q)
          : searchFilter === "producer"
          ? producer.includes(q)
          : code.includes(q) || art.includes(q) || name.includes(q) || producer.includes(q);

      const catMatch =
        effectiveSelectedCategories.length === 0 ||
        effectiveSelectedCategories.includes(item.subGroup || "") ||
        effectiveSelectedCategories.includes(item.group || "") ||
        effectiveSelectedCategories.includes(item.category || "");

      return match && catMatch && producerMatch;
    });
  }, [
    uniqueData,
    normalizedSearchLower,
    searchFilter,
    effectiveSelectedCategories,
    producerFromURL,
  ]);

  // --- Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ С†С–РЅ (Р±Р°С‚С‡РµРј) ---
  useEffect(() => {
    let cancelled = false;
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
        if (
          typeof parsed.v === "number" &&
          Number.isFinite(parsed.v) &&
          parsed.v > 0
        ) {
          return { hit: true as const, value: parsed.v };
        }
        return { hit: false as const };
      } catch {
        return { hit: false as const };
      }
    };

    const writeCachedPrice = (code: string, price: number) => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.setItem(
          `${PRICE_CACHE_PREFIX}${code}`,
          JSON.stringify({ v: price, t: Date.now() })
        );
      } catch {}
    };

    const loadPrices = async () => {
      const nowTs = Date.now();
      const source = filteredData.filter(
        (item) => {
          const stateKey = getProductPriceStateKey(item);
          if (!stateKey) return false;
          const hasInlinePrice =
            typeof item.priceEuro === "number" &&
            Number.isFinite(item.priceEuro) &&
            item.priceEuro > 0;
          if (hasInlinePrice) return false;

          const resolvedPrice = pricesRef.current[stateKey];
          if (
            typeof resolvedPrice === "number" &&
            Number.isFinite(resolvedPrice) &&
            resolvedPrice > 0
          ) {
            return false;
          }
          if (resolvedPrice === null) {
            const cooldownUntil = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
            if (cooldownUntil > nowTs) return false;
            delete priceRetryCooldownUntilRef.current[stateKey];
            priceAttemptsRef.current[stateKey] = 0;
          }
          if (priceLoadingKeysRef.current.has(stateKey)) return false;
          return (priceAttemptsRef.current[stateKey] ?? 0) < PRICE_MAX_RETRY_ATTEMPTS;
        }
      );

      if (!source.length) return;

      const cachedUpdates: Record<string, number | null> = {};
      const missingItems: Array<{
        stateKey: string;
        lookupKeys: string[];
      }> = [];

      for (const item of source) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const lookupKeys = getProductPriceLookupKeys(item);
        let resolvedCachedPrice: number | null | undefined;

        for (const lookupKey of lookupKeys) {
          const cached = readCachedPrice(lookupKey);
          if (!cached.hit) continue;
          resolvedCachedPrice = cached.value;
          break;
        }

        if (resolvedCachedPrice !== undefined) {
          cachedUpdates[stateKey] = resolvedCachedPrice;
          continue;
        }

        missingItems.push({ stateKey, lookupKeys });
      }

      if (!cancelled && Object.keys(cachedUpdates).length > 0) {
        setPrices((prev) => ({ ...prev, ...cachedUpdates }));
      }

      if (!missingItems.length) return;

      const applyBatchPrices = (
        batch: Array<{ stateKey: string; lookupKeys: string[] }>,
        batchPrices: Record<string, number | null>
      ) => {
        if (cancelled) return;

        let nextRetryDelayMs: number | null = null;
        setPrices((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const item of batch) {
            const resolvedPrice = batchPrices[item.stateKey];
            const hasResolvedPrice =
              typeof resolvedPrice === "number" &&
              Number.isFinite(resolvedPrice) &&
              resolvedPrice > 0;

            if (hasResolvedPrice) {
              if (next[item.stateKey] !== resolvedPrice) {
                next[item.stateKey] = resolvedPrice;
                didChange = true;
              }
              writeCachedPrice(item.stateKey, resolvedPrice);
              for (const lookupKey of item.lookupKeys) {
                writeCachedPrice(lookupKey, resolvedPrice);
              }
              delete priceAttemptsRef.current[item.stateKey];
              delete priceRetryCooldownUntilRef.current[item.stateKey];
              continue;
            }

            const nextAttempt = (priceAttemptsRef.current[item.stateKey] ?? 0) + 1;
            priceAttemptsRef.current[item.stateKey] = nextAttempt;

            if (nextAttempt >= PRICE_MAX_RETRY_ATTEMPTS) {
              const retryInMs = PRICE_REVALIDATE_AFTER_NULL_MS;
              priceRetryCooldownUntilRef.current[item.stateKey] = Date.now() + retryInMs;
              if (next[item.stateKey] !== null) {
                next[item.stateKey] = null;
                didChange = true;
              }
              nextRetryDelayMs =
                nextRetryDelayMs == null
                  ? retryInMs
                  : Math.min(nextRetryDelayMs, retryInMs);
            } else {
              nextRetryDelayMs =
                nextRetryDelayMs == null
                  ? PRICE_RETRY_DELAY_MS
                  : Math.min(nextRetryDelayMs, PRICE_RETRY_DELAY_MS);
            }
          }
          return didChange ? next : prev;
        });

        for (const item of batch) {
          priceLoadingKeysRef.current.delete(item.stateKey);
        }

        if (nextRetryDelayMs != null && !priceRetryTimerRef.current) {
          priceRetryTimerRef.current = setTimeout(() => {
            priceRetryTimerRef.current = null;
            setPriceRetryTick((value) => value + 1);
          }, nextRetryDelayMs);
        }
      };

      const runPriceQueue = async (
        queue: Array<{ stateKey: string; lookupKeys: string[] }>,
        options: { batchSize: number; maxConcurrency: number; mode: "fast" | "full" }
      ) => {
        if (queue.length === 0) return;

        let cursor = 0;
        const workers = Array.from(
          {
            length: Math.min(
              options.maxConcurrency,
              Math.ceil(queue.length / options.batchSize)
            ),
          },
          async () => {
            while (cursor < queue.length) {
              const batch = queue.slice(cursor, cursor + options.batchSize);
              cursor += options.batchSize;
              if (batch.length === 0) return;

              for (const item of batch) {
                priceLoadingKeysRef.current.add(item.stateKey);
              }

              try {
                const response = await fetch(
                  `${CATALOG_PRICE_BATCH_ROUTE}?mode=${options.mode}`,
                  {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ items: batch }),
                  signal: controller.signal,
                  cache: "no-store",
                  }
                );

                if (!response.ok) {
                  applyBatchPrices(batch, {});
                  continue;
                }

                const payload = (await response.json()) as {
                  prices?: Record<string, number | null>;
                };
                applyBatchPrices(batch, payload?.prices ?? {});
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                  for (const item of batch) {
                    priceLoadingKeysRef.current.delete(item.stateKey);
                  }
                  return;
                }
                applyBatchPrices(batch, {});
              }
            }
          }
        );

        await Promise.all(workers);
      };

      const priorityItems = missingItems.slice(0, PRICE_PRIORITY_ITEMS_COUNT);
      const immediateItems = priorityItems.slice(0, PRICE_IMMEDIATE_ITEMS_COUNT);
      const batchedPriorityItems = priorityItems.slice(PRICE_IMMEDIATE_ITEMS_COUNT);
      const backgroundItems = missingItems.slice(PRICE_PRIORITY_ITEMS_COUNT);

      await runPriceQueue(immediateItems, {
        batchSize: PRICE_IMMEDIATE_BATCH_SIZE,
        maxConcurrency: PRICE_IMMEDIATE_BATCH_CONCURRENCY,
        mode: "fast",
      });

      if (cancelled) return;

      await runPriceQueue(batchedPriorityItems, {
        batchSize: PRICE_PRIORITY_BATCH_SIZE,
        maxConcurrency: PRICE_PRIORITY_BATCH_CONCURRENCY,
        mode: "fast",
      });

      if (cancelled) return;

      const unresolvedPriorityItems = priorityItems.filter((item) => {
        const resolvedPrice = pricesRef.current[item.stateKey];
        return !(
          typeof resolvedPrice === "number" &&
          Number.isFinite(resolvedPrice) &&
          resolvedPrice > 0
        );
      });

      await runPriceQueue(unresolvedPriorityItems, {
        batchSize: PRICE_PRIORITY_BATCH_SIZE,
        maxConcurrency: PRICE_PRIORITY_BATCH_CONCURRENCY,
        mode: "full",
      });

      if (cancelled) return;

      await runPriceQueue(backgroundItems, {
        batchSize: PRICE_BACKGROUND_BATCH_SIZE,
        maxConcurrency: PRICE_BACKGROUND_BATCH_CONCURRENCY,
        mode: "full",
      });
    };

    void loadPrices();
    return () => {
      cancelled = true;
      abortControllerSafely(controller);
      if (priceRetryTimerRef.current) {
        clearTimeout(priceRetryTimerRef.current);
        priceRetryTimerRef.current = null;
      }
    };
  }, [filteredData, priceRetryTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const requestPriceRetry = () => {
      setPriceRetryTick((value) => value + 1);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestPriceRetry();
      }
    };

    window.addEventListener("focus", requestPriceRetry);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", requestPriceRetry);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- handlers ---
  const handleFlip = useCallback((code: string) => {
    setFlippedCard((p) => (p === code ? null : code));
  }, []);

  const handleQtyChange = useCallback(
    (code: string, delta: number) => {
      setQuantities((prev) => {
        const current = prev[code] ?? 1;
        const max = productsByCode[code]?.quantity ?? 99;
        return { ...prev, [code]: Math.min(Math.max(1, current + delta), max) };
      });
    },
    [productsByCode]
  );

  const handleAddToCart = useCallback(
    (item: Product) => {
      const code = item.code;
      if (!code) return;

      const maxQty = item.quantity ?? 0;
      const cartQty = cartMap[code] ?? 0;
      const qtyToAdd = quantities[code] ?? 1;

      if (maxQty > 0 && cartQty + qtyToAdd > maxQty) {
        alert(`Максимально доступно ${maxQty} шт.`);
        return;
      }

      const priceKey = getProductPriceStateKey(item);
      const euro = prices[priceKey] ?? null;
      const priceUAH = toPriceUAH(euro, euroRate);

      if (priceUAH == null) {
        return;
      }

      addToCart({
        code,
        name: item.name || "Товар",
        article: item.article || "",
        quantity: qtyToAdd,
        price: priceUAH,
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

  const handleImageOpen = useCallback(async (code: string, article?: string) => {
    const src = await fetchImageBase64(code, article);
    if (!src) return;
    setSelectedImage(src);
  }, []);

  const handleImageClose = useCallback(() => setSelectedImage(null), []);

  useEffect(() => {
    if (!loading) {
      pagingRequestedRef.current = false;
    }
  }, [loading]);

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore || pagingRequestedRef.current) return;
    pagingRequestedRef.current = true;
    setLoading(true);
    setPage((p) => p + 1);
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
    isRefetching,
    hasLoadedOnce,
    filterLoading,
    setFilterLoading,
  };
}

// -----------------------------------------------------------
//                РћРЎРќРћР’РќРР™ РљРћРњРџРћРќР•РќРў DATA
// -----------------------------------------------------------
const Data: React.FC<DataProps> = ({
  selectedCars,
  selectedCategories,
  sortOrder,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const currentSearchParams = searchParams ?? new URLSearchParams();

  const rawSearchQuery = currentSearchParams.get("search") || "";
  const searchFilter =
    (currentSearchParams.get("filter") as "all" | "article" | "name" | "code" | "producer") ||
    "all";

  const groupFromURL = currentSearchParams.get("group");
  const subcategoryFromURL = currentSearchParams.get("subcategory");
  const producerFromURL = (currentSearchParams.get("producer") || "").trim() || null;
  const lastFilterSignatureRef = useRef<string | null>(null);
  const [lastStableSortedData, setLastStableSortedData] = useState<Product[]>([]);

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
    isRefetching,
    hasLoadedOnce,
    filterLoading,
    setFilterLoading,
  } = useCatalogData({
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
  });

  const handleOpenProduct = useCallback((
    code: string,
    name?: string,
    article?: string,
    group?: string,
    subGroup?: string,
    category?: string
  ) => {
    const normalized = (code || "").trim();
    if (!normalized) return;
    const normalizedGroup =
      (group || "").trim() ||
      (category || "").trim() ||
      (groupFromURL || "").trim();
    const normalizedSubGroup =
      (subGroup || "").trim() ||
      (subcategoryFromURL || "").trim();

    router.push(
      buildProductPath({
        code: normalized,
        article,
        name,
        group: normalizedGroup,
        subGroup: normalizedSubGroup,
        category: normalizedGroup || category,
      })
    );
  }, [groupFromURL, router, subcategoryFromURL]);

  const sortedData = useMemo(() => {
    if (sortOrder === "none") return filteredData;
    const copy = [...filteredData];
    const isAsc = sortOrder === "asc";

    copy.sort((a, b) => {
      const priceKeyA = getProductPriceStateKey(a);
      const priceKeyB = getProductPriceStateKey(b);
      const euroA = prices[priceKeyA] ?? null;
      const euroB = prices[priceKeyB] ?? null;
      const priceA = toPriceUAH(euroA, euroRate);
      const priceB = toPriceUAH(euroB, euroRate);

      if (priceA == null && priceB == null) return 0;
      if (priceA == null) return 1;
      if (priceB == null) return -1;

      return isAsc ? priceA - priceB : priceB - priceA;
    });

    return copy;
  }, [filteredData, prices, euroRate, sortOrder]);

  // Disable list/card animations for fastest scroll on all devices.
  const shouldAnimateList = false;

  useEffect(() => {
    if (sortedData.length > 0) {
      setLastStableSortedData(sortedData);
    }
  }, [sortedData]);
  const showGridOverlay = sortedData.length > 0 && (filterLoading || isRefetching);
  const visibleSortedData =
    showGridOverlay && lastStableSortedData.length > 0
      ? lastStableSortedData
      : sortedData;
  const isInitialLoading = (filterLoading || loading) && visibleSortedData.length === 0;
  const isEmptyState =
    hasLoadedOnce && !isInitialLoading && !loading && sortedData.length === 0 && !error;
  const showEmptyState = isEmptyState && !isRefetching;
  const isLoadingMore = loading && !isRefetching;

  // Trigger overlay when any filter/search param changes; clear when load finishes.
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        search: rawSearchQuery.trim(),
        searchFilter,
        groupFromURL,
        subcategoryFromURL,
        producerFromURL,
        selectedCategories,
        selectedCars,
      }),
    [
      rawSearchQuery,
      searchFilter,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      selectedCategories,
      selectedCars,
    ]
  );

  useEffect(() => {
    const prev = lastFilterSignatureRef.current;
    if (prev && prev !== filterSignature) setFilterLoading(true);
    lastFilterSignatureRef.current = filterSignature;
  }, [filterSignature, setFilterLoading]);

  useEffect(() => {
    if (!loading) {
      setFilterLoading(false); // гарантія приховання оверлею навіть після скасованих запитів
    }
  }, [loading, setFilterLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || isInitialLoading || !hasMore || sortedData.length === 0) return;

    const viewportHeight = window.innerHeight;
    const contentHeight = document.documentElement.scrollHeight;
    if (contentHeight <= viewportHeight + 140) {
      loadNextPage();
    }
  }, [loading, isInitialLoading, hasMore, sortedData.length, loadNextPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || isInitialLoading || !hasMore || sortedData.length === 0) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        loadNextPage();
      },
      {
        root: null,
        rootMargin: "0px 0px 320px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, isInitialLoading, hasMore, sortedData.length, loadNextPage]);

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

    const message =
      parts.length > 0
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

  const handleRequestPriceForItem = useCallback(
    (item: Product) => {
      const query = rawSearchQuery.trim();
      const categoryLabel = subcategoryFromURL
        ? `${groupFromURL || ""} / ${subcategoryFromURL}`
        : groupFromURL || "";
      const selectedCategoryLabel =
        !categoryLabel && selectedCategories.length > 0
          ? selectedCategories.join(", ")
          : "";
      const carLabel = selectedCars.length > 0 ? selectedCars.join(", ") : "";
      const producerFilterLabel = producerFromURL ? `Виробник (фільтр): ${producerFromURL}` : "";

      const lines: string[] = ["Потрібна ціна на товар (за запитом)."];
      if (item.name?.trim()) lines.push(`Товар: ${item.name.trim()}`);
      if (item.article?.trim()) lines.push(`Артикул: ${item.article.trim()}`);
      if (item.code?.trim()) lines.push(`Код: ${item.code.trim()}`);
      if (item.producer?.trim()) lines.push(`Виробник: ${item.producer.trim()}`);
      if (query) lines.push(`Пошук: ${query}`);
      if (categoryLabel) lines.push(`Категорія: ${categoryLabel}`);
      if (selectedCategoryLabel) lines.push(`Категорія: ${selectedCategoryLabel}`);
      if (producerFilterLabel) lines.push(producerFilterLabel);
      if (carLabel) lines.push(`Авто: ${carLabel}`);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("openChatWithMessage", { detail: lines.join("\n") })
        );
      }
    },
    [
      rawSearchQuery,
      subcategoryFromURL,
      groupFromURL,
      selectedCategories,
      selectedCars,
      producerFromURL,
    ]
  );

  return (
    <>
      <div
        id="catalog-results"
        data-filter-autoclose="results"
        className={`relative w-full px-3 pb-8 pt-0 sm:px-3.5 lg:px-4 ${
          isEmptyState ? 'overflow-hidden h-[calc(100dvh-96px)]' : ''
        }`}
        style={{
          minHeight: "calc(100dvh - 96px)",
        }}
        aria-busy={loading || filterLoading}
      >
        {showGridOverlay && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-4">
              <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/96 px-3 py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                <div className="loader h-4 w-4 scale-75" />
                <span className="text-[11px] font-medium text-slate-600">
                  Оновлюємо каталог...
                </span>
              </div>
          </div>
        )}
        {!loading && error && (
          <div className="text-center text-red-500 mb-4">{error}</div>
        )}

        {isInitialLoading && (
          <div className="mt-2 flex min-h-[240px] items-center justify-center">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 py-2 shadow-sm shadow-slate-200/60">
              <div className="loader h-5 w-5" />
              <span className="text-sm text-slate-600">Завантаження...</span>
            </div>
          </div>
        )}

        {!isInitialLoading && visibleSortedData.length > 0 && (
          <div className="mx-auto mt-2 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {visibleSortedData.map((item, index) => {
              if (!item?.code) return null;

              const code = item.code;
              const qty = quantities[code] ?? 1;
              const cartQty = cartMap[code] ?? 0;

              const priceKey = getProductPriceStateKey(item);
              const euro = prices[priceKey] ?? null;
              const priceUAH = toPriceUAH(euro, euroRate);

              return (
                <ProductCard
                  key={code || `item-${index}`}
                  item={item}
                  qty={qty}
                  cartQty={cartQty}
                  priceUAH={priceUAH}
                  isFlipped={flippedCard === code}
                  motionEnabled={shouldAnimateList}
                  onAddToCart={handleAddToCart}
                  onRequestPrice={handleRequestPriceForItem}
                  onRemoveFromCart={handleRemoveFromCart}
                  onQtyChange={handleQtyChange}
                  onFlip={handleFlip}
                  onImageOpen={handleImageOpen}
                  onOpenProduct={handleOpenProduct}
                />
              );
            })}
          </div>
        )}

        {!isInitialLoading && hasMore && visibleSortedData.length > 0 && (
          <div ref={loadMoreSentinelRef} className="h-6 w-full" aria-hidden="true" />
        )}

        {isLoadingMore && visibleSortedData.length > 0 && (
          <div className="mt-3 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 py-2 shadow-sm shadow-slate-200/60">
              <div className="loader h-5 w-5" />
              <span className="text-xs text-slate-600">Завантажуємо ще...</span>
            </div>
          </div>
        )}

        {showEmptyState && (
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
                  Спробуйте змінити критерії або надішліть запит менеджеру — ми швидко
                  підберемо потрібну запчастину.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendRequest}
                className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm shadow-sky-300/50 transition hover:bg-sky-600 active:scale-[0.98]"
              >
                Надіслати запит у чат
              </button>
            </div>
          </div>
        )}

        {!loading && hasMore && visibleSortedData.length > 0 && (
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
                                                          
