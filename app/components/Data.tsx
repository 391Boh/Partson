"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ChevronsDown, Search } from "lucide-react";

import { useCart } from "app/context/CartContext";
import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";
import { CATALOG_PAGE_CACHE_VERSION } from "app/lib/catalog-client-cache";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import { primeCatalogImageBatch } from "app/lib/product-image-batch-client";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import { getFirebaseAuthSnapshot } from "app/lib/firebase-auth-state";

// --- Types ---
interface DataProps {
  selectedCars: string[];
  selectedCategories: string[];
  sortOrder: "none" | "asc" | "desc";
  pricedOnly?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  inStock?: boolean;
  initialPagePayload?: CatalogPagePayload | null;
  initialQuerySignature?: string | null;
}

export interface Product {
  raw?: Record<string, unknown>;
  code: string;
  article: string;
  name: string;
  producer: string;
  description?: string;
  quantity: number;
  priceEuro?: number | null;
  costPriceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
  hasPrice?: boolean;
}

// --- Constants ---
// Keep pages small to avoid overloading 1C and shorten perceived waits.
const ITEMS_PER_PAGE = 12;
const CATALOG_PAGE_ROUTE = "/api/catalog-page";
const CATALOG_PRICE_BATCH_ROUTE = "/api/catalog-prices";
const PRICE_CACHE_PREFIX = "partson:v12:price:";
const PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
const PRICE_PERSISTED_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const PRICE_STALE_POSITIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PRICE_NEGATIVE_CACHE_TTL_MS = 1000 * 60;
const PRICE_REVALIDATE_AFTER_NULL_MS = 1000 * 30;
const PRICE_PAGE_BATCH_SIZE = ITEMS_PER_PAGE * 8;
const VISIBLE_PRICE_PREFETCH_CHUNK_SIZE = ITEMS_PER_PAGE * 6;
const PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS = 1000 * 12;
const MEMORY_CACHE_TTL_MS_FIRST_PAGE = 1000 * 60 * 4;
const MEMORY_CACHE_TTL_MS_NEXT_PAGES = 1000 * 60 * 4;
const PAGE_MEMORY_CACHE_MAX_ENTRIES = 48;
const PAGE_SESSION_CACHE_MAX_ENTRIES = 64;
const PAGE_SESSION_CACHE_INDEX_KEY = `${CATALOG_PAGE_CACHE_VERSION}:index`;
const BACKGROUND_PAGE_PREFETCH_DEPTH = 2;
const BACKGROUND_PAGE_PREFETCH_DELAY_MS = 0;
const IMAGE_PRIORITY_ITEMS_COUNT = 12;
const VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE = ITEMS_PER_PAGE * 4;
const NEXT_PAGE_LOADER_MIN_VISIBLE_MS = 40;
const NEXT_PAGE_REQUEST_COOLDOWN_MS = 45;
const VIRTUAL_ROW_ESTIMATED_HEIGHT_PX = 352;
const VIRTUAL_OVERSCAN_ROWS = 4;
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
const DESCRIPTION_FIELDS = [
  "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  "\u041e\u043f\u0438\u0441",
  "Description",
  "description",
  "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u044b",
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  "\u0422\u0435\u043a\u0441\u0442\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u044f",
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
  "priceEuro",
  "price_euro",
  "PriceEuro",
  "\u0426\u0456\u043d\u0430\u041f\u0440\u043e\u0434", // Р¦С–РЅР°РџСЂРѕРґ
  "\u0426\u0435\u043d\u0430\u041f\u0440\u043e\u0434", // Р¦РµРЅР°РџСЂРѕРґ
  "\u0426\u0456\u043d\u0430\u041f\u0440\u043e\u0434\u0430\u0436\u0443",
  "\u0426\u0435\u043d\u0430\u041f\u0440\u043e\u0434\u0430\u0436\u0438",
  "\u0426\u0456\u043d\u0430\u0421\u0430\u0439\u0442",
  "\u0426\u0435\u043d\u0430\u0421\u0430\u0439\u0442",
  "\u0426\u0456\u043d\u0430\u0420\u043e\u0437\u0434\u0440\u0456\u0431",
  "\u0426\u0435\u043d\u0430\u0420\u043e\u0437\u043d\u0438\u0446\u0430",
  "\u0420\u043e\u0437\u043d\u0438\u0447\u043d\u0430\u044f\u0426\u0435\u043d\u0430",
  "\u0426\u0435\u043d\u0430", // Р¦РµРЅР°
  "\u0426\u0456\u043d\u0430", // Р¦С–РЅР°
  "price",
  "Price",
  "cost",
  "Cost",
];
const PURCHASE_PRICE_FIELDS = [
  "costPriceEuro",
  "purchasePrice",
  "purchase_price",
  "\u0426\u0456\u043d\u0430\u0417\u0430\u043a\u0443\u043f", // ЦінаЗакуп
  "ЦінаЗакупівлі",
  "ЦінаЗакупки",
  "ЦенаЗакупки",
  "ЦінаЗак",
  "ЦенаЗак",
  "Себестоимость",
  "Собівартість",
  "ЦінаПостачальника",
  "ЦенаПоставщика",
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
const HAS_PRICE_FIELDS = [
  "\u0415\u0441\u0442\u044c\u0426\u0435\u043d\u0430", // \u0415\u0441\u0442\u044c\u0426\u0435\u043d\u0430
  "\u0404\u0441\u0442\u044c\u0426\u0456\u043d\u0430", // \u0404\u0441\u0442\u044c\u0426\u0456\u043d\u0430
  "hasPrice",
  "HasPrice",
  "has_price",
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
      const cleaned = value
        .replace(/\s+/g, "")
        .replace(",", ".")
        .replace(/[^\d.+-]/g, ""); // handle "1 200", "1,5", "123 EUR"
      const num = Number(cleaned);
      if (Number.isFinite(num)) return num;
    }
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
};

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

