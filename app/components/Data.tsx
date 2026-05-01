"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useDeferredValue,
} from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";

import { useCart } from "app/context/CartContext";
import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import { fetchCatalogImageBatch } from "app/lib/product-image-batch-client";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";

// --- Types ---
interface DataProps {
  selectedCars: string[];
  selectedCategories: string[];
  sortOrder: "none" | "asc" | "desc";
  initialPagePayload?: CatalogPagePayload | null;
  initialQuerySignature?: string | null;
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
  hasPhoto?: boolean;
}

// --- Constants ---
// Keep pages small to avoid overloading 1C and shorten perceived waits.
const ITEMS_PER_PAGE = 12;
const CATALOG_PAGE_ROUTE = "/api/catalog-page";
const CATALOG_PRICE_BATCH_ROUTE = "/api/catalog-prices";
const CATALOG_PAGE_CACHE_VERSION = "catalog-page:v14-price-unknown-state";
const PRICE_CACHE_PREFIX = "partson:v8:price:";
const PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
const PRICE_PERSISTED_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const PRICE_NEGATIVE_CACHE_TTL_MS = 1000 * 30;
const PRICE_REVALIDATE_AFTER_NULL_MS = 1000 * 45;
const PRICE_PAGE_BATCH_SIZE = ITEMS_PER_PAGE;
const PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS = 1000 * 20;
const MEMORY_CACHE_TTL_MS_FIRST_PAGE = 1000 * 90;
const MEMORY_CACHE_TTL_MS_NEXT_PAGES = 1000 * 120;
const BACKGROUND_PAGE_PREFETCH_DEPTH = 0;
const BACKGROUND_PAGE_PREFETCH_DELAY_MS = 900;
const IMAGE_PRIORITY_ITEMS_COUNT = 4;
const IMAGE_PREFETCH_ON_PAGE_FETCH_COUNT = 8;
const IMAGE_DEEP_RECOVERY_BATCH_COUNT = 4;
const IMAGE_DEEP_RECOVERY_DELAY_MS = 300;
const VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE = 6;
const VISIBLE_IMAGE_PREFETCH_MAX_ITEMS = 18;
const LOAD_MORE_SCROLL_BUFFER_PX = 1200;
const LOAD_MORE_OBSERVER_ROOT_MARGIN = "0px 0px 1400px 0px";
const NEXT_PAGE_LOADER_MIN_VISIBLE_MS = 80;
const NEXT_PAGE_REQUEST_COOLDOWN_MS = 90;
// Keep the old safety fallback for grid windowing; card-level content visibility
// gives smoother long-scroll performance without changing scroll geometry.
const VIRTUAL_WINDOW_THRESHOLD_ITEMS = 1000000;
const VIRTUAL_ROW_ESTIMATED_HEIGHT_PX = 352;
const VIRTUAL_OVERSCAN_ROWS = 6;
const SERVICE_UNAVAILABLE_SOFT_RETRY_COUNT = 2;
const SERVICE_UNAVAILABLE_SOFT_RETRY_DELAY_MS = 520;
const DEFAULT_EURO_RATE = 50;
const EURO_RATE_CACHE_KEY = "partson:v1:euro-rate";
const EURO_RATE_CACHE_TTL_MS = 1000 * 60 * 30;

// Backend field aliases (use escapes to stay ASCII-friendly)
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
const PHOTO_FIELDS = [
  "\u0415\u0441\u0442\u044c\u0424\u043e\u0442\u043e",
  "\u0415\u0441\u0442\u044c\u0444\u043e\u0442\u043e",
  "\u0404\u0441\u0442\u044c\u0424\u043e\u0442\u043e",
  "\u0404\u0441\u0442\u044c\u0444\u043e\u0442\u043e",
  "hasPhoto",
  "HasPhoto",
  "has_photo",
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

const hasAnyField = (source: Record<string, unknown>, keys: readonly string[]) =>
  keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));

const readFirstBoolean = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = false
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) continue;
      if (["true", "1", "yes", "y", "так", "да", "истина", "істина"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "n", "ні", "нет", "ложь", "хибність"].includes(normalized)) {
        return false;
      }
    }
  }
  return fallback;
};

const sanitizeUiErrorMessage = (value: string | null | undefined) => {
  const raw = (value || "").trim();
  if (!raw) return "";

  const looksLikeHtml =
    /<\s*html|<\s*!doctype|<\s*script|<\s*meta|<\s*body/i.test(raw);
  if (looksLikeHtml) return "";

  const stripped = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return "";

  return stripped.length > 220 ? `${stripped.slice(0, 220)}...` : stripped;
};

const toPriceUAH = (euro: number | null | undefined, euroRate: number) => {
  if (typeof euro !== "number" || !Number.isFinite(euro) || euro <= 0) return null;
  return Math.round(euro * euroRate);
};

const readPriceFromStorage = (
  storage: Storage,
  code: string,
  ttlMs: number
): { hit: true; value: number | null } | { hit: false } => {
  try {
    const raw = storage.getItem(`${PRICE_CACHE_PREFIX}${code}`);
    if (!raw) return { hit: false };
    const parsed = JSON.parse(raw) as { v: number | null; t: number };
    if (!parsed || typeof parsed.t !== "number") return { hit: false };
    const entryTtlMs =
      parsed.v === null ? PRICE_NEGATIVE_CACHE_TTL_MS : ttlMs;
    if (Date.now() - parsed.t > entryTtlMs) {
      storage.removeItem(`${PRICE_CACHE_PREFIX}${code}`);
      return { hit: false };
    }
    if (
      typeof parsed.v === "number" &&
      Number.isFinite(parsed.v) &&
      parsed.v > 0
    ) {
      return { hit: true, value: parsed.v };
    }
    if (parsed.v === null) {
      return { hit: true, value: null };
    }
    return { hit: false };
  } catch {
    return { hit: false };
  }
};

const readCachedPriceEntry = (code: string) => {
  if (typeof window === "undefined") return { hit: false as const };

  const sessionHit = readPriceFromStorage(
    window.sessionStorage,
    code,
    PRICE_CACHE_TTL_MS
  );
  if (sessionHit.hit) return sessionHit;

  try {
    return readPriceFromStorage(
      window.localStorage,
      code,
      PRICE_PERSISTED_CACHE_TTL_MS
    );
  } catch {
    return { hit: false as const };
  }
};

const writeCachedPriceEntry = (code: string, price: number | null) => {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ v: price, t: Date.now() });
  try {
    window.sessionStorage.setItem(`${PRICE_CACHE_PREFIX}${code}`, payload);
  } catch {}
  try {
    window.localStorage.setItem(`${PRICE_CACHE_PREFIX}${code}`, payload);
  } catch {}
};

const readCachedEuroRate = () => {
  if (typeof window === "undefined") return null;

  const readFromStorage = (storage: Storage) => {
    try {
      const raw = storage.getItem(EURO_RATE_CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as { rate?: number; t?: number };
      if (
        !parsed ||
        typeof parsed.t !== "number" ||
        typeof parsed.rate !== "number" ||
        !Number.isFinite(parsed.rate) ||
        parsed.rate <= 0
      ) {
        return null;
      }

      if (Date.now() - parsed.t > EURO_RATE_CACHE_TTL_MS) {
        storage.removeItem(EURO_RATE_CACHE_KEY);
        return null;
      }

      return parsed.rate;
    } catch {
      return null;
    }
  };

  const sessionHit = readFromStorage(window.sessionStorage);
  if (sessionHit != null) return sessionHit;

  try {
    return readFromStorage(window.localStorage);
  } catch {
    return null;
  }
};

const writeCachedEuroRate = (rate: number) => {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(rate) || rate <= 0) return;

  const payload = JSON.stringify({ rate, t: Date.now() });

  try {
    window.sessionStorage.setItem(EURO_RATE_CACHE_KEY, payload);
  } catch {}

  try {
    window.localStorage.setItem(EURO_RATE_CACHE_KEY, payload);
  } catch {}
};

const getProductPriceStateKey = (item: Pick<Product, "code" | "article">) =>
  (item.code || item.article || "").trim();

const getProductPriceLookupKeys = (item: Pick<Product, "code" | "article">) =>
  Array.from(
    new Set([(item.article || "").trim(), (item.code || "").trim()].filter(Boolean))
  );

const getResolvedProductPriceUAH = (
  item: Pick<Product, "code" | "article" | "priceEuro">,
  prices: Record<string, number | null>,
  euroRate: number
) => {
  const priceKey = getProductPriceStateKey(item);
  const cachedEuro = priceKey ? prices[priceKey] : undefined;
  const resolvedEuro =
    typeof cachedEuro === "number" && Number.isFinite(cachedEuro) && cachedEuro > 0
      ? cachedEuro
      : typeof item.priceEuro === "number" && Number.isFinite(item.priceEuro) && item.priceEuro > 0
        ? item.priceEuro
        : cachedEuro === null
          ? null
          : item.priceEuro ?? null;

  return toPriceUAH(resolvedEuro, euroRate);
};

const getProductStableListKey = (
  item: Pick<
    Product,
    "code" | "article" | "name" | "producer" | "group" | "subGroup" | "category"
  >
) => {
  const code = (item.code || "").trim();
  const article = (item.article || "").trim();
  const name = (item.name || "").trim().toLowerCase();
  const producer = (item.producer || "").trim().toLowerCase();
  const group = (item.group || "").trim().toLowerCase();
  const subGroup = (item.subGroup || "").trim().toLowerCase();
  const category = (item.category || "").trim().toLowerCase();

  return `${code || "-"}::${article || "-"}::${name || "-"}::${producer || "-"}::${group || "-"}::${subGroup || "-"}::${category || "-"}`;
};

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
  const hasPriceField = hasAnyField(record, PRICE_VALUE_FIELDS);
  const priceEuro = hasPriceField
    ? readFirstNumber(record, PRICE_VALUE_FIELDS, Number.NaN)
    : Number.NaN;

  const group = readFirstString(record, GROUP_FIELDS);
  const subGroup = readFirstString(record, SUBGROUP_FIELDS);
  const category = readFirstString(record, CATEGORY_FIELDS);
  const hasPhoto = readFirstBoolean(record, PHOTO_FIELDS, true);

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
    priceEuro: hasPriceField
      ? Number.isFinite(priceEuro) && priceEuro > 0
        ? priceEuro
        : null
      : undefined,
    group,
    subGroup,
    category,
    hasPhoto,
  };
};