const readStalePositivePriceFromStorage = (storage: Storage, code: string) => {
  try {
    const raw = storage.getItem(`${PRICE_CACHE_PREFIX}${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; t?: unknown };
    if (!parsed || typeof parsed.t !== "number") return null;
    if (Date.now() - parsed.t > PRICE_STALE_POSITIVE_CACHE_TTL_MS) return null;
    if (
      typeof parsed.v === "number" &&
      Number.isFinite(parsed.v) &&
      parsed.v > 0
    ) {
      return parsed.v;
    }
    return null;
  } catch {
    return null;
  }
};

const readStalePositivePriceEntry = (code: string) => {
  if (typeof window === "undefined") return null;

  try {
    return (
      readStalePositivePriceFromStorage(window.sessionStorage, code) ??
      readStalePositivePriceFromStorage(window.localStorage, code)
    );
  } catch {
    return null;
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

const normalizePriceKey = (value: string | null | undefined) => {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
};

const getProductPriceStateKey = (item: Pick<Product, "code" | "article">) =>
  normalizePriceKey(item.code || item.article);

const getProductPriceLookupKeys = (item: Pick<Product, "code" | "article">) =>
  Array.from(
    new Set(
      [(item.article || ""), (item.code || "")]
        .map(normalizePriceKey)
        .filter(Boolean)
    )
  );

const getResolvedProductPriceEuro = (
  item: Pick<Product, "code" | "article" | "priceEuro">,
  prices: Record<string, number | null>
) => {
  const priceKeys = Array.from(
    new Set([getProductPriceStateKey(item), ...getProductPriceLookupKeys(item)].filter(Boolean))
  );

  for (const key of priceKeys) {
    const cachedEuro = prices[key];
    if (typeof cachedEuro === "number" && Number.isFinite(cachedEuro) && cachedEuro > 0) {
      return cachedEuro;
    }
  }

  if (
    typeof item.priceEuro === "number" &&
    Number.isFinite(item.priceEuro) &&
    item.priceEuro > 0
  ) {
    return item.priceEuro;
  }

  if (priceKeys.some((key) => prices[key] === null)) {
    return null;
  }

  return item.priceEuro ?? null;
};

const hasResolvedProductPriceState = (
  item: Pick<Product, "code" | "article" | "priceEuro" | "hasPrice">,
  prices: Record<string, number | null>
) => {
  if (
    typeof item.priceEuro === "number" &&
    Number.isFinite(item.priceEuro) &&
    item.priceEuro > 0
  ) {
    return true;
  }

  if (item.priceEuro === null || item.hasPrice === false) {
    return true;
  }

  const priceKeys = Array.from(
    new Set([getProductPriceStateKey(item), ...getProductPriceLookupKeys(item)].filter(Boolean))
  );

  return priceKeys.some((key) => Object.prototype.hasOwnProperty.call(prices, key));
};

const getResolvedProductPriceUAH = (
  item: Pick<Product, "code" | "article" | "priceEuro">,
  prices: Record<string, number | null>,
  euroRate: number
) => {
  const resolvedEuro = getResolvedProductPriceEuro(item, prices);
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
  const priceEuro = readFirstNumber(record, PRICE_VALUE_FIELDS, Number.NaN);
  const rawCostPriceEuro = readFirstNumber(record, PURCHASE_PRICE_FIELDS, Number.NaN);
  const description = readFirstString(record, DESCRIPTION_FIELDS);

  const group = readFirstString(record, GROUP_FIELDS);
  const subGroup = readFirstString(record, SUBGROUP_FIELDS);
  const category = readFirstString(record, CATEGORY_FIELDS);
  const hasPhoto = readFirstBoolean(record, PHOTO_FIELDS, true);
  const hasPriceRaw = readFirstBoolean(record, HAS_PRICE_FIELDS, undefined as unknown as boolean);
  const hasPriceFromValue = Number.isFinite(priceEuro) && priceEuro > 0;
  const hasPrice: boolean | undefined = hasPriceRaw === true ? true : hasPriceRaw === false ? false : hasPriceFromValue ? true : undefined;

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
    description,
    quantity,
    priceEuro: Number.isFinite(priceEuro) && priceEuro > 0 ? priceEuro : null,
    costPriceEuro: Number.isFinite(rawCostPriceEuro) && rawCostPriceEuro > 0 ? rawCostPriceEuro : undefined,
    group,
    subGroup,
    category,
    hasPhoto,
    hasPrice,
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
      compact ? "min-h-16" : "min-h-[180px]"
    }`}
    role="status"
    aria-label={label}
  >
    <div className="inline-flex items-center gap-3 rounded-[18px] border border-sky-100 bg-white/95 px-4 py-3 text-sm font-bold text-slate-700 shadow-[0_18px_42px_rgba(14,165,233,0.12)] ring-1 ring-white/90 backdrop-blur-md">
      <span className="catalog-soft-spinner" aria-hidden="true" />
      <span className="leading-tight">{label}</span>
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
  totalCount?: number | null;
  serviceUnavailable?: boolean;
  message?: string;
};
type PageCacheEntry = {
  payload: CatalogPagePayload;
  expiresAt: number;
  lastAccessedAt: number;
};
type PageSessionCacheIndexEntry = {
  key: string;
  expiresAt: number;
  lastAccessedAt: number;
};
const pageCache = new Map<string, PageCacheEntry>();
const inFlightPageRequests = new Map<string, Promise<CatalogPagePayload>>();
type PriceBatchResult = {
  prices: Record<string, number | null>;
  costPrices: Record<string, number | null>;
};
const inFlightPriceBatchRequests = new Map<
  string,
  Promise<PriceBatchResult>
>();
const now = () => Date.now();
const abortControllerSafely = (controller: AbortController) => {
  if (controller.signal.aborted) return;
  try {
    controller.abort(createAbortError());
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

const swallowAbortError = (error: unknown) => {
  if (isAbortLikeError(error)) {
    return;
  }

  throw error;
};

const isAbortLikeError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;

  const message = error.message.toLowerCase();
  return (
    message.includes("signal is aborted") ||
    message.includes("aborted without reason") ||
    message.includes("fetch is aborted") ||
    message.includes("operation was aborted")
  );
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

const normalizeCacheString = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeOptionalCacheString = (value: string | null | undefined) => {
  const normalized = normalizeCacheString(value);
  return normalized || null;
};

const normalizeFilterToken = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

// Maps Ukrainian keyboard Cyrillic letters to their physical-key English equivalents
// so a user who accidentally types in Cyrillic mode gets the right article match.
const ARTICLE_CYRILLIC_TO_LATIN: Record<string, string> = {
  "\u0439":"q","\u0446":"w","\u0443":"e","\u043A":"r","\u0435":"t","\u043D":"y","\u0433":"u","\u0448":"i","\u0449":"o","\u0437":"p",
  "\u0444":"a","\u0456":"s","\u0432":"d","\u0430":"f","\u043F":"g","\u0440":"h","\u043E":"j","\u043B":"k","\u0434":"l",
  "\u044F":"z","\u0447":"x","\u0441":"c","\u043C":"v","\u0438":"b","\u0442":"n","\u044C":"m",
};

// Normalizes an article token: Cyrillic → Latin keyboard equivalent, then
// strips everything except letters, digits, and slashes (fractions like 3/4).
const normalizeArticleToken = (value: string) =>
  value
    .replace(/[\u0400-\u04FF]/g, (ch) => ARTICLE_CYRILLIC_TO_LATIN[ch] ?? "")
    .replace(/[^a-z0-9\/]/g, "");

const normalizeCacheList = (values: string[]) =>
  Array.from(
    new Set(values.map((value) => normalizeCacheString(value)).filter(Boolean))
  ).sort();

const buildPriceBatchRequestKey = (
  mode: "fast" | "full",
  batch: Array<{ stateKey: string; lookupKeys: string[] }>
) =>
  JSON.stringify({
    mode,
    items: batch
      .map((item) => ({
        stateKey: item.stateKey,
        lookupKeys: Array.from(new Set(item.lookupKeys)).sort(),
      }))
      .sort((left, right) => left.stateKey.localeCompare(right.stateKey)),
  });

const prunePageMemoryCache = () => {
  const nowTs = now();
  for (const [key, entry] of pageCache.entries()) {
    if (!entry || entry.expiresAt <= nowTs) {
      pageCache.delete(key);
    }
  }

  if (pageCache.size <= PAGE_MEMORY_CACHE_MAX_ENTRIES) return;

  const overflowEntries = Array.from(pageCache.entries()).sort(
    (left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt
  );
  for (const [key] of overflowEntries.slice(
    0,
    Math.max(0, pageCache.size - PAGE_MEMORY_CACHE_MAX_ENTRIES)
  )) {
    pageCache.delete(key);
  }
};

const readPageFromMemory = (key: string) => {
  const entry = pageCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    pageCache.delete(key);
    return null;
  }
  entry.lastAccessedAt = now();
  return entry.payload;
};

const normalizePagePriceMap = (value: unknown): Record<string, number | null> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, number | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizePriceKey(key);
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
    if (
      !normalizedValue.startsWith("data:image/") &&
      !normalizedValue.startsWith("/product-image/")
    ) {
      continue;
    }
    next[normalizedKey] = normalizedValue;
  }

  return next;
};

const normalizePageHasMore = (
  value: unknown,
  itemCount: number,
  requestedItemCount = ITEMS_PER_PAGE
) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "так", "да"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "ні", "нет"].includes(normalized)) return false;
  }
  return itemCount >= requestedItemCount;
};

const normalizePageCursor = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const stripCostPriceFromPayload = (payload: CatalogPagePayload): CatalogPagePayload => ({
  ...payload,
  items: payload.items.map((item) => ({ ...item, costPriceEuro: undefined })),
});

const writePageToMemory = (key: string, payload: CatalogPagePayload, ttlMs: number) => {
  if (ttlMs <= 0) return;
  const nowTs = now();
  pageCache.set(key, {
    payload: stripCostPriceFromPayload(payload),
    expiresAt: nowTs + ttlMs,
    lastAccessedAt: nowTs,
  });
  prunePageMemoryCache();
};

const readSessionCacheIndex = (): PageSessionCacheIndexEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(PAGE_SESSION_CACHE_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const key = typeof record.key === "string" ? record.key : "";
        const expiresAt =
          typeof record.expiresAt === "number" ? record.expiresAt : 0;
        const lastAccessedAt =
          typeof record.lastAccessedAt === "number"
            ? record.lastAccessedAt
            : expiresAt;
        return key ? { key, expiresAt, lastAccessedAt } : null;
      })
      .filter((entry): entry is PageSessionCacheIndexEntry => Boolean(entry));
  } catch {
    return [];
  }
};

const writeSessionCacheIndex = (index: PageSessionCacheIndexEntry[]) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PAGE_SESSION_CACHE_INDEX_KEY,
      JSON.stringify(index)
    );
  } catch {
    // Ignore sessionStorage quota issues.
  }
};

const listSessionPageCacheKeys = () => {
  if (typeof window === "undefined") return [] as string[];
  const keys: string[] = [];
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.includes(CATALOG_PAGE_CACHE_VERSION)) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }
  return keys.filter((key) => key !== PAGE_SESSION_CACHE_INDEX_KEY);
};

const prunePageSessionCache = (activeKey?: string) => {
  if (typeof window === "undefined") return;
  const nowTs = now();
  const indexed = new Map(readSessionCacheIndex().map((entry) => [entry.key, entry]));
  const candidates: PageSessionCacheIndexEntry[] = [];

  for (const key of listSessionPageCacheKeys()) {
    let entry = indexed.get(key);
    try {
      const raw = window.sessionStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      const expiresAt =
        typeof parsed?.expiresAt === "number"
          ? parsed.expiresAt
          : entry?.expiresAt ?? nowTs + MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      const lastAccessedAt =
        key === activeKey
          ? nowTs
          : entry?.lastAccessedAt ??
            (typeof parsed?.t === "number" ? parsed.t : expiresAt);

      if (expiresAt <= nowTs) {
        window.sessionStorage.removeItem(key);
        continue;
      }

      entry = { key, expiresAt, lastAccessedAt };
      candidates.push(entry);
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  const kept = candidates.sort((left, right) => {
    if (left.key === activeKey) return -1;
    if (right.key === activeKey) return 1;
    return right.lastAccessedAt - left.lastAccessedAt;
  });

  for (const entry of kept.slice(PAGE_SESSION_CACHE_MAX_ENTRIES)) {
    try {
      window.sessionStorage.removeItem(entry.key);
    } catch {}
  }

  writeSessionCacheIndex(kept.slice(0, PAGE_SESSION_CACHE_MAX_ENTRIES));
};

const readPageFromSession = (key: string): CatalogPagePayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const cached = window.sessionStorage.getItem(key);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    const record = parsed as Record<string, unknown>;
    const expiresAt =
      typeof record?.expiresAt === "number"
        ? record.expiresAt
        : now() + MEMORY_CACHE_TTL_MS_NEXT_PAGES;
    if (expiresAt <= now()) {
      window.sessionStorage.removeItem(key);
      prunePageSessionCache();
      return null;
    }
    const cachedItems = Array.isArray(parsed)
      ? parsed
      : Array.isArray(record?.items)
        ? (record as { items: unknown[] }).items
        : [];
    if (!Array.isArray(cachedItems) || cachedItems.length === 0) {
      window.sessionStorage.removeItem(key);
      prunePageSessionCache();
      return null;
    }
    prunePageSessionCache(key);
    return {
      items: cachedItems.map(normalizeProduct),
      prices: normalizePagePriceMap(record?.prices),
      images: normalizePageImageMap(record?.images),
      hasMore: normalizePageHasMore(
        record?.hasMore,
        cachedItems.length
      ),
      nextCursor: normalizePageCursor(record?.nextCursor),
      cursorField: normalizePageCursor(record?.cursorField),
      totalCount:
        typeof record?.totalCount === "number" && Number.isFinite(record.totalCount)
          ? Math.max(0, Math.floor(record.totalCount))
          : null,
    };
  } catch {
    return null;
  }
};

const writePageToSession = (
  key: string,
  payload: CatalogPagePayload,
  ttlMs = MEMORY_CACHE_TTL_MS_NEXT_PAGES
) => {
  if (typeof window === "undefined") return;
  try {
    const nowTs = now();
    const expiresAt = nowTs + ttlMs;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        items: payload.items.map((item) => ({ ...item, costPriceEuro: undefined })),
        prices: payload.prices ?? {},
        images: payload.images ?? {},
        hasMore:
          typeof payload.hasMore === "boolean"
            ? payload.hasMore
            : payload.items.length === ITEMS_PER_PAGE,
        nextCursor: payload.nextCursor ?? "",
        cursorField: payload.cursorField ?? "",
        totalCount: payload.totalCount ?? null,
        t: nowTs,
        expiresAt,
      })
    );
    const index = readSessionCacheIndex().filter((entry) => entry.key !== key);
    index.unshift({ key, expiresAt, lastAccessedAt: nowTs });
    writeSessionCacheIndex(index.slice(0, PAGE_SESSION_CACHE_MAX_ENTRIES));
    prunePageSessionCache(key);
  } catch {
    // Ignore sessionStorage quota issues to avoid blocking UI.
  }
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
  writePageToSession(cacheKey, nextPayload, ttlMs);
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
  expandHierarchyFromURL: boolean;
  sortOrder: "none" | "asc" | "desc";
  pricedOnly?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  inStock?: boolean;
  includeCostPrices?: boolean;
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
    expandHierarchyFromURL,
    sortOrder,
    pricedOnly = false,
    priceFrom = null,
    priceTo = null,
    inStock = false,
    includeCostPrices = false,
    initialPagePayload,
    initialQuerySignature,
  } = params;

  const { addToCart, cartItems, removeFromCart } = useCart();
  const normalizedSearch = useMemo(() => rawSearchQuery.trim(), [rawSearchQuery]);
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
  const shouldAllowCatalogDirectPriceLookup = true;
  const [data, setData] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [costPrices, setCostPrices] = useState<Record<string, number | null>>({});
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
  const [firstPageResolvedItemCount, setFirstPageResolvedItemCount] = useState(0);
  const [catalogTotalCount, setCatalogTotalCount] = useState<number | null>(null);
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
        expandHierarchy: expandHierarchyFromURL,
        sortOrder: effectiveServerSortOrder,
        pricedOnly,
        priceFrom,
        priceTo,
        inStock,
      }),
    [
      normalizedSearch,
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      expandHierarchyFromURL,
      effectiveServerSortOrder,
      pricedOnly,
      priceFrom,
      priceTo,
      inStock,
    ]
  );
  const activeQuerySignatureRef = useRef(querySignature);
  const primedInitialPayloadSignatureRef = useRef<string | null>(null);
  const firstPageReadySignatureRef = useRef<string | null>(null);
  const pagingRequestedRef = useRef(false);
  const duplicatePageStreakRef = useRef(0);
  const cursorDuplicateStreakRef = useRef(0);
  const nextCursorByPageRef = useRef<Record<number, string>>({ 1: "" });
  const nextCursorFieldByPageRef = useRef<Record<number, string>>({ 1: "" });
  const dataRef = useRef<Product[]>([]);
  const pricesRef = useRef<Record<string, number | null>>({});
  const costPricesRef = useRef<Record<string, number | null>>({});
  const pageImagesRef = useRef<Record<string, string>>({});
  const pageImagePendingRef = useRef<Record<string, true>>({});
  const pageImageMissingRef = useRef<Record<string, true>>({});
  const imageBatchAttemptKeysRef = useRef<Set<string>>(new Set());
  const imageWarmupKeysRef = useRef<Set<string>>(new Set());
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
    costPricesRef.current = costPrices;
  }, [costPrices]);

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

    const win = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === "function") {
      const idleId = win.requestIdleCallback(runTask, { timeout: 180 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(runTask, 32);
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

        const lookupKeys = getProductPriceLookupKeys(item);
        const resolvedPrice = Object.prototype.hasOwnProperty.call(resolvedPrices, stateKey)
          ? resolvedPrices[stateKey]
          : lookupKeys
              .filter((lookupKey) =>
                Object.prototype.hasOwnProperty.call(resolvedPrices, lookupKey)
              )
              .map((lookupKey) => resolvedPrices[lookupKey])[0];
        if (resolvedPrice === undefined) continue;

        nextUpdates[stateKey] = resolvedPrice;
        for (const lookupKey of lookupKeys) {
          nextUpdates[lookupKey] = resolvedPrice;
        }
        writeCachedPriceEntry(stateKey, resolvedPrice);
        for (const lookupKey of lookupKeys) {
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
        allowFullLookup?: boolean;
      }
    ) => {
      if (typeof window === "undefined") return;

      const prefetchedPrices = options?.prefetchedPrices ?? {};
      const allowFullLookup = options?.allowFullLookup === true;
      const nowTs = Date.now();
      const immediateUpdates: Record<string, number | null> = {};
      const requestItems: Array<{ stateKey: string; lookupKeys: string[] }> = [];

      for (const item of items.slice(0, PRICE_PAGE_BATCH_SIZE)) {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) continue;

        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;
        const hasInlineCostPrice =
          typeof item.costPriceEuro === "number" &&
          Number.isFinite(item.costPriceEuro) &&
          item.costPriceEuro > 0;
        // Skip if regular price is already known AND (cost price not needed OR already inline)
        if (inlinePrice != null && (!includeCostPrices || hasInlineCostPrice)) continue;

        const lookupKeys = getProductPriceLookupKeys(item);
        if (lookupKeys.length === 0) continue;

        const prefetchedPrice = Object.prototype.hasOwnProperty.call(
          prefetchedPrices,
          stateKey
        )
          ? prefetchedPrices[stateKey]
          : lookupKeys
              .filter((lookupKey) =>
                Object.prototype.hasOwnProperty.call(prefetchedPrices, lookupKey)
              )
              .map((lookupKey) => prefetchedPrices[lookupKey])[0];
        const needsCostPrice =
          includeCostPrices &&
          !Object.prototype.hasOwnProperty.call(costPricesRef.current, stateKey);

        if (
          typeof prefetchedPrice === "number" &&
          Number.isFinite(prefetchedPrice) &&
          prefetchedPrice > 0
        ) {
          if (!needsCostPrice) continue;
          // Has regular price but cost price not yet fetched — fall through
        } else if (prefetchedPrice === null) {
          immediateUpdates[stateKey] = null;
          priceRetryCooldownUntilRef.current[stateKey] =
            nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          continue;
        } else {
          const currentPrice = pricesRef.current[stateKey];
          if (
            typeof currentPrice === "number" &&
            Number.isFinite(currentPrice) &&
            currentPrice > 0
          ) {
            if (!needsCostPrice) continue;
            // Has regular price in state but cost price not yet fetched — fall through
          } else if (currentPrice === null) {
            // Null already committed — only retry if the cooldown has expired.
            const nullCooldown = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
            if (nullCooldown > nowTs) {
              continue;
            }
            // Cooldown elapsed: fall through to retry the price API.
            if (nullCooldown > 0) {
              delete priceRetryCooldownUntilRef.current[stateKey];
            }
          }
        }

        const cooldownUntil = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
        if (cooldownUntil > nowTs) continue;
        if (cooldownUntil > 0) {
          delete priceRetryCooldownUntilRef.current[stateKey];
        }

        if (priceLoadingKeysRef.current.has(stateKey) && !needsCostPrice) continue;

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
            continue;
          } else {
            delete priceRetryCooldownUntilRef.current[stateKey];
          }
          if (!needsCostPrice) continue;
          // Has cached price but cost price needed — fall through to requestItems
        }

        const stalePrice =
          readStalePositivePriceEntry(stateKey) ??
          lookupKeys
            .map((lookupKey) => readStalePositivePriceEntry(lookupKey))
            .find((value) => typeof value === "number" && value > 0);
        if (
          typeof stalePrice === "number" &&
          Number.isFinite(stalePrice) &&
          stalePrice > 0
        ) {
          immediateUpdates[stateKey] = stalePrice;
          delete priceRetryCooldownUntilRef.current[stateKey];
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
        resolvedCostPrices: Record<string, number | null> | undefined,
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
          for (const lookupKey of item.lookupKeys) {
            nextUpdates[lookupKey] = resolvedPrice;
          }
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

        if (Object.keys(nextUpdates).length > 0) {
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
        }

        if (resolvedCostPrices && Object.keys(resolvedCostPrices).length > 0) {
          const nextCostUpdates: Record<string, number | null> = {};
          for (const item of requestItems) {
            const resolvedCostPrice = resolvedCostPrices[item.stateKey];
            if (resolvedCostPrice === undefined) continue;

            nextCostUpdates[item.stateKey] = resolvedCostPrice;
            for (const lookupKey of item.lookupKeys) {
              nextCostUpdates[lookupKey] = resolvedCostPrice;
            }
          }

          if (Object.keys(nextCostUpdates).length > 0) {
            setCostPrices((prev) => {
              let didChange = false;
              const next = { ...prev };
              for (const [key, value] of Object.entries(nextCostUpdates)) {
                if (next[key] !== value) {
                  next[key] = value;
                  didChange = true;
                }
              }
              costPricesRef.current = didChange ? next : prev;
              return didChange ? next : prev;
            });
          }
        }
      };

      const postBatch = async (
        batch: typeof requestItems,
        mode: "fast" | "full"
      ) => {
        if (batch.length === 0) {
          return { prices: {}, costPrices: {} } satisfies PriceBatchResult;
        }

        const requestKey = buildPriceBatchRequestKey(mode, batch);
        const existing = inFlightPriceBatchRequests.get(requestKey);
        if (existing) {
          return await awaitWithAbortSignal(existing, options?.signal);
        }

        const requestPromise = (async () => {
          const response = await fetch(`${CATALOG_PRICE_BATCH_ROUTE}?mode=${mode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: batch }),
            cache: "no-store",
          });

          if (!response.ok) {
            throw new Error(`Price batch failed: ${response.status}`);
          }

          const payload = (await response.json()) as {
            prices?: Record<string, number | null>;
            costPrices?: Record<string, number | null>;
          };
          return {
            prices: payload?.prices ?? {},
            costPrices: payload?.costPrices ?? {},
          } satisfies PriceBatchResult;
        })();

        inFlightPriceBatchRequests.set(requestKey, requestPromise);
        requestPromise.then(
          () => {
            inFlightPriceBatchRequests.delete(requestKey);
          },
          () => {
            inFlightPriceBatchRequests.delete(requestKey);
          }
        );

        return await awaitWithAbortSignal(requestPromise, options?.signal);
      };

      try {
        const fastResult = await postBatch(requestItems, "fast");
        const normalizedFastPrices: Record<string, number | null> = {};
        const normalizedFastCostPrices: Record<string, number | null> = {};
        for (const item of requestItems) {
          const resolvedPrice = fastResult.prices[item.stateKey];
          if (
            typeof resolvedPrice === "number" &&
            Number.isFinite(resolvedPrice) &&
            resolvedPrice > 0
          ) {
            normalizedFastPrices[item.stateKey] = resolvedPrice;
          }

          const resolvedCostPrice = fastResult.costPrices[item.stateKey];
          if (
            typeof resolvedCostPrice === "number" &&
            Number.isFinite(resolvedCostPrice) &&
            resolvedCostPrice > 0
          ) {
            normalizedFastCostPrices[item.stateKey] = resolvedCostPrice;
          }
        }
        if (
          Object.keys(normalizedFastPrices).length > 0 ||
          Object.keys(normalizedFastCostPrices).length > 0
        ) {
          commitResolvedPrices(
            normalizedFastPrices,
            normalizedFastCostPrices,
            PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS
          );
        }

        const unresolvedItems = requestItems.filter((item) => {
          const value = normalizedFastPrices[item.stateKey];
          return !(typeof value === "number" && Number.isFinite(value) && value > 0);
        });

        const fullLookupItems = includeCostPrices ? requestItems : unresolvedItems;
        if (fullLookupItems.length === 0) {
          return;
        }

        if (!allowFullLookup) {
          for (const item of fullLookupItems) {
            priceRetryCooldownUntilRef.current[item.stateKey] =
              Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          }
          return;
        }

        void postBatch(fullLookupItems, "full")
          .then((fullResult) => {
            const unresolvedStateKeys = new Set(
              unresolvedItems.map((item) => item.stateKey)
            );
            const resolvedFullPrices: Record<string, number | null> = {};
            const resolvedFullCostPrices: Record<string, number | null> = {};

            for (const item of fullLookupItems) {
              const resolvedPrice = fullResult.prices[item.stateKey];
              if (
                typeof resolvedPrice === "number" &&
                Number.isFinite(resolvedPrice) &&
                resolvedPrice > 0
              ) {
                resolvedFullPrices[item.stateKey] = resolvedPrice;
              } else if (unresolvedStateKeys.has(item.stateKey)) {
                resolvedFullPrices[item.stateKey] = null;
              }

              const resolvedCostPrice = fullResult.costPrices[item.stateKey];
              if (
                typeof resolvedCostPrice === "number" &&
                Number.isFinite(resolvedCostPrice) &&
                resolvedCostPrice > 0
              ) {
                resolvedFullCostPrices[item.stateKey] = resolvedCostPrice;
              }
            }

            if (
              Object.keys(resolvedFullPrices).length > 0 ||
              Object.keys(resolvedFullCostPrices).length > 0
            ) {
              commitResolvedPrices(
                resolvedFullPrices,
                resolvedFullCostPrices,
                PRICE_REVALIDATE_AFTER_NULL_MS
              );
            }
          })
          .catch((error) => {
            if (isAbortLikeError(error)) return;
            if (unresolvedItems.length === 0) return;

            const fallbackNulls = Object.fromEntries(
              unresolvedItems.map((item) => [item.stateKey, null])
            ) as Record<string, null>;
            commitResolvedPrices(
              fallbackNulls,
              undefined,
              PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS
            );
          });

        if (unresolvedItems.length > 0) {
          const cooldownUntil = Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          for (const item of unresolvedItems) {
            priceRetryCooldownUntilRef.current[item.stateKey] = cooldownUntil;
          }
        }
      } catch (error) {
        if (!isAbortLikeError(error)) {
          const cooldownUntil = Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          for (const item of requestItems) {
            priceRetryCooldownUntilRef.current[item.stateKey] = cooldownUntil;
          }
        }
      } finally {
        releaseRequestItems();
      }
    },
    [includeCostPrices]
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

      const warmupItems = items.slice(0, VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE);
      if (warmupItems.length === 0) return;

      const prefetchedImageEntries: Record<string, string> = {};
      const requestItems: Product[] = [];

      for (const item of warmupItems) {
        const key = buildProductImageBatchKey(item.code, item.article);
        if (!key) continue;

        const prefetchedSrc = options?.prefetchedImages?.[key];
        if (prefetchedSrc) {
          prefetchedImageEntries[key] = prefetchedSrc;
          continue;
        }

        if (item.hasPhoto === false) {
          pageImageMissingRef.current = {
            ...pageImageMissingRef.current,
            [key]: true,
          };
          setPageImageMissing((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
          continue;
        }

        if (pageImagesRef.current[key]) continue;
        if (pageImagePendingRef.current[key]) continue;
        if (pageImageMissingRef.current[key]) continue;
        if (imageBatchAttemptKeysRef.current.has(key)) continue;

        requestItems.push(item);
      }

      if (Object.keys(prefetchedImageEntries).length > 0) {
        pageImagesRef.current = {
          ...pageImagesRef.current,
          ...prefetchedImageEntries,
        };
        setPageImages((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const [key, src] of Object.entries(prefetchedImageEntries)) {
            if (next[key]) continue;
            next[key] = src;
            didChange = true;
          }
          return didChange ? next : prev;
        });
      }

      const warmImageRoute = (item: Product, srcOverride?: string) => {
        if (options?.signal?.aborted) return;
        if (item.hasPhoto === false) return;

        const key = buildProductImageBatchKey(item.code, item.article);
        if (!key) return;
        if (pageImageMissingRef.current[key]) return;
        if (imageWarmupKeysRef.current.has(key)) return;

        const src =
          srcOverride ||
          options?.prefetchedImages?.[key] ||
          pageImagesRef.current[key] ||
          buildProductImagePath(item.code, item.article, { catalog: true });
        if (!src) return;

        imageWarmupKeysRef.current.add(key);
        const img = new window.Image();
        img.decoding = "async";
        if ("fetchPriority" in img) {
          (img as HTMLImageElement & { fetchPriority?: "high" | "low" | "auto" }).fetchPriority =
            "low";
        }
        img.onload = () => {
          if (options?.signal?.aborted) return;
          pageImagesRef.current = pageImagesRef.current[key]
            ? pageImagesRef.current
            : { ...pageImagesRef.current, [key]: src };
          setPageImages((prev) => (prev[key] ? prev : { ...prev, [key]: src }));
        };
        img.onerror = () => {
          imageWarmupKeysRef.current.delete(key);
        };
        img.src = src;
      };

      for (const item of warmupItems) {
        const key = buildProductImageBatchKey(item.code, item.article);
        if (!key) continue;
        const src = prefetchedImageEntries[key] || pageImagesRef.current[key];
        if (src) warmImageRoute(item, src);
      }

      // Pre-warm only items explicitly flagged as having a photo so we don't
      // waste the browser's 6 concurrent connections on items with no image.
      // Items with unknown hasPhoto will be warmed after the batch API responds.
      for (const item of requestItems) {
        if (item.hasPhoto === true) warmImageRoute(item);
      }

      if (requestItems.length === 0) return;

      const pendingKeys = requestItems
        .map((item) => buildProductImageBatchKey(item.code, item.article))
        .filter(Boolean);
      if (pendingKeys.length > 0) {
        for (const key of pendingKeys) {
          imageBatchAttemptKeysRef.current.add(key);
        }

        pageImagePendingRef.current = {
          ...pageImagePendingRef.current,
          ...Object.fromEntries(pendingKeys.map((key) => [key, true])),
        };
        setPageImagePending((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const key of pendingKeys) {
            if (next[key]) continue;
            next[key] = true;
            didChange = true;
          }
          return didChange ? next : prev;
        });
      }

      const clearPendingKeys = () => {
        if (pendingKeys.length === 0) return;

        pageImagePendingRef.current = { ...pageImagePendingRef.current };
        for (const key of pendingKeys) {
          delete pageImagePendingRef.current[key];
        }

        setPageImagePending((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const key of pendingKeys) {
            if (!next[key]) continue;
            delete next[key];
            didChange = true;
          }
          return didChange ? next : prev;
        });
      };

      const applyReadyImageEntries = (
        readyEntries: Array<{ key: string; src?: string }>
      ) => {
        const validEntries = readyEntries.filter((item) => item.src);
        if (validEntries.length === 0) return;

        setPageImages((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const item of validEntries) {
            if (!item.src || next[item.key]) continue;
            next[item.key] = item.src;
            didChange = true;
          }
          if (didChange) {
            pageImagesRef.current = next;
          }
          return didChange ? next : prev;
        });

        pageImageMissingRef.current = { ...pageImageMissingRef.current };
        for (const item of validEntries) {
          delete pageImageMissingRef.current[item.key];
        }
        setPageImageMissing((prev) => {
          let didChange = false;
          const next = { ...prev };
          for (const item of validEntries) {
            if (!next[item.key]) continue;
            delete next[item.key];
            didChange = true;
          }
          return didChange ? next : prev;
        });
      };

      void primeCatalogImageBatch(requestItems, {
        deep: false,
        signal: options?.signal,
      })
        .then((results) => {
          if (options?.signal?.aborted) return;

          const readyEntries = results.filter(
            (item) => item.status === "ready" && item.src
          );
          applyReadyImageEntries(readyEntries);

          const resultsByKey = new Map(results.map((item) => [item.key, item]));
          const recoveryItems = requestItems
            .filter((item) => {
              if (item.hasPhoto === false) return false;
              const key = buildProductImageBatchKey(item.code, item.article);
              if (!key || pageImagesRef.current[key]) return false;
              const result = resultsByKey.get(key);
              return !result || result.status !== "ready";
            })
            .slice(0, VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE);

          if (recoveryItems.length > 0) {
            void primeCatalogImageBatch(recoveryItems, {
              deep: true,
              signal: options?.signal,
            })
              .then((deepResults) => {
                if (options?.signal?.aborted) return;

                const deepReadyEntries = deepResults.filter(
                  (item) => item.status === "ready" && item.src
                );
                applyReadyImageEntries(deepReadyEntries);

                const deepReadyByKey = new Map(
                  deepReadyEntries.map((item) => [item.key, item.src as string])
                );
                for (const item of recoveryItems) {
                  const key = buildProductImageBatchKey(item.code, item.article);
                  warmImageRoute(item, key ? deepReadyByKey.get(key) : undefined);
                }
              })
              .catch((error) => {
                if (isAbortLikeError(error)) return;
                for (const item of recoveryItems.slice(0, IMAGE_PRIORITY_ITEMS_COUNT)) {
                  warmImageRoute(item);
                }
              });
          }

          const readyByKey = new Map(
            readyEntries.map((item) => [item.key, item.src as string])
          );
          for (const item of requestItems) {
            const key = buildProductImageBatchKey(item.code, item.article);
            warmImageRoute(item, key ? readyByKey.get(key) : undefined);
          }
        })
        .catch((error) => {
          if (isAbortLikeError(error)) return;
          for (const item of requestItems.slice(0, IMAGE_PRIORITY_ITEMS_COUNT)) {
            warmImageRoute(item);
          }
        })
        .finally(() => {
          clearPendingKeys();
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

    const timeoutId =
      typeof window !== "undefined"
        ? window.setTimeout(() => {
            void loadEuroRate();
          }, 220)
        : null;

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
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
        cursor: normalizeCacheString(cursor),
        cursorField: normalizeCacheString(cursorField),
        q: normalizeCacheString(trimmed),
        filter: searchFilter || "all",
        cars: normalizeCacheList(selectedCars),
        cats: normalizeCacheList(effectiveSelectedCategories),
        group: normalizeOptionalCacheString(groupFromURL),
        subcat: normalizeOptionalCacheString(subcategoryFromURL),
        producer: normalizeOptionalCacheString(producerFromURL),
        hierarchy: expandHierarchyFromURL,
        sort: effectiveServerSortOrder || "none",
        pricedOnly,
        priceFrom,
        priceTo,
        inStock,
      }),
    [
      searchFilter,
      selectedCars,
      effectiveSelectedCategories,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      expandHierarchyFromURL,
      effectiveServerSortOrder,
      pricedOnly,
      priceFrom,
      priceTo,
      inStock,
    ]
  );

  const fetchCatalogPagePayload = useCallback(
    async (
      pageNum: number,
      signal?: AbortSignal,
      cursor = "",
      cursorField = ""
    ) => {
      const requestPage = pageNum;
      const requestLimit = ITEMS_PER_PAGE;
      const requestCursor = cursor;
      const requestCursorField = cursorField;

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
            expandHierarchy: expandHierarchyFromURL,
            sortOrder: effectiveServerSortOrder,
            pricedOnly,
            priceFrom,
            priceTo,
            inStock,
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
          totalCount?: number | null;
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
          hasMore: normalizePageHasMore(raw?.hasMore, itemsArray.length, requestLimit),
          nextCursor: normalizePageCursor(raw?.nextCursor),
          cursorField:
            typeof raw?.cursorField === "string" && raw.cursorField.trim()
              ? raw.cursorField.trim()
              : undefined,
          totalCount:
            typeof raw?.totalCount === "number" && Number.isFinite(raw.totalCount)
              ? Math.max(0, Math.floor(raw.totalCount))
              : null,
          serviceUnavailable: raw?.serviceUnavailable === true,
          message:
            typeof raw?.message === "string" && raw.message.trim()
              ? raw.message.trim()
              : undefined,
        } satisfies CatalogPagePayload;
      })();

      inFlightPageRequests.set(cacheKey, requestPromise);
      requestPromise
        .then((payload) => {
          // Cache result even if the caller's signal already fired — the fetch
          // completed and the data is valid for future requests with this key.
          const ttl =
            pageNum === 1
              ? MEMORY_CACHE_TTL_MS_FIRST_PAGE
              : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
          writePageToMemory(cacheKey, payload, ttl);
          if (payload.items.length > 0) {
            writePageToSession(cacheKey, payload, ttl);
          }
        })
        .catch(swallowAbortError)
        .finally(() => {
          inFlightPageRequests.delete(cacheKey);
        });
      return await awaitWithAbortSignal(requestPromise, signal);
    },
    [
      buildCacheKey,
      effectiveSelectedCategories,
      expandHierarchyFromURL,
      groupFromURL,
      normalizedSearch,
      producerFromURL,
      searchFilter,
      selectedCars,
      effectiveServerSortOrder,
      subcategoryFromURL,
      pricedOnly,
      priceFrom,
      priceTo,
      inStock,
    ]
  );

  const revalidateCachedPagePayload = useCallback(
    (options: {
      pageNum: number;
      cacheKey: string;
      cursor?: string;
      cursorField?: string;
      querySignatureSnapshot: string;
      ttlMs: number;
    }) => {
      const controller = new AbortController();
      const cancelSchedule = scheduleCatalogBackgroundTask(() => {
        void fetchCatalogPagePayload(
          options.pageNum,
          controller.signal,
          options.cursor ?? "",
          options.cursorField ?? ""
        )
          .then((payload) => {
            if (
              activeQuerySignatureRef.current !== options.querySignatureSnapshot ||
              payload.items.length === 0
            ) {
              return;
            }

            writePageToMemory(options.cacheKey, payload, options.ttlMs);
            writePageToSession(options.cacheKey, payload, options.ttlMs);
            applyResolvedPagePrices(payload.items, payload.prices);
          })
          .catch(swallowAbortError);
      });

      return () => {
        cancelSchedule();
        abortControllerSafely(controller);
      };
    },
    [
      applyResolvedPagePrices,
      fetchCatalogPagePayload,
      scheduleCatalogBackgroundTask,
    ]
  );

  // reset при зміні фільтрів / пошуку
  useEffect(() => {
    activeQuerySignatureRef.current = querySignature;
    firstPageReadySignatureRef.current = null;
    pagingRequestedRef.current = false;
    duplicatePageStreakRef.current = 0;
    cursorDuplicateStreakRef.current = 0;
    lastNextPageRequestAtRef.current = 0;
    nextCursorByPageRef.current = { 1: "" };
    nextCursorFieldByPageRef.current = { 1: "" };
    priceLoadingKeysRef.current.clear();
    priceRetryCooldownUntilRef.current = {};
    setPage(1);
    setHasMore(true);
    setHasLoadedOnce(false);
    setFirstPageResolvedItemCount(0);
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
        writePageToSession(
          cacheKey,
          initialPagePayload,
          MEMORY_CACHE_TTL_MS_FIRST_PAGE
        );
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
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(swallowAbortError);
          // Не обмежуємо prefetch для першої сторінки, images вже є
          // fetchCatalogPageImages(memoryHit.items, { ... });
        });
        dataRef.current = nextItems;
        setData(nextItems);
        setFirstPageResolvedItemCount(memoryHit.items.length);
        setCatalogTotalCount(memoryHit.totalCount ?? null);
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
        const cancelRevalidate = revalidateCachedPagePayload({
          pageNum: 1,
          cacheKey,
          querySignatureSnapshot: querySignature,
          ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
        });
        return () => {
          cancelWarmup();
          cancelRevalidate();
        };
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
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(swallowAbortError);
          // Не обмежуємо prefetch для першої сторінки, images вже є
          // fetchCatalogPageImages(sessionHit.items, { ... });
        });
        dataRef.current = nextItems;
        setData(nextItems);
        setFirstPageResolvedItemCount(sessionHit.items.length);
        setCatalogTotalCount(sessionHit.totalCount ?? null);
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
        const cancelRevalidate = revalidateCachedPagePayload({
          pageNum: 1,
          cacheKey,
          querySignatureSnapshot: querySignature,
          ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
        });
        return () => {
          cancelWarmup();
          cancelRevalidate();
        };
      }

      // No immediate cache hit for this filter/query, so clear stale products first.
      dataRef.current = [];
      setData([]);
      setCatalogTotalCount(null);
      setLoading(true);
      setFilterLoading(true);
      return;
    }

    dataRef.current = [];
    setData([]);
    setCatalogTotalCount(null);
    setLoading(true);
    setFilterLoading(true);
    // Без cache показуємо чистий стан, щоб не змішувати товари старого та нового фільтра.
  }, [
    applyResolvedPagePrices,
    fetchCatalogPagePrices,
    fetchCatalogPageImages,
    shouldAllowCatalogDirectPriceLookup,
    querySignature,
    initialPagePayload,
    initialQuerySignature,
    normalizedSearch,
    buildCacheKey,
    hideNextPageLoader,
    revalidateCachedPagePayload,
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
      const previousStableKeySet = new Set(
        previousData.map((item) => getProductStableListKey(item))
      );
      const nextData =
        page === 1
          ? uniqueIncoming
          : mergeUniqueProducts(previousData, uniqueIncoming);
      const appendedItems =
        page === 1
          ? uniqueIncoming
          : uniqueIncoming.filter(
              (item) => !previousStableKeySet.has(getProductStableListKey(item))
            );
      const itemsForIncrementalWarmup = appendedItems.length > 0 ? appendedItems : items;
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
      if (page === 1) {
        setFirstPageResolvedItemCount(items.length);
        setCatalogTotalCount(
          typeof payload.totalCount === "number" && Number.isFinite(payload.totalCount)
            ? payload.totalCount
            : null
        );
      }
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
      const requestedPageItemCount =
        sortOrder !== "none" && page > 1 ? ITEMS_PER_PAGE * page : ITEMS_PER_PAGE;
      const payloadHasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : items.length >= requestedPageItemCount;
      const isDuplicatePageChunk =
        page > 1 &&
        items.length > 0 &&
        !pageIntroducedNewItems &&
        !payload.nextCursor;

      // Cursor mode: same items returned repeatedly despite a non-empty cursor means the
      // backend cursor is broken (e.g. 1C ignoring ПосляКода with inStock filter).
      const isCursorDuplicate =
        page > 1 &&
        items.length > 0 &&
        !pageIntroducedNewItems &&
        Boolean(payload.nextCursor) &&
        sortOrder === "none";

      // Price-sorted pages can legally overlap when backend has no stable cursor.
      // Do not stop infinite scroll on duplicate chunks in this mode.
      const isCursorlessSortedMode =
        sortOrder !== "none" && !payload.nextCursor;

      if (isDuplicatePageChunk && !isCursorlessSortedMode) {
        duplicatePageStreakRef.current += 1;
      } else {
        duplicatePageStreakRef.current = 0;
      }

      if (isCursorDuplicate) {
        cursorDuplicateStreakRef.current += 1;
      } else {
        cursorDuplicateStreakRef.current = 0;
      }

      // Some backend pages can overlap; stop only after a long duplicate streak.
      const shouldStopPaginationOnDuplicatePage =
        (!isCursorlessSortedMode && !payload.nextCursor && duplicatePageStreakRef.current >= 6) ||
        cursorDuplicateStreakRef.current >= 3;

      setHasMore(
        shouldStopPaginationOnDuplicatePage ? false : payloadHasMore
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
      applyResolvedPagePrices(itemsForIncrementalWarmup, payload.prices);
      void fetchCatalogPagePrices(itemsForIncrementalWarmup, {
        prefetchedPrices: payload.prices,
        cacheKey,
        ttlMs: ttl,
        querySignatureSnapshot: currentQuerySignature,
        signal: controller.signal,
        allowFullLookup: shouldAllowCatalogDirectPriceLookup,
      }).catch(swallowAbortError);
      fetchCatalogPageImages(itemsForIncrementalWarmup, {
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
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      applyCachedItems(memoryHit);
      const cancelRevalidate = revalidateCachedPagePayload({
        pageNum: page,
        cacheKey,
        cursor: requestCursor,
        cursorField: requestCursorField,
        querySignatureSnapshot: currentQuerySignature,
        ttlMs: ttl,
      });
      return () => {
        cancelled = true;
        cancelRevalidate();
        cancelPageWarmup();
      };
    }

    const sessionHit = readPageFromSession(cacheKey);
    if (sessionHit && sessionHit.items.length > 0) {
      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, sessionHit, ttl);
      applyCachedItems(sessionHit);
      const cancelRevalidate = revalidateCachedPagePayload({
        pageNum: page,
        cacheKey,
        cursor: requestCursor,
        cursorField: requestCursorField,
        querySignatureSnapshot: currentQuerySignature,
        ttlMs: ttl,
      });
      return () => {
        cancelled = true;
        cancelRevalidate();
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
        if (cancelled) {
          pagingRequestedRef.current = false;
          hideNextPageLoader(true);
          return;
        }
        if (isAbortLikeError(err)) {
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

      if (cancelled) {
        pagingRequestedRef.current = false;
        hideNextPageLoader(true);
        return;
      }
      applyCachedItems(payload);

      const ttl =
        page === 1 ? MEMORY_CACHE_TTL_MS_FIRST_PAGE : MEMORY_CACHE_TTL_MS_NEXT_PAGES;
      writePageToMemory(cacheKey, payload, ttl);
      if (payload.items.length > 0) {
        writePageToSession(cacheKey, payload, ttl);
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
    revalidateCachedPagePayload,
    shouldAllowCatalogDirectPriceLookup,
    sortOrder,
  ]);

  useEffect(() => {
    if (loading || !hasMore || safeData.length === 0) return;

    const prefetchDepth = BACKGROUND_PAGE_PREFETCH_DEPTH;
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
          applyResolvedPagePrices(memoryHit.items, memoryHit.prices);
          void fetchCatalogPagePrices(memoryHit.items, {
            prefetchedPrices: memoryHit.prices,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(swallowAbortError);
          fetchCatalogPageImages(memoryHit.items, {
            prefetchedImages: memoryHit.images,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
          if (canUseCursorPagination && memoryHit.nextCursor) {
            nextCursorByPageRef.current[targetPage + 1] = memoryHit.nextCursor;
            nextCursorFieldByPageRef.current[targetPage + 1] =
              memoryHit.cursorField || "";
            upcomingCursor = memoryHit.nextCursor;
            upcomingCursorField = memoryHit.cursorField || "";
          }
          if (memoryHit.items.length === 0) return;
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
          writePageToSession(targetCacheKey, payload, ttl);
          applyResolvedPagePrices(payload.items, payload.prices);
          void fetchCatalogPagePrices(payload.items, {
            prefetchedPrices: payload.prices,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(swallowAbortError);
          fetchCatalogPageImages(payload.items, {
            prefetchedImages: payload.images,
            cacheKey: targetCacheKey,
            ttlMs: ttl,
            querySignatureSnapshot: querySignature,
            signal: controller.signal,
          });
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
        } catch {
          return;
        }
      }
    };

    const timerId = window.setTimeout(() => {
      void prefetchUpcomingPages().catch(swallowAbortError);
    }, BACKGROUND_PAGE_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      abortControllerSafely(controller);
    };
  }, [
    applyResolvedPagePrices,
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
    shouldAllowCatalogDirectPriceLookup,
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

        const inlinePrice =
          typeof item.priceEuro === "number" &&
          Number.isFinite(item.priceEuro) &&
          item.priceEuro > 0
            ? item.priceEuro
            : null;

        if (inlinePrice == null) {
          continue;
        }

        if (next[stateKey] !== inlinePrice) {
          next[stateKey] = inlinePrice;
          didChange = true;
        }
      }

      pricesRef.current = didChange ? next : prev;
      return didChange ? next : prev;
    });

    if (typeof window === "undefined") return;

    for (const item of safeData) {
      const stateKey = getProductPriceStateKey(item);
      const inlinePrice =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      if (inlinePrice == null) continue;

      if (stateKey) {
        writeCachedPriceEntry(stateKey, inlinePrice);
      }
      const lookupKeys = getProductPriceLookupKeys(item);
      for (const lookupKey of lookupKeys) {
        writeCachedPriceEntry(lookupKey, inlinePrice);
      }
    }
  }, [safeData, shouldAllowCatalogDirectPriceLookup]);

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
      uniqueData.map((item) => {
        const articleLower = (item.article || "").toLowerCase();
        const nameLower = (item.name || "").toLowerCase();
        return {
          item,
          codeLower: (item.code || "").toLowerCase(),
          articleLower,
          nameLower,
          nameNormalized: normalizeArticleToken(nameLower),
          producerLower: (item.producer || "").toLowerCase(),
          descriptionLower: (item.description || "").toLowerCase(),
        };
      }),
    [uniqueData]
  );

  // --- Р›РѕРєР°Р»СЊРЅРёР№ С„С–Р»СЊС‚СЂ ---
  const filteredData = useMemo(() => {
    const q = normalizedSearchLower;
    const qNormalized = normalizeArticleToken(q);
    const selectedCategorySet =
      effectiveSelectedCategories.length > 0
        ? new Set(
            effectiveSelectedCategories
              .map((value) => normalizeFilterToken(value))
              .filter(Boolean)
          )
        : null;
    const producerQuery = normalizeFilterToken(producerFromURL);

    return searchableUniqueData
      .filter(({ item, codeLower, articleLower, nameLower, nameNormalized, producerLower, descriptionLower }) => {
        const producerMatch = !producerQuery || producerLower.includes(producerQuery);
        const isDescriptionSearch = searchFilter === "description" && q.length > 0;

        const match =
          searchFilter === "article"
            ? (qNormalized ? nameNormalized.includes(qNormalized) : nameLower.includes(q))
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
                    producerLower.includes(q) ||
                    descriptionLower.includes(q);

        const catMatch =
          selectedCategorySet == null ||
          selectedCategorySet.has(normalizeFilterToken(item.subGroup)) ||
          selectedCategorySet.has(normalizeFilterToken(item.group)) ||
          selectedCategorySet.has(normalizeFilterToken(item.category));

        if (!(isDescriptionSearch || match) || !catMatch || !producerMatch) return false;

        return true;
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

      const euro = getResolvedProductPriceEuro(item, prices);
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

  const prefetchVisibleCatalogPrices = useCallback(
    (items: Product[]) => {
      if (items.length === 0) return;

      void fetchCatalogPagePrices(items, {
        prefetchedPrices: pricesRef.current,
        querySignatureSnapshot: activeQuerySignatureRef.current,
        allowFullLookup: shouldAllowCatalogDirectPriceLookup,
      }).catch(swallowAbortError);
    },
    [fetchCatalogPagePrices, shouldAllowCatalogDirectPriceLookup]
  );

  const prevIncludeCostPricesRef = useRef(includeCostPrices);
  useEffect(() => {
    const justBecameTrue = includeCostPrices && !prevIncludeCostPricesRef.current;
    prevIncludeCostPricesRef.current = includeCostPrices;
    if (!justBecameTrue || dataRef.current.length === 0) return;
    void fetchCatalogPagePrices(dataRef.current, {
      prefetchedPrices: {},
      querySignatureSnapshot: activeQuerySignatureRef.current,
      allowFullLookup: true,
    }).catch(swallowAbortError);
  }, [includeCostPrices, fetchCatalogPagePrices]);

  // When new items are appended while admin, retry cost prices after a delay in case the
  // initial targeted 1C lookup timed out. The route cache uses a 20s short-TTL on null
  // cost-price results, so this 25s retry lands on a fresh response.
  const prevCostPriceDataLengthRef = useRef(0);
  useEffect(() => {
    const prevLen = prevCostPriceDataLengthRef.current;
    prevCostPriceDataLengthRef.current = data.length;
    if (!includeCostPrices || data.length <= prevLen) return;
    const timerId = window.setTimeout(() => {
      const needsFetch = dataRef.current.filter((item) => {
        const stateKey = getProductPriceStateKey(item);
        return (
          stateKey &&
          !Object.prototype.hasOwnProperty.call(costPricesRef.current, stateKey)
        );
      });
      if (needsFetch.length === 0) return;
      void fetchCatalogPagePrices(needsFetch, {
        prefetchedPrices: {},
        querySignatureSnapshot: activeQuerySignatureRef.current,
        allowFullLookup: true,
      }).catch(swallowAbortError);
    }, 25000);
    return () => window.clearTimeout(timerId);
  }, [data.length, includeCostPrices, fetchCatalogPagePrices]);

  // Periodically retry prices that were committed as null (typically due to a timeout).
  // Without this, items with null prices stay null until the user triggers a new fetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const retryIntervalMs = PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS + 2000;
    const timerId = window.setInterval(() => {
      const nowTs = Date.now();
      const staleNulls = dataRef.current.filter((item) => {
        const stateKey = getProductPriceStateKey(item);
        if (!stateKey) return false;
        if (pricesRef.current[stateKey] !== null) return false;
        const cooldown = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
        return cooldown <= nowTs;
      });
      if (staleNulls.length === 0) return;
      void fetchCatalogPagePrices(staleNulls, {
        prefetchedPrices: {},
        querySignatureSnapshot: activeQuerySignatureRef.current,
        allowFullLookup: shouldAllowCatalogDirectPriceLookup,
      }).catch(swallowAbortError);
    }, retryIntervalMs);
    return () => window.clearInterval(timerId);
  }, [fetchCatalogPagePrices, shouldAllowCatalogDirectPriceLookup]);

  const updateCatalogItemPrice = useCallback(
    (payload: {
      code?: string;
      Код?: string;
      priceEuro?: number;
      costPriceEuro?: number;
      ЦінаПрод?: number;
      ЦінаЗакуп?: number;
    }) => {
      const payloadCode = normalizePriceKey(payload.Код || payload.code);
      if (!payloadCode) return;

      const nextPrice =
        payload.ЦінаПрод !== undefined
          ? Number(payload.ЦінаПрод)
          : payload.priceEuro !== undefined
            ? Number(payload.priceEuro)
            : undefined;
      const nextCostPrice =
        payload.ЦінаЗакуп !== undefined
          ? Number(payload.ЦінаЗакуп)
          : payload.costPriceEuro !== undefined
            ? Number(payload.costPriceEuro)
            : undefined;
      const hasPrice =
        (typeof nextPrice === "number" && Number.isFinite(nextPrice) && nextPrice > 0) ||
        (typeof nextCostPrice === "number" && Number.isFinite(nextCostPrice) && nextCostPrice > 0);

      setData((prev) =>
        prev.map((item) => {
          const keys = getProductPriceLookupKeys(item);
          if (!keys.includes(payloadCode)) return item;

          return {
            ...item,
            priceEuro:
              typeof nextPrice === "number" && Number.isFinite(nextPrice)
                ? nextPrice > 0
                  ? nextPrice
                  : null
                : item.priceEuro,
            costPriceEuro:
              typeof nextCostPrice === "number" && Number.isFinite(nextCostPrice)
                ? nextCostPrice > 0
                  ? nextCostPrice
                  : undefined
                : item.costPriceEuro,
            hasPrice,
          };
        })
      );

      if (nextPrice !== undefined && Number.isFinite(nextPrice)) {
        setPrices((prev) => {
          const next = { ...prev, [payloadCode]: nextPrice > 0 ? nextPrice : null };
          pricesRef.current = next;
          return next;
        });
      }

      if (nextCostPrice !== undefined && Number.isFinite(nextCostPrice)) {
        setCostPrices((prev) => {
          const next = { ...prev, [payloadCode]: nextCostPrice > 0 ? nextCostPrice : null };
          costPricesRef.current = next;
          return next;
        });
      }
    },
    []
  );

  return {
    filteredData,
    quantities,
    prices,
    costPrices,
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
    prefetchVisibleCatalogPrices,
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
    isRefetching,
    hasLoadedOnce,
    firstPageResolvedItemCount,
    filterLoading,
    setFilterLoading,
    updateCatalogItemPrice,
    catalogTotalCount,
  };
}

// -----------------------------------------------------------
//                РћРЎРќРћР’РќРР™ РљРћРњРџРћРќР•РќРў DATA
// -----------------------------------------------------------
const Data: React.FC<DataProps> = ({
  selectedCars,
  selectedCategories,
  sortOrder,
  pricedOnly = false,
  priceFrom = null,
  priceTo = null,
  inStock = false,
  initialPagePayload = null,
  initialQuerySignature = null,
}) => {
  const searchParams = useSearchParams();
  const catalogGridRef = useRef<HTMLDivElement | null>(null);
  const currentSearchParams = searchParams ?? new URLSearchParams();

  const rawSearchQuery = currentSearchParams.get("search") || "";
  const searchFilter =
    (currentSearchParams.get("filter") as "all" | "article" | "name" | "code" | "producer" | "description") ||
    "all";

  const groupFromURL = currentSearchParams.get("group");
  const subcategoryFromURL = currentSearchParams.get("subcategory");
  const producerFromURL = (currentSearchParams.get("producer") || "").trim() || null;
  const expandHierarchyFromURL = currentSearchParams.get("scope") === "hierarchy";
  const lastFilterSignatureRef = useRef<string | null>(null);
  const lastStableSortedSignatureRef = useRef("");
  const selectedCarsRef = useRef(selectedCars);
  useEffect(() => { selectedCarsRef.current = selectedCars; }, [selectedCars]);
  const softTransitionStartedAtRef = useRef(0);
  const softTransitionHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastStableSortedData, setLastStableSortedData] = useState<Product[]>([]);
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

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      const uid = localStorage.getItem("user_id");
      if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
        setIsAdmin(true);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const handleAdminChange = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handleAdminChange);
    return () => window.removeEventListener("partson:adminStateChange", handleAdminChange);
  }, []);

  const getAdminToken = useCallback(async (): Promise<string | null> => {
    const snapshot = getFirebaseAuthSnapshot();
    if (!snapshot.user) return null;
    return (snapshot.user as { getIdToken: () => Promise<string> })
      .getIdToken()
      .catch(() => null);
  }, []);

  const {
    filteredData,
    quantities,
    prices,
    costPrices,
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
    prefetchVisibleCatalogPrices,
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
    isRefetching,
    hasLoadedOnce,
    firstPageResolvedItemCount,
    filterLoading,
    setFilterLoading,
    updateCatalogItemPrice,
    catalogTotalCount,
  } = useCatalogData({
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    expandHierarchyFromURL,
    sortOrder,
    pricedOnly,
    priceFrom,
    priceTo,
    inStock,
    includeCostPrices: isAdmin,
    initialPagePayload,
    initialQuerySignature,
  });

  const handleAdminEdit = useCallback(
    async (
      code: string,
      article: string,
      data: { description?: string; priceEuro?: number; costPriceEuro?: number; imageDataUrl?: string; imageName?: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      const token = await getAdminToken();
      if (!token) return { ok: false, error: "Не авторизовано" };

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      type AdminMutationResult = {
        ok: boolean;
        error?: string;
        details?: string;
        code?: string;
        Код?: string;
        priceEuro?: number;
        costPriceEuro?: number;
        ЦінаПрод?: number;
        ЦінаЗакуп?: number;
      };
      const normalizeAdminResult = (payload: AdminMutationResult): AdminMutationResult => ({
        ...payload,
        error: payload.ok
          ? payload.error
          : [payload.error, payload.details].filter(Boolean).join(": ") || "Помилка збереження",
      });

      const tasks: Array<Promise<AdminMutationResult>> = [];
      const priceArticle = article || code;

      if (data.description !== undefined) {
        // getinfo uses НомерПоКаталогу (= article), not internal Код
        tasks.push(
          fetch("/api/product-update-description", {
            method: "POST",
            headers,
            body: JSON.stringify({ article, description: data.description }),
          })
            .then((r) => r.json() as Promise<AdminMutationResult>)
            .then(normalizeAdminResult)
            .catch(() => ({ ok: false, error: "Помилка мережі (опис)" }))
        );
      }

      if (
        data.priceEuro !== undefined ||
        data.costPriceEuro !== undefined ||
        data.imageDataUrl
      ) {
        const productUpdateBody: Record<string, unknown> = {
          Код: priceArticle,
          НомерПоКаталогу: priceArticle,
          article: priceArticle,
          productCode: code,
        };
        if (data.priceEuro !== undefined) productUpdateBody["ЦінаПрод"] = data.priceEuro;
        if (data.costPriceEuro !== undefined) productUpdateBody["ЦінаЗакуп"] = data.costPriceEuro;
        if (data.imageDataUrl) {
          productUpdateBody.imageDataUrl = data.imageDataUrl;
          if (data.imageName) productUpdateBody.file_name = data.imageName;
        }
        tasks.push(
          fetch("/api/product-update", {
            method: "POST",
            headers,
            body: JSON.stringify(productUpdateBody),
          })
            .then((r) => r.json() as Promise<AdminMutationResult>)
            .then(normalizeAdminResult)
            .catch(() => ({ ok: false, error: "Помилка мережі (товар)" }))
        );
      }

      if (tasks.length === 0) return { ok: true };

      const results = await Promise.all(tasks);
      const failed = results.find((r) => !r.ok);
      const priceResult = results.find(
        (r) =>
          r.ok &&
          (r.ЦінаПрод !== undefined ||
            r.ЦінаЗакуп !== undefined ||
            r.priceEuro !== undefined ||
            r.costPriceEuro !== undefined)
      );
      if (priceResult) {
        updateCatalogItemPrice({
          code: priceResult.code || code,
          Код: priceResult.Код || priceArticle,
          ЦінаПрод: priceResult.ЦінаПрод,
          ЦінаЗакуп: priceResult.ЦінаЗакуп,
          priceEuro: priceResult.priceEuro,
          costPriceEuro: priceResult.costPriceEuro,
        });
      }
      return failed ?? { ok: true };
    },
    [getAdminToken, updateCatalogItemPrice]
  );

  const router = useRouter();
  // Зберігає оригінальний запит до будь-яких редіректів (для опису потрібен оригінал)
  const fallbackOriginalQueryRef = useRef<string>("");
  const articleFallbackAttemptedRef = useRef<string>("");
  const descFallbackAttemptedRef = useRef<string>("");

  // Триступеневий фолбек: назва → артикул → опис
  useEffect(() => {
    if (!hasLoadedOnce || loading || error) return;

    if (filteredData.length > 0 || firstPageResolvedItemCount > 0) {
      fallbackOriginalQueryRef.current = "";
      articleFallbackAttemptedRef.current = "";
      descFallbackAttemptedRef.current = "";
      return;
    }

    if (searchFilter !== "all" && searchFilter !== "name") return;

    const raw = rawSearchQuery.trim();
    if (raw.length < 3) return;

    // Рівень 2: артикул — тільки для однослівних запитів + зміна кирилиці на латиницю
    if (!raw.includes(" ") && articleFallbackAttemptedRef.current !== raw) {
      articleFallbackAttemptedRef.current = raw;
      const sanitized = normalizeArticleToken(raw.toLowerCase());
      if (sanitized && sanitized !== raw.toLowerCase() && sanitized.length >= 2) {
        if (!fallbackOriginalQueryRef.current) fallbackOriginalQueryRef.current = raw;
        const params = new URLSearchParams(currentSearchParams.toString());
        params.set("search", sanitized);
        params.set("filter", "name");
        router.replace(`/katalog?${params.toString()}`);
        return;
      }
    }

    // Рівень 3: опис — використати оригінальний запит (до артикульного редіректу)
    // Якщо поточний raw є sanitized-версією оригіналу — відновити оригінал
    const storedOriginal = fallbackOriginalQueryRef.current;
    const isSanitizedOfOriginal =
      storedOriginal.length > 0 &&
      normalizeArticleToken(storedOriginal.toLowerCase()) === raw.toLowerCase();
    const descQuery = isSanitizedOfOriginal ? storedOriginal : raw;

    if (descFallbackAttemptedRef.current !== descQuery) {
      descFallbackAttemptedRef.current = descQuery;
      const params = new URLSearchParams(currentSearchParams.toString());
      params.set("search", descQuery);
      params.set("filter", "description");
      router.replace(`/katalog?${params.toString()}`);
    }
  }, [hasLoadedOnce, loading, error, filteredData.length, firstPageResolvedItemCount, searchFilter, rawSearchQuery, currentSearchParams, router]);

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
        sortOrder,
        pricedOnly,
        priceFrom,
        priceTo,
        inStock,
      }),
    [
      rawSearchQuery,
      searchFilter,
      groupFromURL,
      subcategoryFromURL,
      producerFromURL,
      selectedCategories,
      selectedCars,
      sortOrder,
      pricedOnly,
      priceFrom,
      priceTo,
      inStock,
    ]
  );

  const sortedEntries = useMemo(() => {
    const entries = filteredData.map((item, index) => {
      const inlineEuro =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      const euro = inlineEuro ?? getResolvedProductPriceEuro(item, prices);
      return {
        item,
        index,
        code: item.code,
        stableKey: getProductStableListKey(item),
        priceKey: getProductPriceStateKey(item),
        priceUAH: toPriceUAH(euro, euroRate),
        priceResolved: hasResolvedProductPriceState(item, prices),
      };
    });

    const priceSortFn = (a: (typeof entries)[0], b: (typeof entries)[0]) => {
      // 0 = confirmed has price, 1 = price status unknown (batch not loaded), 2 = confirmed no price
      const priceGroup = (e: typeof a) => {
        if (e.priceUAH != null) return 0;
        return e.priceResolved ? 2 : 1;
      };
      const ag = priceGroup(a);
      const bg = priceGroup(b);
      if (ag !== bg) return ag - bg;
      if (a.priceUAH != null && b.priceUAH != null && a.priceUAH !== b.priceUAH) {
        return sortOrder === "desc" ? b.priceUAH - a.priceUAH : a.priceUAH - b.priceUAH;
      }
      return a.index - b.index;
    };

    // For "none" sort: preserve server order (1C already returns priced items first via
    // ORDER BY ЕстьЦена DESC). Sorting here would cause items to jump when new pages load.
    // For asc/desc: sort all accumulated items so the user sees a globally-sorted list.
    return sortOrder === "none" ? entries : [...entries].sort(priceSortFn);
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
    setLastStableSortedData(sortedData);
  }, [sortedData, sortedDataSignature]);
  const shouldKeepStableGrid =
    isLoadingNextPage &&
    lastStableSortedData.length > 0;
  const visibleSortedData =
    shouldKeepStableGrid && lastStableSortedData.length > 0
      ? lastStableSortedData
      : sortedData;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const win = window as Window & {
      __partsonCatalogVisibleCount?: number;
      __partsonCatalogVisibleSignature?: string;
      __partsonCatalogTotalCount?: number | null;
    };
    win.__partsonCatalogVisibleCount = visibleSortedData.length;
    win.__partsonCatalogVisibleSignature = filterSignature;
    win.__partsonCatalogTotalCount = catalogTotalCount;
    window.dispatchEvent(
      new CustomEvent("partson:catalog-visible-count", {
        detail: { count: visibleSortedData.length, signature: filterSignature },
      })
    );
    window.dispatchEvent(
      new CustomEvent("partson:catalog-filter-total-count", {
        detail: { count: catalogTotalCount, signature: filterSignature },
      })
    );
  }, [catalogTotalCount, filterSignature, visibleSortedData.length]);

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
        .filter((item) => item.hasPhoto !== false),
    [visibleSortedData]
  );
  const visibleCatalogPriceCandidates = useMemo(
    () =>
      visibleSortedData.filter((item) => {
        if (!getProductPriceStateKey(item)) return false;
        const priceUAH = getResolvedProductPriceUAH(item, prices, euroRate);
        if (priceUAH != null) return false;
        return !hasResolvedProductPriceState(item, prices);
      }),
    [visibleSortedData, prices, euroRate]
  );
  const hasPendingSortedPriceResolution = useMemo(() => {
    if (sortOrder === "none") return false;

    return filteredData.some((item) => {
      const priceUAH = getResolvedProductPriceUAH(item, prices, euroRate);
      if (priceUAH != null) return false;
      return !hasResolvedProductPriceState(item, prices);
    });
  }, [filteredData, prices, euroRate, sortOrder]);
  const shouldShowInitialSkeleton =
    (filterLoading || loading || hasPendingSortedPriceResolution) &&
    visibleSortedData.length === 0;
  const isEmptyState =
    hasLoadedOnce &&
    !shouldShowInitialSkeleton &&
    !loading &&
    !hasPendingSortedPriceResolution &&
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
  const shouldUseVirtualWindow = false;
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
  const shouldUseSoftTransition = filterLoading || isRefetching || isLoadingNextPage;
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
    if (visibleCatalogPriceCandidates.length === 0) return;

    prefetchVisibleCatalogPrices(
      visibleCatalogPriceCandidates.slice(0, VISIBLE_PRICE_PREFETCH_CHUNK_SIZE)
    );
  }, [prefetchVisibleCatalogPrices, visibleCatalogPriceCandidates]);

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

  // New catalog/filter states should start from the top of the result list.
  useEffect(() => {
    const previousFilterSignature = lastFilterSignatureRef.current;
    lastFilterSignatureRef.current = filterSignature;

    if (!previousFilterSignature || previousFilterSignature === filterSignature) {
      return;
    }
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [filterSignature]);

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
      const carLabel = selectedCarsRef.current.length > 0 ? selectedCarsRef.current.join(", ") : "";
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
      producerFromURL,
    ]
  );

  return (
    <>
      <div
        id="catalog-results"
        data-filter-autoclose="results"
        className="relative w-full px-3 pb-0 pt-0 sm:px-3.5 sm:pb-0 lg:px-4"
        aria-busy={loading || filterLoading || isLoadingNextPage}
      >
        {!loading && error && (
          <div className="text-center text-red-500 mb-4">{error}</div>
        )}

        {shouldShowCatalogGrid && (
          <div className="relative">
            <div
              ref={catalogGridRef}
              className={`${CATALOG_GRID_CLASS} ${
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
                const { item, stableKey } = entry;
                const priceUAH =
                  entry.priceUAH ?? getResolvedProductPriceUAH(item, prices, euroRate);
                if (!item?.code) return null;

                const code = item.code;
                const qty = quantities[code] ?? 1;
                const cartQty = cartMap[code] ?? 0;
                const absoluteIndex = effectiveVirtualWindowStartIndex + index;
                const hasResolvedPriceState = hasResolvedProductPriceState(item, prices);
                const isKnownNoPrice =
                  hasResolvedPriceState && getResolvedProductPriceEuro(item, prices) === null;
                const stateCostPriceEuro =
                  typeof item.costPriceEuro === "number" &&
                  Number.isFinite(item.costPriceEuro) &&
                  item.costPriceEuro > 0
                    ? item.costPriceEuro
                    : (() => {
                        const stateCost = costPrices[entry.priceKey];
                        if (
                          typeof stateCost === "number" &&
                          Number.isFinite(stateCost) &&
                          stateCost > 0
                        ) {
                          return stateCost;
                        }

                        for (const lookupKey of getProductPriceLookupKeys(item)) {
                          const lookupCost = costPrices[lookupKey];
                          if (
                            typeof lookupCost === "number" &&
                            Number.isFinite(lookupCost) &&
                            lookupCost > 0
                          ) {
                            return lookupCost;
                          }
                        }

                        return null;
                      })();

                const priceStatus =
                  priceUAH != null
                    ? "ready"
                    : isKnownNoPrice
                      ? "request"
                      : "loading";
                const shouldPrioritizeImage = absoluteIndex < IMAGE_PRIORITY_ITEMS_COUNT;
                const imageBatchKey = buildProductImageBatchKey(item.code, item.article);
                const prefetchedImageSrc =
                  (imageBatchKey ? pageImages[imageBatchKey] : null) ?? null;
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
                const shouldPrefetchProductRoute = absoluteIndex < 10;

                return (
                  <div
                    key={stableKey || `${code || "item"}-${index}`}
                    data-catalog-card="1"
                  >
                    <ProductCard
                      item={item}
                      productHref={productHref}
                      qty={qty}
                      cartQty={cartQty}
                      priceUAH={priceUAH}
                      costPriceUAH={isAdmin && stateCostPriceEuro != null ? Math.round(stateCostPriceEuro * euroRate) : null}
                      isAdmin={isAdmin}
                      onAdminEdit={isAdmin ? (data) => handleAdminEdit(code, item.article || code, data) : undefined}
                      priceStatus={priceStatus}
                      imageLoadingMode={shouldPrioritizeImage ? "eager" : "lazy"}
                      imageFetchPriority={shouldPrioritizeImage ? "high" : "auto"}
                      prefetchedImageSrc={prefetchedImageSrc}
                      batchImagePending={Boolean(imageBatchKey && pageImagePending[imageBatchKey])}
                      batchImageMissing={
                        !hasPhoto ||
                        Boolean(imageBatchKey && pageImageMissing[imageBatchKey])
                      }
                      batchImageOnly={Boolean(imageBatchKey && !shouldPrioritizeImage)}
                      isFlipped={flippedCard === code}
                      motionEnabled={shouldAnimateList}
                      prefetchProductRoute={shouldPrefetchProductRoute}
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
          <div className="col-span-full flex w-full justify-center pt-3" aria-live="polite">
            <button
              type="button"
              onClick={loadNextPage}
              disabled={loading || isLoadingNextPage}
              className="inline-flex min-h-11 w-full max-w-[360px] items-center justify-center gap-2 rounded-[16px] border border-sky-200 bg-[linear-gradient(135deg,#ffffff,#eef8ff)] px-5 py-2.5 text-sm font-black text-sky-800 shadow-[0_14px_30px_rgba(14,165,233,0.12)] transition hover:border-sky-300 hover:bg-[linear-gradient(135deg,#f8fcff,#e0f2fe)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:min-w-[260px]"
            >
              {isLoadingNextPage ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" />
                  Завантажую товари
                </>
              ) : (
                <>
                  <ChevronsDown size={17} strokeWidth={2.4} />
                  Більше товарів
                </>
              )}
            </button>
          </div>
        )}

        {showEmptyState && (
          <div className="col-span-full overflow-hidden rounded-[26px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.95)_48%,rgba(248,250,252,0.98))] shadow-[0_18px_46px_rgba(15,23,42,0.09)] ring-1 ring-white/90">
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-sky-100 bg-white text-sky-700 shadow-[0_12px_26px_rgba(14,165,233,0.14)]">
                  <Search size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">
                    Пошук у каталозі
                  </p>
                  <h2 className="mt-1 text-[1.15rem] font-black leading-tight text-slate-950 sm:text-[1.35rem]">
                    {rawSearchQuery.trim()
                      ? `Нічого не знайдено для «${rawSearchQuery.trim()}»`
                      : "Товари за цим фільтром не знайдені"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
                    Перевірте артикул або виробника, спробуйте коротший запит чи
                    надішліть заявку менеджеру для підбору за VIN.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-[11px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      Артикул без пробілів
                    </span>
                    <span className="rounded-[11px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      Перевірка бренду
                    </span>
                    <span className="rounded-[11px] border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      Підбір за VIN
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendRequest}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[15px] border border-sky-300/50 bg-[linear-gradient(135deg,#0284c7,#2563eb)] px-5 py-2.5 text-sm font-black text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 active:scale-[0.98]"
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
                                                          