const getProductIdentity = (item: Product) => {
  const hasAnyIdentityPart = Boolean(
    (item.code || "").trim() ||
      (item.article || "").trim() ||
      (item.name || "").trim() ||
      (item.producer || "").trim()
  );

  if (!hasAnyIdentityPart) return "";
  return `stable:${getProductStableListKey(item)}`;
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

const CATALOG_GRID_CLASS =
  "mx-auto mt-2 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4";

const CatalogTransitionLoader = ({
  label = "Оновлюю каталог",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) => (
  <div
    className={`col-span-full flex w-full items-center justify-center ${
      compact ? "min-h-12" : "min-h-24"
    }`}
    role="status"
    aria-label={label}
  >
    <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-600 shadow-[0_10px_22px_rgba(15,23,42,0.06)]">
      <span className="h-3 w-3 animate-pulse rounded-full bg-sky-500" />
      <span>{label}</span>
    </div>
  </div>
);

type CatalogPagePayload = {
  items: Product[];
  prices?: Record<string, number | null>;
  images?: Record<string, string>;
  hasMore?: boolean;
  nextCursor?: string;
  cursorField?: string;
  serviceUnavailable?: boolean;
  message?: string;
};
type PageCacheEntry = { payload: CatalogPagePayload; expiresAt: number };
const pageCache = new Map<string, PageCacheEntry>();
const inFlightPageRequests = new Map<string, Promise<CatalogPagePayload>>();
const now = () => Date.now();
const abortControllerSafely = (controller: AbortController) => {
  if (controller.signal.aborted) return;
  try {
    controller.abort();
  } catch {
    // Prevent teardown-time abort edge cases from surfacing as runtime errors.
  }
};

const createAbortError = () => {
  try {
    return new DOMException("Fetch is aborted", "AbortError");
  } catch {
    const error = new Error("Fetch is aborted");
    error.name = "AbortError";
    return error;
  }
};

const awaitWithAbortSignal = async <T,>(
  promise: Promise<T>,
  signal?: AbortSignal
) => {
  if (!signal) return promise;
  if (signal.aborted) throw createAbortError();

  return await new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      }
    );
  });
};

const readPageFromMemory = (key: string) => {
  const entry = pageCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    pageCache.delete(key);
    return null;
  }
  return entry.payload;
};

const normalizePagePriceMap = (value: unknown): Record<string, number | null> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, number | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;

    if (entry === null) {
      next[normalizedKey] = null;
      continue;
    }

    if (typeof entry === "number" && Number.isFinite(entry) && entry > 0) {
      next[normalizedKey] = entry;
    }
  }

  return next;
};

const normalizePageImageMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (typeof entry !== "string") continue;

    const normalizedValue = entry.trim();
    if (!normalizedValue.startsWith("data:image/")) continue;
    next[normalizedKey] = normalizedValue;
  }

  return next;
};

const normalizePageHasMore = (value: unknown, itemCount: number) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "так", "да"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "ні", "нет"].includes(normalized)) return false;
  }
  return itemCount === ITEMS_PER_PAGE;
};

const normalizePageCursor = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const writePageToMemory = (key: string, payload: CatalogPagePayload, ttlMs: number) => {
  if (ttlMs <= 0) return;
  pageCache.set(key, { payload, expiresAt: now() + ttlMs });
};

const readPageFromSession = (key: string): CatalogPagePayload | null => {
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
    return {
      items: cachedItems.map(normalizeProduct),
      prices: normalizePagePriceMap((parsed as Record<string, unknown>)?.prices),
      images: normalizePageImageMap((parsed as Record<string, unknown>)?.images),
      hasMore: normalizePageHasMore(
        (parsed as Record<string, unknown>)?.hasMore,
        cachedItems.length
      ),
      nextCursor: normalizePageCursor((parsed as Record<string, unknown>)?.nextCursor),
    };
  } catch {
    return null;
  }
};

const writePageToSession = (key: string, payload: CatalogPagePayload) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        items: payload.items,
        prices: payload.prices ?? {},
        images: payload.images ?? {},
        hasMore:
          typeof payload.hasMore === "boolean"
            ? payload.hasMore
            : payload.items.length === ITEMS_PER_PAGE,
        nextCursor: payload.nextCursor ?? "",
      })
    );
  } catch {
    // Ignore sessionStorage quota issues to avoid blocking UI.
  }
};

const mergePageImagesIntoCache = (
  cacheKey: string,
  images: Record<string, string>,
  ttlMs: number
) => {
  if (!cacheKey || Object.keys(images).length === 0) return;

  const currentPayload = readPageFromMemory(cacheKey) ?? readPageFromSession(cacheKey);
  if (!currentPayload) return;

  const nextPayload: CatalogPagePayload = {
    ...currentPayload,
    images: {
      ...(currentPayload.images ?? {}),
      ...images,
    },
  };

  writePageToMemory(cacheKey, nextPayload, ttlMs);
  writePageToSession(cacheKey, nextPayload);
};

const mergePagePricesIntoCache = (
  cacheKey: string,
  prices: Record<string, number | null>,
  ttlMs: number
) => {
  if (!cacheKey || Object.keys(prices).length === 0) return;

  const currentPayload = readPageFromMemory(cacheKey) ?? readPageFromSession(cacheKey);
  if (!currentPayload) return;

  const nextPayload: CatalogPagePayload = {
    ...currentPayload,
    prices: {
      ...(currentPayload.prices ?? {}),
      ...prices,
    },
  };

  writePageToMemory(cacheKey, nextPayload, ttlMs);
  writePageToSession(cacheKey, nextPayload);
};

// --- Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РІРµР»РёРєРѕС— РєР°СЂС‚РёРЅРєРё ---
async function fetchImageBase64(
  productCode: string,
  articleHint?: string
): Promise<string | null> {
  const src = buildProductImagePath(productCode, articleHint);
  return src || null;
}
// -----------------------------------------------------------
//                CUSTOM HOOK useCatalogData()
// -----------------------------------------------------------
function useCatalogData(params: {
  selectedCars: string[];
  selectedCategories: string[];
  rawSearchQuery: string;
  searchFilter: "all" | "article" | "name" | "code" | "producer" | "description";
  groupFromURL: string | null;
  subcategoryFromURL: string | null;
  producerFromURL: string | null;
  sortOrder: "none" | "asc" | "desc";
  initialPagePayload?: CatalogPagePayload | null;
  initialQuerySignature?: string | null;
}) {
  const {
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    sortOrder,
    initialPagePayload,
    initialQuerySignature,
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
  const effectiveServerSortOrder = sortOrder;
  const canUseCursorPagination = selectedCars.length === 0;
  const [data, setData] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [pageImages, setPageImages] = useState<Record<string, string>>({});
  const [pageImagePending, setPageImagePending] = useState<Record<string, true>>({});
  const [pageImageMissing, setPageImageMissing] = useState<Record<string, true>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const isRefetching = loading && page === 1;
  const querySignature = useMemo(
    () =>
      buildCatalogQuerySignature({
        normalizedSearch,
        searchFilter,
        selectedCars,
        selectedCategories: effectiveSelectedCategories,
        group: groupFromURL,
        subcategory: subcategoryFromURL,
        producer: producerFromURL,
        sortOrder: effectiveServerSortOrder,
      }),
    [
      normalizedSearch,
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      effectiveServerSortOrder,
    ]
  );
  const activeQuerySignatureRef = useRef(querySignature);
  const primedInitialPayloadSignatureRef = useRef<string | null>(null);
  const firstPageReadySignatureRef = useRef<string | null>(null);
  const pagingRequestedRef = useRef(false);
  const duplicatePageStreakRef = useRef(0);
  const nextCursorByPageRef = useRef<Record<number, string>>({ 1: "" });
  const nextCursorFieldByPageRef = useRef<Record<number, string>>({ 1: "" });
  const dataRef = useRef<Product[]>([]);
  const pricesRef = useRef<Record<string, number | null>>({});
  const pageImagesRef = useRef<Record<string, string>>({});
  const pageImagePendingRef = useRef<Record<string, true>>({});
  const pageImageMissingRef = useRef<Record<string, true>>({});
  const priceLoadingKeysRef = useRef<Set<string>>(new Set());
  const priceRetryCooldownUntilRef = useRef<Record<string, number>>({});
  const nextPageLoaderShownAtRef = useRef(0);
  const nextPageLoaderHideTimerRef = useRef<number | null>(null);
  const lastNextPageRequestAtRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    pageImagesRef.current = pageImages;
  }, [pageImages]);

  useEffect(() => {
    pageImagePendingRef.current = pageImagePending;
  }, [pageImagePending]);

  useEffect(() => {
    pageImageMissingRef.current = pageImageMissing;
  }, [pageImageMissing]);

  const clearNextPageLoaderHideTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (nextPageLoaderHideTimerRef.current == null) return;
    window.clearTimeout(nextPageLoaderHideTimerRef.current);
    nextPageLoaderHideTimerRef.current = null;
  }, []);

  const showNextPageLoader = useCallback(() => {
    clearNextPageLoaderHideTimer();
    nextPageLoaderShownAtRef.current = Date.now();
    setIsLoadingNextPage(true);
  }, [clearNextPageLoaderHideTimer]);

  const hideNextPageLoader = useCallback(
    (immediate = false) => {
      clearNextPageLoaderHideTimer();

      if (immediate || typeof window === "undefined") {
        setIsLoadingNextPage(false);
        return;
      }

      const elapsedMs = Date.now() - nextPageLoaderShownAtRef.current;
      const remainingMs = Math.max(0, NEXT_PAGE_LOADER_MIN_VISIBLE_MS - elapsedMs);
      if (remainingMs === 0) {
        setIsLoadingNextPage(false);
        return;
      }

      nextPageLoaderHideTimerRef.current = window.setTimeout(() => {
        nextPageLoaderHideTimerRef.current = null;
        setIsLoadingNextPage(false);
      }, remainingMs);
    },
    [clearNextPageLoaderHideTimer]
  );

  const scheduleCatalogBackgroundTask = useCallback((task: () => void) => {
    if (typeof window === "undefined") {
      task();
      return () => {};
    }

    let cancelled = false;
    const runTask = () => {
      if (cancelled) return;
      task();
    };

    if (typeof window.requestAnimationFrame === "function") {
      const frameId = window.requestAnimationFrame(runTask);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frameId);
      };
    }

    const timeoutId = window.setTimeout(runTask, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => clearNextPageLoaderHideTimer, [clearNextPageLoaderHideTimer]);

  const applyResolvedPagePrices = useCallback(
    (items: Product[], resolvedPrices?: Record<string, number | null>) => {
      if (!resolvedPrices || Object.keys(resolvedPrices).length === 0) return;

      const nextUpdates: Record<string, number | null> = {};
      const cooldownUntil = Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;

      for (const item of items) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const resolvedPrice = resolvedPrices[stateKey];
        if (resolvedPrice === undefined) continue;

        nextUpdates[stateKey] = resolvedPrice;
        writeCachedPriceEntry(stateKey, resolvedPrice);
        for (const lookupKey of getProductPriceLookupKeys(item)) {
          writeCachedPriceEntry(lookupKey, resolvedPrice);
        }

        if (resolvedPrice === null) {
          priceRetryCooldownUntilRef.current[stateKey] = cooldownUntil;
        } else {
          delete priceRetryCooldownUntilRef.current[stateKey];
        }
      }

      if (Object.keys(nextUpdates).length === 0) return;

      setPrices((prev) => {
        let didChange = false;
        const next = { ...prev };
        for (const [key, value] of Object.entries(nextUpdates)) {
          if (next[key] !== value) {
            next[key] = value;
            didChange = true;
          }
        }
        pricesRef.current = didChange ? next : prev;
        return didChange ? next : prev;
      });
    },
    []
  );

  const fetchCatalogPagePrices = useCallback(
    async (
      items: Product[],
      options?: {
        prefetchedPrices?: Record<string, number | null>;
        cacheKey?: string;
        ttlMs?: number;
        querySignatureSnapshot?: string;
        signal?: AbortSignal;
      }
    ) => {
      if (typeof window === "undefined") return;

      const prefetchedPrices = options?.prefetchedPrices ?? {};
      const nowTs = Date.now();
      const immediateUpdates: Record<string, number | null> = {};
      const requestItems: Array<{ stateKey: string; lookupKeys: string[] }> = [];

      for (const item of items.slice(0, PRICE_PAGE_BATCH_SIZE)) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const hasKnownNoInlinePrice = item.priceEuro === null;
        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;
        if (inlinePrice != null) continue;

        if (hasKnownNoInlinePrice) {
          immediateUpdates[stateKey] = null;
          priceRetryCooldownUntilRef.current[stateKey] =
            nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          continue;
        }

        const prefetchedPrice = prefetchedPrices[stateKey];
        if (
          typeof prefetchedPrice === "number" &&
          Number.isFinite(prefetchedPrice) &&
          prefetchedPrice > 0
        ) {
          continue;
        }
        if (prefetchedPrice === null) {
          immediateUpdates[stateKey] = null;
          priceRetryCooldownUntilRef.current[stateKey] =
            nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          continue;
        }

        const currentPrice = pricesRef.current[stateKey];
        if (
          typeof currentPrice === "number" &&
          Number.isFinite(currentPrice) &&
          currentPrice > 0
        ) {
          continue;
        }
        if (currentPrice === null) {
          priceRetryCooldownUntilRef.current[stateKey] =
            nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          continue;
        }

        const cooldownUntil = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
        if (cooldownUntil > nowTs) continue;
        if (cooldownUntil > 0) {
          delete priceRetryCooldownUntilRef.current[stateKey];
        }

        if (priceLoadingKeysRef.current.has(stateKey)) continue;

        const lookupKeys = getProductPriceLookupKeys(item);
        if (lookupKeys.length === 0) continue;

        const cachedStateEntry = readCachedPriceEntry(stateKey);
        const cachedEntry = cachedStateEntry.hit
          ? cachedStateEntry
          : lookupKeys
              .map((lookupKey) => readCachedPriceEntry(lookupKey))
              .find((entry) => entry.hit);

        if (cachedEntry?.hit) {
          immediateUpdates[stateKey] = cachedEntry.value;
          if (cachedEntry.value === null) {
            priceRetryCooldownUntilRef.current[stateKey] =
              nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          } else {
            delete priceRetryCooldownUntilRef.current[stateKey];
          }
          continue;
        }

        requestItems.push({ stateKey, lookupKeys });
      }

      if (Object.keys(immediateUpdates).length > 0) {
        setPrices((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, value] of Object.entries(immediateUpdates)) {
            if (next[key] !== value) {
              next[key] = value;
              didChange = true;
            }
          }
          pricesRef.current = didChange ? next : prev;
          return didChange ? next : prev;
        });

        if (options?.cacheKey && options?.ttlMs) {
          mergePagePricesIntoCache(options.cacheKey, immediateUpdates, options.ttlMs);
        }
      }

      if (requestItems.length === 0) return;

      for (const item of requestItems) {
        priceLoadingKeysRef.current.add(item.stateKey);
      }

      const releaseRequestItems = () => {
        for (const item of requestItems) {
          priceLoadingKeysRef.current.delete(item.stateKey);
        }
      };

      const commitResolvedPrices = (
        resolvedPrices: Record<string, number | null>,
        cooldownMs: number
      ) => {
        if (
          options?.querySignatureSnapshot &&
          activeQuerySignatureRef.current !== options.querySignatureSnapshot
        ) {
          return;
        }

        const nextUpdates: Record<string, number | null> = {};
        const cooldownUntil = Date.now() + cooldownMs;

        for (const item of requestItems) {
          const resolvedPrice = resolvedPrices[item.stateKey];
          if (resolvedPrice === undefined) continue;

          nextUpdates[item.stateKey] = resolvedPrice;
          writeCachedPriceEntry(item.stateKey, resolvedPrice);
          for (const lookupKey of item.lookupKeys) {
            writeCachedPriceEntry(lookupKey, resolvedPrice);
          }

          if (resolvedPrice === null) {
            priceRetryCooldownUntilRef.current[item.stateKey] = cooldownUntil;
          } else {
            delete priceRetryCooldownUntilRef.current[item.stateKey];
          }
        }

        if (Object.keys(nextUpdates).length === 0) return;

        setPrices((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, value] of Object.entries(nextUpdates)) {
            if (next[key] !== value) {
              next[key] = value;
              didChange = true;
            }
          }
          pricesRef.current = didChange ? next : prev;
          return didChange ? next : prev;
        });

        if (options?.cacheKey && options?.ttlMs) {
          mergePagePricesIntoCache(options.cacheKey, nextUpdates, options.ttlMs);
        }
      };

      const postBatch = async (
        batch: typeof requestItems,
        mode: "fast" | "full"
      ) => {
        if (batch.length === 0) return {} as Record<string, number | null>;

        const response = await fetch(`${CATALOG_PRICE_BATCH_ROUTE}?mode=${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batch }),
          signal: options?.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Price batch failed: ${response.status}`);
        }

        const payload = (await response.json()) as {
          prices?: Record<string, number | null>;
        };
        return payload?.prices ?? {};
      };

      try {
        const fastPrices = await postBatch(requestItems, "fast");
        const normalizedFastPrices: Record<string, number | null> = {};
        for (const item of requestItems) {
          const resolvedPrice = fastPrices[item.stateKey];
          normalizedFastPrices[item.stateKey] =
            typeof resolvedPrice === "number" &&
            Number.isFinite(resolvedPrice) &&
            resolvedPrice > 0
              ? resolvedPrice
              : null;
        }
        commitResolvedPrices(normalizedFastPrices, PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS);

        const unresolvedItems = requestItems.filter((item) => {
          const value = normalizedFastPrices[item.stateKey];
          return !(typeof value === "number" && Number.isFinite(value) && value > 0);
        });

        if (unresolvedItems.length === 0) return;

        const fullPrices = await postBatch(unresolvedItems, "full");
        const positiveFullPrices: Record<string, number> = {};
        for (const item of unresolvedItems) {
          const resolvedPrice = fullPrices[item.stateKey];
          if (
            typeof resolvedPrice !== "number" ||
            !Number.isFinite(resolvedPrice) ||
            resolvedPrice <= 0
          ) {
            continue;
          }

          positiveFullPrices[item.stateKey] = resolvedPrice;
        }

        if (Object.keys(positiveFullPrices).length > 0) {
          commitResolvedPrices(positiveFullPrices, PRICE_REVALIDATE_AFTER_NULL_MS);
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          const fallbackNulls = Object.fromEntries(
            requestItems.map((item) => [item.stateKey, null])
          ) as Record<string, null>;
          commitResolvedPrices(fallbackNulls, PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS);
        }
      } finally {
        releaseRequestItems();
      }
    },
    []
  );

  const fetchCatalogPageImages = useCallback(
    (
      items: Product[],
      options?: {
        prefetchedImages?: Record<string, string>;
        cacheKey?: string;
        ttlMs?: number;
        querySignatureSnapshot?: string;
        signal?: AbortSignal;
      }
    ) => {
      if (typeof window === "undefined") return;
      if (IMAGE_PREFETCH_ON_PAGE_FETCH_COUNT <= 0) return;

      const prefetchedImages = options?.prefetchedImages ?? {};
      const batchItems = items
        .filter((item) => item.hasPhoto !== false)
        .slice(0, IMAGE_PREFETCH_ON_PAGE_FETCH_COUNT)
        .map((item) => {
          const code = (item.code || "").trim();
          const article = (item.article || "").trim() || undefined;
          const key = buildProductImageBatchKey(code, article);
          return { code, article, key };
        })
        .filter((item) => item.code && item.key)
        .filter((item) => {
          const key = item.key;
          if (!key) return false;
          if (prefetchedImages[key]) return false;
          if (pageImagesRef.current[key]) return false;
          if (pageImagePendingRef.current[key]) return false;
          if (pageImageMissingRef.current[key]) return false;
          return true;
        });

      if (batchItems.length === 0) return;

      const pendingKeys = batchItems
        .map((item) => item.key)
        .filter((key): key is string => Boolean(key));
      const pendingKeySet = new Set(pendingKeys);

      setPageImagePending((prev) => {
        const next = { ...prev };
        for (const key of pendingKeys) {
          next[key] = true;
        }
        return next;
      });

      setPageImageMissing((prev) => {
        if (pendingKeys.length === 0) return prev;
        let didChange = false;
        const next = { ...prev };
        for (const key of pendingKeys) {
          if (!next[key]) continue;
          delete next[key];
          didChange = true;
        }
        return didChange ? next : prev;
      });

      const mergeResolvedImages = (nextImages: Record<string, string>) => {
        if (Object.keys(nextImages).length === 0) return;

        setPageImages((prev) => ({ ...prev, ...nextImages }));
        if (options?.cacheKey && options?.ttlMs) {
          mergePageImagesIntoCache(options.cacheKey, nextImages, options.ttlMs);
        }
      };

      void fetchCatalogImageBatch(
        batchItems.map((item) => ({
          code: item.code,
          article: item.article,
        })),
        {
          signal: options?.signal,
        }
      )
        .then((results) => {
          if (
            options?.querySignatureSnapshot &&
            activeQuerySignatureRef.current !== options.querySignatureSnapshot
          ) {
            return;
          }

          const nextImages: Record<string, string> = {};
          const unresolvedKeys = new Set(pendingKeys);

          for (const result of results) {
            if (!result.key) continue;
            if (result.status === "ready" && result.src) {
              nextImages[result.key] = result.src;
              unresolvedKeys.delete(result.key);
              continue;
            }
          }

          mergeResolvedImages(nextImages);

          setPageImageMissing((prev) => {
            const next = { ...prev };
            for (const key of pendingKeys) {
              if (!unresolvedKeys.has(key) || nextImages[key]) {
                delete next[key];
                continue;
              }
              next[key] = true;
            }
            return next;
          });
          setPageImagePending((prev) => {
            const next = { ...prev };
            for (const key of pendingKeys) {
              delete next[key];
            }
            return next;
          });

          const deepRecoveryItems = batchItems
            .filter(
              (item) =>
                item.key &&
                unresolvedKeys.has(item.key)
            )
            .slice(0, IMAGE_DEEP_RECOVERY_BATCH_COUNT);

          if (deepRecoveryItems.length === 0) {
            return;
          }

          const runDeepRecovery = () => {
            if (options?.signal?.aborted) return;

            void fetchCatalogImageBatch(
              deepRecoveryItems.map((item) => ({
                code: item.code,
                article: item.article,
              })),
              {
                deep: true,
                signal: options?.signal,
              }
            )
              .then((deepResults) => {
              if (
                options?.querySignatureSnapshot &&
                activeQuerySignatureRef.current !== options.querySignatureSnapshot
              ) {
                return;
              }

              const recoveredImages: Record<string, string> = {};
              const recoveredKeys = new Set<string>();

              for (const result of deepResults) {
                if (!result.key) continue;
                if (result.status !== "ready" || !result.src) continue;
                if (!pendingKeySet.has(result.key)) continue;
                recoveredImages[result.key] = result.src;
                recoveredKeys.add(result.key);
              }

              if (recoveredKeys.size === 0) {
                return;
              }

              mergeResolvedImages(recoveredImages);
              setPageImageMissing((prev) => {
                const next = { ...prev };
                for (const key of recoveredKeys) {
                  delete next[key];
                }
                return next;
              });
            })
            .catch(() => {
              // Keep the fast missing placeholder when deep recovery fails.
            });
          };

          window.setTimeout(runDeepRecovery, IMAGE_DEEP_RECOVERY_DELAY_MS);
        })
        .catch((error) => {
          if (
            options?.querySignatureSnapshot &&
            activeQuerySignatureRef.current !== options.querySignatureSnapshot
          ) {
            return;
          }

          if (error instanceof Error && error.name === "AbortError") {
            setPageImagePending((prev) => {
              const next = { ...prev };
              for (const key of pendingKeys) {
                delete next[key];
              }
              return next;
            });
            return;
          }

          setPageImageMissing((prev) => {
            const next = { ...prev };
            for (const key of pendingKeys) {
              next[key] = true;
            }
            return next;
          });

          setPageImagePending((prev) => {
            const next = { ...prev };
            for (const key of pendingKeys) {
              delete next[key];
            }
            return next;
          });
        });
    },
    []
  );

  // ? Курс EUR (fallback 50)
  const [euroRate, setEuroRate] = useState<number>(DEFAULT_EURO_RATE);

  // ? РєСѓСЂСЃ Р· РќРћР’РћР“Рћ PROXY: /api/proxy?endpoint=euro
  useEffect(() => {
    const cachedRate = readCachedEuroRate();
    if (cachedRate != null) {
      setEuroRate((prev) => (prev === cachedRate ? prev : cachedRate));
      return;
    }

    let cancelled = false;

    const loadEuroRate = async () => {
      try {
        const res = await fetch("/api/proxy?endpoint=euro", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const json: { rate?: number } = await res.json();

        if (!cancelled && typeof json?.rate === "number") {
          const nextRate = json.rate;
          writeCachedEuroRate(nextRate);
          setEuroRate((prev) => (prev === nextRate ? prev : nextRate));
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
    (pageNum: number, trimmed: string, cursor = "", cursorField = "") =>
      JSON.stringify({
        endpoint: CATALOG_PAGE_CACHE_VERSION,
        page: pageNum,
        limit: ITEMS_PER_PAGE,
        cursor,
        cursorField,
        q: trimmed,
        filter: searchFilter,
        cars: selectedCars,
        cats: effectiveSelectedCategories,
        group: groupFromURL,
        subcat: subcategoryFromURL,
        producer: producerFromURL,
        sort: effectiveServerSortOrder,
      }),
    [
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      effectiveServerSortOrder,
    ]
  );

  const fetchCatalogPagePayload = useCallback(
    async (
      pageNum: number,
      signal?: AbortSignal,
      cursor = "",
      cursorField = ""
    ) => {
      const useSortedProgressiveWindow =
        effectiveServerSortOrder !== "none" && pageNum > 1;
      const requestPage = useSortedProgressiveWindow ? 1 : pageNum;
      const requestLimit = useSortedProgressiveWindow
        ? ITEMS_PER_PAGE * pageNum
        : ITEMS_PER_PAGE;
      const requestCursor = useSortedProgressiveWindow ? "" : cursor;
      const requestCursorField = useSortedProgressiveWindow ? "" : cursorField;

      const cacheKey = buildCacheKey(
        pageNum,
        normalizedSearch,
        requestCursor,
        requestCursorField
      );
      const existing = inFlightPageRequests.get(cacheKey);
      if (existing) {
        return await awaitWithAbortSignal(existing, signal);
      }

      const requestPromise: Promise<CatalogPagePayload> = (async () => {
        const res = await fetch(CATALOG_PAGE_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: requestPage,
            limit: requestLimit,
            cursor: requestCursor,
            cursorField: requestCursorField,
            selectedCars,
            selectedCategories: effectiveSelectedCategories,
            searchQuery: normalizedSearch,
            searchFilter,
            group: groupFromURL,
            subcategory: subcategoryFromURL,
            producer: producerFromURL,
            sortOrder: effectiveServerSortOrder,
          }),
          cache: "no-store",
        });
        const raw = (await res.json()) as {
          items?: unknown[];
          prices?: Record<string, number | null>;
          images?: Record<string, string>;
          hasMore?: boolean;
          nextCursor?: string;
          cursorField?: string;
          serviceUnavailable?: boolean;
          message?: string;
        };

        if (!res.ok) {
          return {
            items: [],
            prices: {},
            images: {},
            hasMore: false,
            nextCursor: "",
            serviceUnavailable: true,
            message:
              typeof raw?.message === "string" && raw.message.trim()
                ? raw.message.trim()
                : "Каталог тимчасово недоступний. Спробуйте ще раз трохи пізніше.",
          } satisfies CatalogPagePayload;
        }

        const itemsArray = Array.isArray(raw?.items) ? raw.items : [];
        return {
          items: itemsArray.map(normalizeProduct),
          prices: normalizePagePriceMap(raw?.prices),
          images: normalizePageImageMap(raw?.images),
          hasMore: normalizePageHasMore(raw?.hasMore, itemsArray.length),
          nextCursor: normalizePageCursor(raw?.nextCursor),
          cursorField:
            typeof raw?.cursorField === "string" && raw.cursorField.trim()
              ? raw.cursorField.trim()
              : undefined,
          serviceUnavailable: raw?.serviceUnavailable === true,
          message:
            typeof raw?.message === "string" && raw.message.trim()
              ? raw.message.trim()
              : undefined,
        } satisfies CatalogPagePayload;
      })();

      inFlightPageRequests.set(cacheKey, requestPromise);
      requestPromise.finally(() => {
        inFlightPageRequests.delete(cacheKey);
      });
      return await awaitWithAbortSignal(requestPromise, signal);
    },
    [
      buildCacheKey,
      effectiveSelectedCategories,
      groupFromURL,
      normalizedSearch,
      producerFromURL,
      searchFilter,
      selectedCars,
      effectiveServerSortOrder,
      subcategoryFromURL,
    ]
  );

  // reset при зміні фільтрів / пошуку
  useEffect(() => {
    activeQuerySignatureRef.current = querySignature;
    firstPageReadySignatureRef.current = null;
    pagingRequestedRef.current = false;
    duplicatePageStreakRef.current = 0;
    lastNextPageRequestAtRef.current = 0;
    nextCursorByPageRef.current = { 1: "" };
    nextCursorFieldByPageRef.current = { 1: "" };
    priceLoadingKeysRef.current.clear();
    priceRetryCooldownUntilRef.current = {};
    setPage(1);
    setHasMore(true);
    setHasLoadedOnce(false);
    setFlippedCard(null);
    setSelectedImage(null);
    setError(null);
    hideNextPageLoader(true);

    const trimmed = normalizedSearch;
    if (typeof window !== "undefined") {
      const cacheKey = buildCacheKey(1, trimmed);

      if (
        initialPagePayload &&
        initialQuerySignature === querySignature &&
        primedInitialPayloadSignatureRef.current !== querySignature
      ) {
        writePageToMemory(cacheKey, initialPagePayload, MEMORY_CACHE_TTL_MS_FIRST_PAGE);
        writePageToSession(cacheKey, initialPagePayload);
        primedInitialPayloadSignatureRef.current = querySignature;
      }

      const memoryHit = readPageFromMemory(cacheKey);
      if (memoryHit) {
        const nextItems = mergeUniqueProducts([], memoryHit.items);
        applyResolvedPagePrices(memoryHit.items, memoryHit.prices);
        // Миттєво оновлюємо pageImages з images API
        setPageImages(memoryHit.images ?? {});
        const cancelWarmup = scheduleCatalogBackgroundTask(() => {
          void fetchCatalogPagePrices(memoryHit.items, {
            prefetchedPrices: memoryHit.prices,
            cacheKey,
            ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            querySignatureSnapshot: querySignature,
          });
          // Не обмежуємо prefetch для першої сторінки, images вже є
          // fetchCatalogPageImages(memoryHit.items, { ... });
        });
        dataRef.current = nextItems;
        setData(nextItems);
        nextCursorByPageRef.current[2] = memoryHit.nextCursor || "";
        nextCursorFieldByPageRef.current[2] = memoryHit.cursorField || "";
        setHasMore(
          typeof memoryHit.hasMore === "boolean"
            ? memoryHit.hasMore
            : memoryHit.items.length === ITEMS_PER_PAGE
        );
        setLoading(false);
        setError(null);
        setHasLoadedOnce(true);
        setFilterLoading(false);
        firstPageReadySignatureRef.current = querySignature;
        hideNextPageLoader(true);
        return cancelWarmup;
      }

      const sessionHit = readPageFromSession(cacheKey);
      if (sessionHit) {
        const nextItems = mergeUniqueProducts([], sessionHit.items);
        writePageToMemory(cacheKey, sessionHit, MEMORY_CACHE_TTL_MS_FIRST_PAGE);
        applyResolvedPagePrices(sessionHit.items, sessionHit.prices);
        // Миттєво оновлюємо pageImages з images API
        setPageImages(sessionHit.images ?? {});
        const cancelWarmup = scheduleCatalogBackgroundTask(() => {
          void fetchCatalogPagePrices(sessionHit.items, {
            prefetchedPrices: sessionHit.prices,
            cacheKey,
            ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            querySignatureSnapshot: querySignature,
          });
          // Не обмежуємо prefetch для першої сторінки, images вже є
          // fetchCatalogPageImages(sessionHit.items, { ... });
        });
        dataRef.current = nextItems;
        setData(nextItems);
        nextCursorByPageRef.current[2] = sessionHit.nextCursor || "";
        nextCursorFieldByPageRef.current[2] = sessionHit.cursorField || "";
        setHasMore(
          typeof sessionHit.hasMore === "boolean"
            ? sessionHit.hasMore
            : sessionHit.items.length === ITEMS_PER_PAGE
        );
        setLoading(false);
        setError(null);
        setHasLoadedOnce(true);
        setFilterLoading(false);
        firstPageReadySignatureRef.current = querySignature;
        hideNextPageLoader(true);
        return cancelWarmup;
      }

      // No immediate cache hit for this filter/query, so clear stale products first.
      dataRef.current = [];
      setData([]);
      setLoading(true);
      setFilterLoading(true);
      return;
    }

    dataRef.current = [];
    setData([]);
    setLoading(true);
    setFilterLoading(true);
    // Без cache показуємо чистий стан, щоб не змішувати товари старого та нового фільтра.
  }, [
    applyResolvedPagePrices,
    fetchCatalogPagePrices,
    fetchCatalogPageImages,
    querySignature,
    initialPagePayload,
    initialQuerySignature,
    normalizedSearch,
    buildCacheKey,
    hideNextPageLoader,
    scheduleCatalogBackgroundTask,
  ]);

  // --- Завантаження списку товарів ---
  useEffect(() => {
    const currentQuerySignature = querySignature;
    if (
      page > 1 &&
      firstPageReadySignatureRef.current !== currentQuerySignature
    ) {
      pagingRequestedRef.current = false;
      hideNextPageLoader(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const debounceDelay = 0;
    const cancelPageWarmup = () => {};

    const trimmed = normalizedSearch;
    const requestCursor =
      canUseCursorPagination && page > 1
        ? nextCursorByPageRef.current[page] ?? ""
        : "";
    const requestCursorField =
      canUseCursorPagination && page > 1
        ? nextCursorFieldByPageRef.current[page] ?? ""
        : "";
    const cacheKey = buildCacheKey(page, trimmed, requestCursor, requestCursorField);

    const applyCachedItems = (payload: CatalogPagePayload) => {
      const items = payload.items;
      if (cancelled) {
        pagingRequestedRef.current = false;
        return true;
      }
      if (activeQuerySignatureRef.current !== currentQuerySignature) {
        pagingRequestedRef.current = false;
        return true;
      }
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      const uniqueIncoming = mergeUniqueProducts([], items);
      const previousData = page === 1 ? [] : dataRef.current;
      const nextData =
        page === 1
          ? uniqueIncoming
          : mergeUniqueProducts(previousData, uniqueIncoming);
      const pageIntroducedNewItems =
        page === 1
          ? nextData.length > 0
          : nextData.length > previousData.length;
      if (payload.prices && Object.keys(payload.prices).length > 0) {
        setPrices((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, value] of Object.entries(payload.prices ?? {})) {
            if (next[key] !== value) {
              next[key] = value;
              didChange = true;
            }
          }
          pricesRef.current = didChange ? next : prev;
          return didChange ? next : prev;
        });
      }
      setPageImages((prev) => {
        const incomingImages = payload.images ?? {};
        if (page === 1) {
          return Object.keys(incomingImages).length > 0
            ? { ...prev, ...incomingImages }
            : prev;
        }

        return { ...prev, ...incomingImages };
      });
      dataRef.current = nextData;
      setData(nextData);
      if (payload.nextCursor) {
        nextCursorByPageRef.current[page + 1] = payload.nextCursor;
        nextCursorFieldByPageRef.current[page + 1] = payload.cursorField || "";
      } else {
        delete nextCursorByPageRef.current[page + 1];
        delete nextCursorFieldByPageRef.current[page + 1];
      }
      if (page === 1) {
        firstPageReadySignatureRef.current = currentQuerySignature;
      }
      const payloadHasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : items.length === ITEMS_PER_PAGE;
      const shouldOptimisticallyKeepLoadingSortedPages =
        sortOrder !== "none" && items.length === ITEMS_PER_PAGE;
      const resolvedHasMore =
        payloadHasMore || shouldOptimisticallyKeepLoadingSortedPages;
      const isDuplicatePageChunk =
        page > 1 &&
        items.length > 0 &&
        !pageIntroducedNewItems &&
        !payload.nextCursor;

      // Price-sorted pages can legally overlap when backend has no stable cursor.
      // Do not stop infinite scroll on duplicate chunks in this mode.
      const isCursorlessSortedMode =
        sortOrder !== "none" && !payload.nextCursor;

      if (isDuplicatePageChunk && !isCursorlessSortedMode) {
        duplicatePageStreakRef.current += 1;
      } else {
        duplicatePageStreakRef.current = 0;
      }

      // Some backend pages can overlap; stop only after a long duplicate streak.
      const shouldStopPaginationOnDuplicatePage =
        !isCursorlessSortedMode && !payload.nextCursor && duplicatePageStreakRef.current >= 6;

      setHasMore(
        shouldStopPaginationOnDuplicatePage ? false : resolvedHasMore
      );
      setError(
        payload.serviceUnavailable
          ? sanitizeUiErrorMessage(payload.message) || "Каталог тимчасово недоступний."
          : null
      );
      setHasLoadedOnce(true);
      setFilterLoading(false);
      setLoading(false);
      hideNextPageLoader();

      cancelPageWarmup();
      // Одразу паралельно з оновленням даних запускаємо fetchCatalogPagePrices та fetchCatalogPageImages
      applyResolvedPagePrices(items, payload.prices);
      void fetchCatalogPagePrices(items, {
        prefetchedPrices: payload.prices,
        cacheKey,
        ttlMs: ttl,
        querySignatureSnapshot: currentQuerySignature,
        signal: controller.signal,
      });
      fetchCatalogPageImages(items, {
        prefetchedImages: payload.images,
        cacheKey,
        ttlMs: ttl,
        querySignatureSnapshot: currentQuerySignature,
        signal: controller.signal,
      });

      pagingRequestedRef.current = false;
      return true;
    };

    const memoryHit = readPageFromMemory(cacheKey);
    if (memoryHit && memoryHit.items.length > 0) {
      applyCachedItems(memoryHit);
      return () => {
        cancelled = true;
        cancelPageWarmup();
      };
    }

    const sessionHit = readPageFromSession(cacheKey);
    if (sessionHit && sessionHit.items.length > 0) {
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, sessionHit, ttl);
      applyCachedItems(sessionHit);
      return () => {
        cancelled = true;
        cancelPageWarmup();
      };
    }

    if (page === 1 && !inFlightPageRequests.has(cacheKey)) {
      setLoading(true);
    }

    const fetchData = async () => {
      setError(null);

      let payload: CatalogPagePayload = { items: [], prices: {}, images: {} };
      try {
        payload = await fetchCatalogPagePayload(
          page,
          controller.signal,
          requestCursor,
          requestCursorField
        );

        const shouldSoftRetryServiceUnavailable =
          payload.serviceUnavailable && payload.items.length === 0;
        if (shouldSoftRetryServiceUnavailable) {
          for (
            let attempt = 1;
            attempt <= SERVICE_UNAVAILABLE_SOFT_RETRY_COUNT;
            attempt += 1
          ) {
            const retryDelayMs = SERVICE_UNAVAILABLE_SOFT_RETRY_DELAY_MS * attempt;
            await awaitWithAbortSignal(
              new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, retryDelayMs);
                if (controller.signal.aborted) {
                  clearTimeout(timer);
                  resolve();
                }
              }),
              controller.signal
            );

            const retryPayload = await fetchCatalogPagePayload(
              page,
              controller.signal,
              requestCursor,
              requestCursorField
            );
            payload = retryPayload;

            const stillUnavailable =
              retryPayload.serviceUnavailable && retryPayload.items.length === 0;
            if (!stillUnavailable) break;
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") {
          setFilterLoading(false);
          setLoading(false);
          hideNextPageLoader(true);
          pagingRequestedRef.current = false;
          return;
        }
        setError("Не вдалося звернутися до сервера. Спробуйте ще раз трохи пізніше.");
        setHasLoadedOnce(true);
        setFilterLoading(false);
        setLoading(false);
        hideNextPageLoader(true);
        pagingRequestedRef.current = false;
        return;
      }

      if (cancelled) return;
      applyCachedItems(payload);

      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, payload, ttl);
      if (payload.items.length > 0) {
        writePageToSession(cacheKey, payload);
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
      cancelPageWarmup();
    };
  }, [
    page,
    querySignature,
    normalizedSearch,
    searchFilter,
    selectedCars,
    canUseCursorPagination,
    effectiveSelectedCategories,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    buildCacheKey,
    applyResolvedPagePrices,
    fetchCatalogPagePrices,
    fetchCatalogPagePayload,
    fetchCatalogPageImages,
    hideNextPageLoader,
    scheduleCatalogBackgroundTask,
    sortOrder,
  ]);

  useEffect(() => {
    if (loading || !hasMore || safeData.length === 0) return;

    const prefetchDepth =
      sortOrder === "none"
        ? selectedCars.length === 0
          ? BACKGROUND_PAGE_PREFETCH_DEPTH
          : 1
        : selectedCars.length === 0
          ? 1
          : 0;
    if (prefetchDepth < 1) return;

    let cancelled = false;
    const controller = new AbortController();

    const prefetchUpcomingPages = async () => {
      let upcomingCursor =
        canUseCursorPagination ? nextCursorByPageRef.current[page + 1] ?? "" : "";
      let upcomingCursorField =
        canUseCursorPagination ? nextCursorFieldByPageRef.current[page + 1] ?? "" : "";

      for (let depth = 1; depth <= prefetchDepth; depth += 1) {
        if (cancelled) return;

        const targetPage = page + depth;
        const targetCursor = canUseCursorPagination ? upcomingCursor : "";
        const targetCursorField = canUseCursorPagination ? upcomingCursorField : "";

        const targetCacheKey = buildCacheKey(
          targetPage,
          normalizedSearch,
          targetCursor,
          targetCursorField
        );
        const ttl =
          targetPage === 1
            ? MEMORY_CACHE_TTL_MS_FIRST_PAGE
            : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
        const memoryHit = readPageFromMemory(targetCacheKey);

        if (memoryHit) {
          if (canUseCursorPagination && memoryHit.nextCursor) {
            nextCursorByPageRef.current[targetPage + 1] = memoryHit.nextCursor;
            nextCursorFieldByPageRef.current[targetPage + 1] =
              memoryHit.cursorField || "";
            upcomingCursor = memoryHit.nextCursor;
            upcomingCursorField = memoryHit.cursorField || "";
          }
          if (memoryHit.items.length === 0) return;
          // Prefetch images and prices for memoryHit
          void fetchCatalogPagePrices(memoryHit.items, {
            prefetchedPrices: memoryHit.prices,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
          fetchCatalogPageImages(memoryHit.items, {
            prefetchedImages: memoryHit.images,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
          continue;
        }

        try {
          const payload = await fetchCatalogPagePayload(
            targetPage,
            controller.signal,
            targetCursor,
            targetCursorField
          );
          if (cancelled) return;
          if (payload.items.length === 0) return;

          writePageToMemory(targetCacheKey, payload, ttl);
          writePageToSession(targetCacheKey, payload);
          if (canUseCursorPagination && payload.nextCursor) {
            nextCursorByPageRef.current[targetPage + 1] = payload.nextCursor;
            nextCursorFieldByPageRef.current[targetPage + 1] =
              payload.cursorField || "";
            upcomingCursor = payload.nextCursor;
            upcomingCursorField = payload.cursorField || "";
          } else if (canUseCursorPagination) {
            delete nextCursorByPageRef.current[targetPage + 1];
            delete nextCursorFieldByPageRef.current[targetPage + 1];
            upcomingCursor = "";
            upcomingCursorField = "";
          }
          // Prefetch images and prices for payload
          void fetchCatalogPagePrices(payload.items, {
            prefetchedPrices: payload.prices,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
          fetchCatalogPageImages(payload.items, {
            prefetchedImages: payload.images,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
        } catch {
          return;
        }
      }
    };

    const timerId = window.setTimeout(() => {
      void prefetchUpcomingPages();
    }, BACKGROUND_PAGE_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      abortControllerSafely(controller);
    };
  }, [
    buildCacheKey,
    canUseCursorPagination,
    fetchCatalogPageImages,
    fetchCatalogPagePayload,
    fetchCatalogPagePrices,
    hasMore,
    loading,
    normalizedSearch,
    page,
    querySignature,
    safeData.length,
    selectedCars.length,
    sortOrder,
  ]);
// --- Р†РЅС–С†С–Р°Р»С–Р·Р°С†С–СЏ РєС–Р»СЊРєРѕСЃС‚РµР№ ---
  useEffect(() => {
    setQuantities((prev) => {
      let didChange = false;
      const next = { ...prev };
      for (const item of safeData) {
        if (!item.code) continue;
        if (next[item.code] == null) {
          next[item.code] = 1;
          didChange = true;
        }
      }
      return didChange ? next : prev;
    });
  }, [safeData]);

  useEffect(() => {
    if (safeData.length === 0) return;

    setPrices((prev) => {
      let didChange = false;
      const next = { ...prev };

      for (const item of safeData) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const hasKnownNoInlinePrice = item.priceEuro === null;
        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;

        if (inlinePrice == null && !hasKnownNoInlinePrice) {
          continue;
        }

        const nextPrice = inlinePrice ?? null;
        if (next[stateKey] !== nextPrice) {
          next[stateKey] = nextPrice;
          didChange = true;
        }
      }

      pricesRef.current = didChange ? next : prev;
      return didChange ? next : prev;
    });

    if (typeof window === "undefined") return;

    for (const item of safeData) {
      const stateKey = getProductPriceStateKey(item);
      const hasKnownNoInlinePrice = item.priceEuro === null;
      const inlinePrice =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      if (inlinePrice == null && !hasKnownNoInlinePrice) continue;
      const nextPrice = inlinePrice ?? null;

      if (stateKey) {
        writeCachedPriceEntry(stateKey, nextPrice);
      }
      const lookupKeys = getProductPriceLookupKeys(item);
      for (const lookupKey of lookupKeys) {
        writeCachedPriceEntry(lookupKey, nextPrice);
      }
    }
  }, [safeData]);

  // --- РЈРЅС–РєР°Р»СЊРЅС– С‚РѕРІР°СЂРё ---
  const uniqueData = useMemo(() => {
    const map = new Map<string, Product>();
    for (const it of safeData) {
      const stableKey = getProductStableListKey(it);
      if (!stableKey || map.has(stableKey)) continue;
      map.set(stableKey, it);
    }
    return Array.from(map.values());
  }, [safeData]);

  const searchableUniqueData = useMemo(
    () =>
      uniqueData.map((item) => ({
        item,
        codeLower: (item.code || "").toLowerCase(),
        articleLower: (item.article || "").toLowerCase(),
        nameLower: (item.name || "").toLowerCase(),
        producerLower: (item.producer || "").toLowerCase(),
      })),
    [uniqueData]
  );

  // --- Р›РѕРєР°Р»СЊРЅРёР№ С„С–Р»СЊС‚СЂ ---
  const filteredData = useMemo(() => {
    const q = normalizedSearchLower;
    const selectedCategorySet =
      effectiveSelectedCategories.length > 0
        ? new Set(effectiveSelectedCategories)
        : null;
    const producerQuery = (producerFromURL || "").toLowerCase();

    return searchableUniqueData
      .filter(({ item, codeLower, articleLower, nameLower, producerLower }) => {
        const producerMatch = !producerQuery || producerLower.includes(producerQuery);

        const match =
          searchFilter === "article"
            ? articleLower.includes(q)
            : searchFilter === "name"
              ? nameLower.includes(q)
              : searchFilter === "code"
                ? codeLower.includes(q)
                : searchFilter === "producer"
                  ? producerLower.includes(q)
                  : searchFilter === "description"
                    ? true
                  : codeLower.includes(q) ||
                    articleLower.includes(q) ||
                    nameLower.includes(q) ||
                    producerLower.includes(q);

        const catMatch =
          selectedCategorySet == null ||
          selectedCategorySet.has(item.subGroup || "") ||
          selectedCategorySet.has(item.group || "") ||
          selectedCategorySet.has(item.category || "");

        return match && catMatch && producerMatch;
      })
      .map(({ item }) => item);
  }, [
    searchableUniqueData,
    normalizedSearchLower,
    searchFilter,
    effectiveSelectedCategories,
    producerFromURL,
  ]);

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

  const loadNextPage = useCallback(() => {
    if (loading || isLoadingNextPage || !hasMore || pagingRequestedRef.current) return;

    if (typeof window !== "undefined") {
      const nowMs = Date.now();
      if (nowMs - lastNextPageRequestAtRef.current < NEXT_PAGE_REQUEST_COOLDOWN_MS) {
        return;
      }

      lastNextPageRequestAtRef.current = nowMs;
    }

    pagingRequestedRef.current = true;
    showNextPageLoader();
    setPage((prevPage) => prevPage + 1);
  }, [
    hasMore,
    isLoadingNextPage,
    loading,
    showNextPageLoader,
  ]);

  const prefetchVisibleCatalogImages = useCallback(
    (items: Product[]) => {
      if (items.length === 0) return;

      void fetchCatalogPageImages(items, {
        prefetchedImages: pageImagesRef.current,
        querySignatureSnapshot: activeQuerySignatureRef.current,
      });
    },
    [fetchCatalogPageImages]
  );

  return {
    filteredData,
    quantities,
    prices,
    pageImages,
    pageImagePending,
    pageImageMissing,
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
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
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
  initialPagePayload = null,
  initialQuerySignature = null,
}) => {
  const searchParams = useSearchParams();
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const catalogGridRef = useRef<HTMLDivElement | null>(null);
  const currentSearchParams = searchParams ?? new URLSearchParams();

  const rawSearchQuery = currentSearchParams.get("search") || "";
  const searchFilter =
    (currentSearchParams.get("filter") as "all" | "article" | "name" | "code" | "producer" | "description") ||
    "all";

  const groupFromURL = currentSearchParams.get("group");
  const subcategoryFromURL = currentSearchParams.get("subcategory");
  const producerFromURL = (currentSearchParams.get("producer") || "").trim() || null;
  const lastFilterSignatureRef = useRef<string | null>(null);
  const lastStableSortedSignatureRef = useRef("");
  const softTransitionStartedAtRef = useRef(0);
  const softTransitionHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastStableSortedData, setLastStableSortedData] = useState<Product[]>([]);
  const [lastStableFilterSignature, setLastStableFilterSignature] = useState("");
  const [isSoftTransitioning, setIsSoftTransitioning] = useState(false);
  const [virtualWindowRange, setVirtualWindowRange] = useState({
    startIndex: 0,
    endIndex: 0,
    topSpacerPx: 0,
    bottomSpacerPx: 0,
  });
  const [virtualRowHeightPx, setVirtualRowHeightPx] = useState(
    VIRTUAL_ROW_ESTIMATED_HEIGHT_PX
  );
  const [viewportWidth, setViewportWidth] = useState(0);

  const {
    filteredData,
    quantities,
    prices,
    pageImages,
    pageImagePending,
    pageImageMissing,
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
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
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
    sortOrder,
    initialPagePayload,
    initialQuerySignature,
  });

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

  const requestNextPageOnScroll = useCallback(() => {
    loadNextPage();
  }, [loadNextPage]);

  const sortedEntries = useMemo(() => {
    if (sortOrder === "none") {
      return filteredData.map((item, index) => ({
        item,
        index,
        code: item.code,
        stableKey: getProductStableListKey(item),
        priceKey: getProductPriceStateKey(item),
        priceUAH: null as number | null,
      }));
    }

    const entries = filteredData.map((item, index) => ({
      item,
      index,
      code: item.code,
      stableKey: getProductStableListKey(item),
      priceKey: getProductPriceStateKey(item),
      priceUAH: getResolvedProductPriceUAH(item, prices, euroRate),
    }));

    entries.sort((a, b) => {
      const aHasPrice = a.priceUAH != null ? 0 : 1;
      const bHasPrice = b.priceUAH != null ? 0 : 1;
      if (aHasPrice !== bHasPrice) return aHasPrice - bHasPrice;

      if (a.priceUAH != null && b.priceUAH != null) {
        if (sortOrder === "asc" && a.priceUAH !== b.priceUAH) {
          return a.priceUAH - b.priceUAH;
        }

        if (sortOrder === "desc" && a.priceUAH !== b.priceUAH) {
          return b.priceUAH - a.priceUAH;
        }
      }

      return a.index - b.index;
    });

    return entries;
  }, [filteredData, prices, euroRate, sortOrder]);
  const sortedData = useMemo(
    () => sortedEntries.map(({ item }) => item),
    [sortedEntries]
  );
  const sortedDataSignature = useMemo(
    () => sortedData.map((item) => getProductStableListKey(item)).join("|"),
    [sortedData]
  );
  // Disable list/card animations for fastest scroll on all devices.
  const shouldAnimateList = false;

  useEffect(() => {
    if (!sortedDataSignature) return;
    if (lastStableSortedSignatureRef.current === sortedDataSignature) return;

    lastStableSortedSignatureRef.current = sortedDataSignature;
    setLastStableFilterSignature(filterSignature);
    setLastStableSortedData(sortedData);
  }, [filterSignature, sortedData, sortedDataSignature]);
  const shouldKeepStableGrid =
    (filterLoading || isRefetching) &&
    lastStableSortedData.length > 0 &&
    lastStableFilterSignature === filterSignature;
  const visibleSortedData =
    shouldKeepStableGrid && lastStableSortedData.length > 0
      ? lastStableSortedData
      : sortedData;
  const visibleSortedEntries = useMemo(() => {
    if (visibleSortedData === sortedData) {
      return sortedEntries;
    }

    return visibleSortedData.map((item, index) => ({
      item,
      index,
      code: item.code,
      stableKey: getProductStableListKey(item),
      priceKey: getProductPriceStateKey(item),
      priceUAH: getResolvedProductPriceUAH(item, prices, euroRate),
    }));
  }, [visibleSortedData, sortedData, sortedEntries, prices, euroRate]);
  const visibleCatalogImageCandidates = useMemo(
    () =>
      visibleSortedData
        .filter((item) => item.hasPhoto !== false)
        .slice(0, VISIBLE_IMAGE_PREFETCH_MAX_ITEMS),
    [visibleSortedData]
  );
  const shouldShowInitialSkeleton =
    (filterLoading || loading) && visibleSortedData.length === 0;
  const isEmptyState =
    hasLoadedOnce &&
    !shouldShowInitialSkeleton &&
    !loading &&
    sortedData.length === 0 &&
    !error;
  const showEmptyState = isEmptyState && !isRefetching;
  const showInlineLoader =
    visibleSortedData.length > 0 && loading && !isRefetching;
  const shouldShowCatalogGrid =
    visibleSortedData.length > 0 || shouldShowInitialSkeleton;
  const gridColumnCount = useMemo(() => {
    if (viewportWidth >= 1024) return 4;
    if (viewportWidth >= 768) return 3;
    if (viewportWidth >= 640) return 2;
    return 1;
  }, [viewportWidth]);
  const imagePriorityItemsCount = useMemo(() => {
    if (viewportWidth <= 0) return IMAGE_PRIORITY_ITEMS_COUNT;
    if (viewportWidth < 640) return 1;
    if (viewportWidth < 1024) return 2;
    return IMAGE_PRIORITY_ITEMS_COUNT;
  }, [viewportWidth]);
  const shouldUseVirtualWindow =
    visibleSortedEntries.length >= VIRTUAL_WINDOW_THRESHOLD_ITEMS && !shouldShowInitialSkeleton;
  const virtualizedEntries = useMemo(() => {
    if (!shouldUseVirtualWindow) return visibleSortedEntries;

    const safeStart = Math.max(0, Math.min(virtualWindowRange.startIndex, visibleSortedEntries.length));
    const safeEnd = Math.max(safeStart, Math.min(virtualWindowRange.endIndex, visibleSortedEntries.length));
    return visibleSortedEntries.slice(safeStart, safeEnd);
  }, [shouldUseVirtualWindow, virtualWindowRange.endIndex, virtualWindowRange.startIndex, visibleSortedEntries]);
  const hasVirtualWindowMiss =
    shouldUseVirtualWindow &&
    visibleSortedEntries.length > 0 &&
    virtualizedEntries.length === 0;
  const entriesToRender = hasVirtualWindowMiss
    ? visibleSortedEntries
    : virtualizedEntries;
  const effectiveVirtualWindowStartIndex = hasVirtualWindowMiss
    ? 0
    : shouldUseVirtualWindow
      ? Math.max(0, Math.min(virtualWindowRange.startIndex, visibleSortedEntries.length))
      : 0;
  const shouldUseSoftTransition = filterLoading || isRefetching;
  const showFilterTransitionOverlay = false;
  const shouldDimCatalogGrid = false;
  const filterTransitionLabel = useMemo(() => {
    if (isLoadingNextPage) return "Підвантажую наступну сторінку";
    if (subcategoryFromURL) return `Оновлюю підгрупу: ${subcategoryFromURL}`;
    if (groupFromURL) return `Оновлюю групу: ${groupFromURL}`;
    if (producerFromURL) return `Оновлюю виробника: ${producerFromURL}`;
    if (rawSearchQuery.trim()) return `Оновлюю результати для: ${rawSearchQuery.trim()}`;
    return "Оновлюю каталог";
  }, [groupFromURL, isLoadingNextPage, producerFromURL, rawSearchQuery, subcategoryFromURL]);

  useEffect(() => {
    if (shouldUseSoftTransition) {
      if (softTransitionHideTimerRef.current) {
        clearTimeout(softTransitionHideTimerRef.current);
        softTransitionHideTimerRef.current = null;
      }

      if (!isSoftTransitioning) {
        softTransitionStartedAtRef.current = Date.now();
        setIsSoftTransitioning(true);
      }
      return;
    }

    if (!isSoftTransitioning) return;

    const elapsedMs = Date.now() - softTransitionStartedAtRef.current;
    const minVisibleMs = 70;
    const hideDelayMs = Math.max(0, minVisibleMs - elapsedMs);

    softTransitionHideTimerRef.current = setTimeout(() => {
      setIsSoftTransitioning(false);
      softTransitionHideTimerRef.current = null;
    }, hideDelayMs);
  }, [isSoftTransitioning, shouldUseSoftTransition]);

  useEffect(() => {
    return () => {
      if (softTransitionHideTimerRef.current) {
        clearTimeout(softTransitionHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (visibleCatalogImageCandidates.length === 0) return;

    const nextChunk = visibleCatalogImageCandidates
      .filter((item) => {
        const key = buildProductImageBatchKey(item.code, item.article);
        if (!key) return false;
        if (pageImages[key]) return false;
        if (pageImagePending[key]) return false;
        if (pageImageMissing[key]) return false;
        return true;
      })
      .slice(0, VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE);

    if (nextChunk.length === 0) return;

    prefetchVisibleCatalogImages(nextChunk);
  }, [
    pageImageMissing,
    pageImagePending,
    pageImages,
    prefetchVisibleCatalogImages,
    visibleCatalogImageCandidates,
  ]);

  // Keep filter/loading transitions in sync with the current query signature.
  useEffect(() => {
    lastFilterSignatureRef.current = filterSignature;
  }, [filterSignature, setFilterLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewportWidth(window.innerWidth);
  }, [filterSignature]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!loading) {
      setFilterLoading(false); // гарантія приховання оверлею навіть після скасованих запитів
    }
  }, [loading, setFilterLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || shouldShowInitialSkeleton || !hasMore || sortedData.length === 0) return;

    const handleScroll = () => {
      const scrolledBottom = window.scrollY + window.innerHeight;
      const distanceToBottom =
        document.documentElement.scrollHeight - scrolledBottom;

      if (distanceToBottom <= LOAD_MORE_SCROLL_BUFFER_PX) {
        requestNextPageOnScroll();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, loading, requestNextPageOnScroll, shouldShowInitialSkeleton, sortedData.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || shouldShowInitialSkeleton || !hasMore || sortedData.length === 0) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        requestNextPageOnScroll();
      },
      {
        root: null,
        rootMargin: LOAD_MORE_OBSERVER_ROOT_MARGIN,
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, requestNextPageOnScroll, shouldShowInitialSkeleton, sortedData.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || shouldShowInitialSkeleton || !hasMore || sortedData.length === 0) return;

    const maybeLoadMore = () => {
      const scrolledBottom = window.scrollY + window.innerHeight;
      const distanceToBottom =
        document.documentElement.scrollHeight - scrolledBottom;
      if (distanceToBottom <= Math.floor(LOAD_MORE_SCROLL_BUFFER_PX * 0.65)) {
        requestNextPageOnScroll();
      }
    };

    maybeLoadMore();
    window.addEventListener("resize", maybeLoadMore, { passive: true });
    return () => window.removeEventListener("resize", maybeLoadMore);
  }, [hasMore, loading, requestNextPageOnScroll, shouldShowInitialSkeleton, sortedData.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!shouldUseVirtualWindow) {
      setVirtualRowHeightPx(VIRTUAL_ROW_ESTIMATED_HEIGHT_PX);
      setVirtualWindowRange({
        startIndex: 0,
        endIndex: visibleSortedEntries.length,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
      });
      return;
    }

    let rafId = 0;
    const updateRange = () => {
      const grid = catalogGridRef.current;
      if (!grid) return;

      const firstCard = grid.querySelector<HTMLElement>("[data-catalog-card='1']");
      if (firstCard) {
        const cardRect = firstCard.getBoundingClientRect();
        const gridStyle = window.getComputedStyle(grid);
        const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
        const measuredRowHeight = cardRect.height + rowGap;

        if (
          Number.isFinite(measuredRowHeight) &&
          measuredRowHeight >= 220 &&
          measuredRowHeight <= 520 &&
          Math.abs(measuredRowHeight - virtualRowHeightPx) > 1
        ) {
          setVirtualRowHeightPx(measuredRowHeight);
        }
      }

      const totalItems = visibleSortedEntries.length;
      const columns = Math.max(1, gridColumnCount);
      const totalRows = Math.ceil(totalItems / columns);
      const rect = grid.getBoundingClientRect();
      const gridTop = window.scrollY + rect.top;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const rowHeight = Math.max(1, virtualRowHeightPx);
      const overscanPx = VIRTUAL_OVERSCAN_ROWS * rowHeight;

      const rawStartRow = Math.floor(
        (viewportTop - gridTop - overscanPx) / rowHeight
      );
      const rawEndRow = Math.ceil(
        (viewportBottom - gridTop + overscanPx) / rowHeight
      );

      const startRow = Math.max(0, Math.min(totalRows, rawStartRow));
      const endRow = Math.max(startRow + 1, Math.min(totalRows, rawEndRow));

      const startIndex = Math.max(0, Math.min(totalItems, startRow * columns));
      const endIndex = Math.max(startIndex, Math.min(totalItems, endRow * columns));
      const topSpacerPx = startRow * rowHeight;
      const bottomSpacerPx = Math.max(
        0,
        (totalRows - endRow) * rowHeight
      );

      setVirtualWindowRange((prev) => {
        if (
          prev.startIndex === startIndex &&
          prev.endIndex === endIndex &&
          prev.topSpacerPx === topSpacerPx &&
          prev.bottomSpacerPx === bottomSpacerPx
        ) {
          return prev;
        }

        return { startIndex, endIndex, topSpacerPx, bottomSpacerPx };
      });
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateRange();
      });
    };

    updateRange();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [
    gridColumnCount,
    shouldUseVirtualWindow,
    virtualRowHeightPx,
    visibleSortedEntries.length,
  ]);

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
        className={`relative w-full px-3 pb-20 pt-0 sm:px-3.5 sm:pb-24 lg:px-4 ${
          isEmptyState ? 'overflow-hidden h-[calc(100dvh-96px)]' : ''
        }`}
        style={{
          minHeight: "calc(100dvh - 96px)",
        }}
        aria-busy={loading || filterLoading || isLoadingNextPage}
      >
        {!loading && error && (
          <div className="text-center text-red-500 mb-4">{error}</div>
        )}

        {shouldShowCatalogGrid && (
          <div className="relative">
            <div
              ref={catalogGridRef}
              className={`${CATALOG_GRID_CLASS} transition-[opacity,transform,filter] duration-300 ease-out ${
                shouldDimCatalogGrid ? "opacity-[0.88]" : "opacity-100"
              }`}
            >
              {!hasVirtualWindowMiss && shouldUseVirtualWindow && virtualWindowRange.topSpacerPx > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    gridColumn: "1 / -1",
                    height: `${virtualWindowRange.topSpacerPx}px`,
                  }}
                />
              )}

              {entriesToRender.map((entry, index) => {
                const { item, priceKey, stableKey } = entry;
                const priceUAH =
                  entry.priceUAH ?? getResolvedProductPriceUAH(item, prices, euroRate);
                if (!item?.code) return null;

                const code = item.code;
                const qty = quantities[code] ?? 1;
                const cartQty = cartMap[code] ?? 0;
                const absoluteIndex = effectiveVirtualWindowStartIndex + index;

                const priceStatus =
                  priceUAH != null
                    ? "ready"
                    : Object.prototype.hasOwnProperty.call(prices, priceKey)
                      ? "request"
                      : "loading";
                const shouldPrioritizeImage = absoluteIndex < imagePriorityItemsCount;
                const imageBatchKey = buildProductImageBatchKey(item.code, item.article);
                const hasPhoto = item.hasPhoto !== false;
                const normalizedGroup =
                  (item.group || "").trim() ||
                  (item.category || "").trim() ||
                  (groupFromURL || "").trim();
                const normalizedSubGroup =
                  (item.subGroup || "").trim() ||
                  (subcategoryFromURL || "").trim();
                const productHref = buildProductPath({
                  code: item.code,
                  article: item.article,
                  name: item.name,
                  producer: item.producer,
                  group: normalizedGroup,
                  subGroup: normalizedSubGroup,
                  category: normalizedGroup || item.category,
                });

                return (
                  <div
                    key={stableKey || `${code || "item"}-${index}`}
                    data-catalog-card="1"
                    className={
                      absoluteIndex > imagePriorityItemsCount + gridColumnCount
                        ? "[content-visibility:auto] [contain-intrinsic-size:352px]"
                        : undefined
                    }
                  >
                    <ProductCard
                      item={item}
                      productHref={productHref}
                      qty={qty}
                      cartQty={cartQty}
                      priceUAH={priceUAH}
                      priceStatus={priceStatus}
                      imageLoadingMode={shouldPrioritizeImage ? "eager" : "lazy"}
                      imageFetchPriority={shouldPrioritizeImage ? "high" : "low"}
                      prefetchedImageSrc={
                        (imageBatchKey ? pageImages[imageBatchKey] : null) ?? null
                      }
                      batchImagePending={Boolean(imageBatchKey && pageImagePending[imageBatchKey])}
                      batchImageMissing={
                        !hasPhoto ||
                        Boolean(imageBatchKey && pageImageMissing[imageBatchKey])
                      }
                      batchImageOnly={hasPhoto && !shouldPrioritizeImage}
                      isFlipped={flippedCard === code}
                      motionEnabled={shouldAnimateList}
                      onAddToCart={handleAddToCart}
                      onRequestPrice={handleRequestPriceForItem}
                      onRemoveFromCart={handleRemoveFromCart}
                      onQtyChange={handleQtyChange}
                      onFlip={handleFlip}
                      onImageOpen={handleImageOpen}
                    />
                  </div>
                );
              })}

              {!hasVirtualWindowMiss && shouldUseVirtualWindow && virtualWindowRange.bottomSpacerPx > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    gridColumn: "1 / -1",
                    height: `${virtualWindowRange.bottomSpacerPx}px`,
                  }}
                />
              )}

              {shouldShowInitialSkeleton && (
                <CatalogTransitionLoader label={filterTransitionLabel} />
              )}

              {showInlineLoader && (
                <CatalogTransitionLoader label="Підвантажую товари" compact />
              )}
            </div>

            {showFilterTransitionOverlay && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-[28px] bg-white/58 px-4 py-6 backdrop-blur-[2px]">
                <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-medium text-slate-700 shadow-lg shadow-slate-200/60">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
                  <span>{filterTransitionLabel}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {!shouldShowInitialSkeleton && hasMore && visibleSortedData.length > 0 && (
          <div
            ref={loadMoreSentinelRef}
            className="flex h-8 w-full items-center justify-center"
            aria-live="polite"
          >
            {isLoadingNextPage ? (
              <span className="text-[12px] font-medium text-slate-400">
                Підвантажую товари
              </span>
            ) : null}
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

      </div>

      <AnimatePresence>
        {selectedImage && <ImageModal src={selectedImage} onClose={handleImageClose} />}
      </AnimatePresence>
    </>
  );
};

export default Data;
                                                          
