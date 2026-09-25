"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  startTransition,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  LayoutGrid,
  List,
  MessageCircle,
  SearchX,
} from "lucide-react";

import { useCart } from "app/context/CartContext";
import ImageModal from "app/components/ImageModal";
import ProductCard from "app/components/ProductCard";
import ProductListRow from "app/components/ProductListRow";
import CatalogLoaderCard from "app/components/CatalogLoaderCard";
import {
  CATALOG_PAGE_CACHE_VERSION,
  invalidateCatalogClientCache,
  type CatalogInvalidationDetail,
} from "app/lib/catalog-client-cache";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import { stripRomanNumeralsFromModel, stripTrailingChassisCode } from "app/lib/car-model-search";
import { fetchCatalogCount } from "app/lib/catalog-count-client";
import { primeCatalogImageBatch } from "app/lib/product-image-batch-client";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import { getAdminIdToken } from "app/lib/get-admin-token";
import { saveProductAdminFields } from "app/lib/product-admin-mutations";
import {
  pushAnalyticsEvent,
  pushEcommerceEvent,
  sanitizeAnalyticsSearchTerm,
} from "app/lib/gtm";

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
  initialTotalCount?: number | null;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
  pageBatchSize?: number;
  onPageBatchSizeChange?: (size: number) => void;
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
// Keep the client page boundary identical to the server-rendered catalog
// snapshot. A 12/16 mismatch made the first response and the next cursor refer
// to different windows, while also leaving the last SSR row to appear late.
const ITEMS_PER_PAGE = 16;
const CATALOG_PAGE_ROUTE = "/api/catalog-page";
const CATALOG_PRICE_BATCH_ROUTE = "/api/catalog-prices";
const PRICE_CACHE_PREFIX = "partson:v12:price:";
const PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
const PRICE_PERSISTED_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const PRICE_STALE_POSITIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PRICE_NEGATIVE_CACHE_TTL_MS = 1000 * 60;
const PRICE_REVALIDATE_AFTER_NULL_MS = 1000 * 30;
const PRICE_PAGE_BATCH_SIZE = ITEMS_PER_PAGE * 8;
const VISIBLE_PRICE_PREFETCH_CHUNK_SIZE = ITEMS_PER_PAGE * 2;
const PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS = 1000 * 12;
const MEMORY_CACHE_TTL_MS_FIRST_PAGE = 1000 * 60 * 4;
const MEMORY_CACHE_TTL_MS_NEXT_PAGES = 1000 * 60 * 4;
const PAGE_MEMORY_CACHE_MAX_ENTRIES = 48;
const PAGE_SESSION_CACHE_MAX_ENTRIES = 64;
const PAGE_SESSION_CACHE_INDEX_KEY = `${CATALOG_PAGE_CACHE_VERSION}:index`;
// Bumped from 1: with numbered pagination + jump-ahead now common (not just
// linear scrolling), prefetching 2 pages ahead keeps a plain "next" click
// instant across a wider range instead of only the very next page.
const BACKGROUND_PAGE_PREFETCH_DEPTH = 2;
const BACKGROUND_PAGE_PREFETCH_DELAY_MS = 220;
// Start only the actual LCP candidate at high priority. A small first row may
// still load eagerly, while the rest of the page is resolved by one batch.
const IMAGE_HIGH_PRIORITY_ITEMS_COUNT = 1;
const IMAGE_EAGER_ITEMS_COUNT = 4;
// List rows are much shorter than a grid card, so more of them sit in the
// first viewport — list view eager-loads this many up front instead of
// IMAGE_EAGER_ITEMS_COUNT. Every "how many images get to skip the shared
// batch and start their own request immediately" computation must use this
// per-viewMode count consistently, or the extra list rows it covers end up
// eager (rendered as if visible) but still gated behind the batch response,
// which is exactly what made list view's first portion of images slow.
const IMAGE_EAGER_ITEMS_COUNT_LIST = 12;
// Resolve the whole first page in one batch call. A smaller chunk here leaves
// most first-page cards "unqueued" long enough to trip ProductCardImage's
// deferDirectLoad fallback (see DEFERRED_DIRECT_LOAD_DELAY_MS), so instead of
// one shared batch request they each fire an individual direct image request
// in parallel — more concurrent requests and raggedy pop-in, not less.
const VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE = ITEMS_PER_PAGE;
const VISIBLE_IMAGE_DEEP_RECOVERY_CHUNK_SIZE = 4;
const VISIBLE_IMAGE_DEEP_RECOVERY_DELAY_MS = 60;
const NEXT_PAGE_LOADER_MIN_VISIBLE_MS = 40;
// Matches ProductCard's actual h-[360px]/sm:h-[340px] plus CATALOG_GRID_CLASS's
// gap-3/sm:gap-5/lg:gap-4 (372 below 640px, ~356-360 at sm/lg) — kept in sync
// with the non-virtualized fallback below (both feed virtualRowHeightPx) so
// crossing the VIRTUALIZATION_MIN_ITEMS threshold via "load more" doesn't
// swap from one guess to a different guess before the real ResizeObserver
// measurement lands a frame later — that mismatch was a visible row-jump.
const VIRTUAL_ROW_ESTIMATED_HEIGHT_PX = 358;
// Keep only a small, generous window mounted once the catalog grows beyond
// three API pages. This prevents images, card effects and React reconciliation
// for old pages from competing with the browser's scroll frame.
const VIRTUALIZATION_MIN_ITEMS = ITEMS_PER_PAGE * 3;
// Rows of cards kept mounted just outside the viewport on each side. The
// window only recomputes once per animation frame (see scheduleUpdate
// below), so on a fast fling/flick — real momentum scrolling can cross a
// 3-row buffer within a single frame on a tall grid — cards used to become
// visible before their row entered the mounted window, reading as a visible
// pop-in right at the viewport edge instead of already being there.
const VIRTUAL_OVERSCAN_ROWS = 5;
// Shift the mounted window in small row groups instead of reconciling the
// product grid every time a single row crosses the viewport boundary.
const VIRTUAL_WINDOW_STEP_ROWS = 2;
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
  "\u0415\u0441\u0442\u044c\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435",
  "\u0404\u0417\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u043d\u044f",
  "\u0415\u0441\u0442\u044c\u041a\u0430\u0440\u0442\u0438\u043d\u043a\u0430",
  "\u0404\u041a\u0430\u0440\u0442\u0438\u043d\u043a\u0430",
  "hasPhoto",
  "HasPhoto",
  "has_photo",
  "hasImage",
  "HasImage",
  "has_image",
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
  prices: Record<string, number | null>,
  precomputedPriceKeys?: string[]
) => {
  const priceKeys =
    precomputedPriceKeys ??
    Array.from(
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
  prices: Record<string, number | null>,
  precomputedPriceKeys?: string[]
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

  const priceKeys =
    precomputedPriceKeys ??
    Array.from(
      new Set([getProductPriceStateKey(item), ...getProductPriceLookupKeys(item)].filter(Boolean))
    );

  return priceKeys.some((key) => Object.prototype.hasOwnProperty.call(prices, key));
};

type CatalogSortedEntry = {
  item: Product;
  index: number;
  code: string;
  stableKey: string;
  priceKey: string;
  priceUAH: number | null;
  priceResolved: boolean;
};

const getResolvedProductPriceUAH = (
  item: Pick<Product, "code" | "article" | "priceEuro">,
  prices: Record<string, number | null>,
  euroRate: number,
  precomputedPriceKeys?: string[]
) => {
  const resolvedEuro = getResolvedProductPriceEuro(item, prices, precomputedPriceKeys);
  return toPriceUAH(resolvedEuro, euroRate);
};

const getResolvedProductPromoPriceEuro = (
  item: Pick<Product, "code" | "article">,
  promoPrices: Record<string, number | null>,
  precomputedPriceKeys?: string[]
) => {
  const priceKeys =
    precomputedPriceKeys ??
    Array.from(
      new Set([getProductPriceStateKey(item), ...getProductPriceLookupKeys(item)].filter(Boolean))
    );

  for (const key of priceKeys) {
    const promoPrice = promoPrices[key];
    if (
      typeof promoPrice === "number" &&
      Number.isFinite(promoPrice) &&
      promoPrice > 0
    ) {
      return promoPrice;
    }
  }

  return null;
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

  const rawGroup = readFirstString(record, GROUP_FIELDS);
  const rawSubGroup = readFirstString(record, SUBGROUP_FIELDS);
  const rawCategory = readFirstString(record, CATEGORY_FIELDS);
  const shouldPromoteMissingCategory =
    !rawCategory &&
    rawGroup &&
    rawSubGroup &&
    rawGroup.toLocaleLowerCase("uk-UA") !== rawSubGroup.toLocaleLowerCase("uk-UA");
  const category = shouldPromoteMissingCategory ? rawGroup : rawCategory;
  const group = shouldPromoteMissingCategory ? rawSubGroup : rawGroup;
  const subGroup = shouldPromoteMissingCategory ? "" : rawSubGroup;
  const hasPhoto = readFirstBoolean(record, PHOTO_FIELDS, false);
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
  "mx-auto mt-1 grid w-full grid-cols-1 gap-3 sm:mt-2 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-4";
const CATALOG_LIST_CLASS = "mx-auto mt-1 grid w-full grid-cols-1 gap-2 sm:mt-2";

const CatalogTransitionLoader = ({
  label = "Оновлюю каталог",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) => {
  return (
    <div
      className={`col-span-full flex w-full items-start justify-center px-3 ${compact ? "min-h-20 py-2" : "min-h-[240px] py-8 sm:min-h-[300px] sm:py-12"}`}
      role="status"
      aria-label={label}
    >
      {compact ? (
        <div className="catalog-loader-card inline-flex min-w-[250px] items-center gap-3.5 rounded-[19px] border border-sky-100/90 bg-white/95 px-4 py-3.5 shadow-[0_16px_38px_rgba(14,165,233,0.12)] ring-1 ring-white/90">
          <span className="catalog-modern-loader" aria-hidden="true"><i /><b /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black leading-tight text-slate-700">{label}</span>
            <span className="catalog-loader-line mt-2 block" aria-hidden="true" />
          </span>
        </div>
      ) : (
        <CatalogLoaderCard label={label} />
      )}
    </div>
  );
};

type CatalogPagePayload = {
  items: Product[];
  prices?: Record<string, number | null>;
  images?: Record<string, string>;
  hasMore?: boolean;
  nextCursor?: string;
  cursorField?: string;
  totalCount?: number | null;
  correctedQuery?: string;
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
  promoPrices: Record<string, number | null>;
  // Public-safe: true when the item has an active partner promo at all,
  // known even in "fast" (anonymous) mode — never the discounted amount
  // itself, which stays in promoPrices, gated by isPartner.
  hasPromo: Record<string, boolean>;
  // Public-safe teaser: rounded discount percent, known even in "fast"
  // (anonymous) mode — see hasPromo's own comment above.
  promoPercent: Record<string, number | null>;
  isPartner: boolean;
  // True only when a protected ("partner"/"full") request actually carried a
  // Firebase ID token, i.e. the server had something to verify. Firebase auth
  // can still be mid-initialization (or a token refresh mid-flight) moments
  // after a page loads or a new batch of items scrolls into view — that
  // yields an unauthenticated request, which the server correctly answers
  // with isPartner: false. That's a "couldn't check this time" outcome, not
  // "confirmed not a partner", and callers must not treat it as the latter:
  // that exact conflation used to wipe every already-resolved promo price on
  // the page the moment one unrelated, unlucky batch raced the token.
  verified: boolean;
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

// Plain useLayoutEffect makes React warn during SSR ("does nothing on the
// server") even though nothing here needs to run before hydration — this
// swaps to a harmless useEffect there and only uses the real layout effect
// (needed to fold a same-tick hide+show into one paint, avoiding a visible
// flash) once running in the browser.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

const normalizeCacheList = (values: string[]) =>
  Array.from(
    new Set(values.map((value) => normalizeCacheString(value)).filter(Boolean))
  ).sort();

const buildPriceBatchRequestKey = (
  mode: "fast" | "partner" | "full",
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

// The 15s cap this used to carry was there for "freshness after an admin
// edit", but every edit path already does a blanket clearBrowserCatalogCache()
// (this whole pageCache.clear(), not a per-key delete — see below) — so this
// TTL only ever governs the case nothing edited anything, where a much
// longer cap costs nothing and cuts repeat network round trips (retype after
// a backspace, browser Back to a prior search) within the window.
const pageCacheTtl = (key: string, ttlMs: number) => {
  try { return JSON.parse(key).q ? Math.min(ttlMs, 60_000) : ttlMs; }
  catch { return ttlMs; }
};

const writePageToMemory = (key: string, payload: CatalogPagePayload, ttlMs: number) => {
  if (ttlMs <= 0 || payload.serviceUnavailable) return;
  const nowTs = now();
  pageCache.set(key, {
    payload: stripCostPriceFromPayload(payload),
    expiresAt: nowTs + pageCacheTtl(key, ttlMs),
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

// Clears the browser-side catalog page caches (in-memory + sessionStorage).
// Call this before router.refresh() after admin edits so Data.tsx re-fetches
// fresh data instead of serving stale cache entries.
export const clearBrowserCatalogCache = () => {
  pageCache.clear();
  if (typeof window === "undefined") return;
  try {
    for (const key of listSessionPageCacheKeys()) {
      window.sessionStorage.removeItem(key);
    }
    window.sessionStorage.removeItem(PAGE_SESSION_CACHE_INDEX_KEY);
  } catch {}
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
      correctedQuery: typeof record?.correctedQuery === "string" ? record.correctedQuery : undefined,
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
  if (typeof window === "undefined" || payload.serviceUnavailable) return;
  try {
    const nowTs = now();
    const expiresAt = nowTs + pageCacheTtl(key, ttlMs);
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
        correctedQuery: payload.correctedQuery,
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

const mergePageImagesIntoCache = (
  cacheKey: string,
  images: Record<string, string>,
  ttlMs: number
) => {
  if (!cacheKey || Object.keys(images).length === 0) return;

  const currentPayload = readPageFromMemory(cacheKey) ?? readPageFromSession(cacheKey);
  if (!currentPayload) return;

  const existingImages = currentPayload.images ?? {};
  const hasNew = Object.keys(images).some((key) => !existingImages[key]);
  if (!hasNew) return;

  const nextPayload: CatalogPagePayload = {
    ...currentPayload,
    images: { ...existingImages, ...images },
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
  promoOnly?: boolean;
  sortOrder: "none" | "asc" | "desc";
  pricedOnly?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  inStock?: boolean;
  includeCostPrices?: boolean;
  includePartnerPrices?: boolean;
  getAdminAuthToken?: () => Promise<string | null>;
  initialPagePayload?: CatalogPagePayload | null;
  initialQuerySignature?: string | null;
  initialTotalCount?: number | null;
  viewMode?: "grid" | "list";
  // Set true for the duration of a multi-page jump (Data's handleGoToPageClick
  // chaining several raw fetches to reach a distant page). Every page fetched
  // mid-chain is never actually shown — only the page the jump lands on is —
  // so firing a price/image batch request per intermediate raw fetch was pure
  // waste that also queued up behind the real, needed catalog-page requests
  // (browsers cap concurrent requests per origin), stalling the jump itself.
  // The already-existing visibleSortedData-driven prefetch effects pick up
  // the landing page's items once the jump finishes and displayedPage moves.
  suppressPagePrefetchRef?: { current: boolean };
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
    promoOnly = false,
    sortOrder,
    pricedOnly = false,
    priceFrom = null,
    priceTo = null,
    inStock = false,
    includeCostPrices = false,
    includePartnerPrices = false,
    getAdminAuthToken,
    initialPagePayload,
    initialQuerySignature,
    initialTotalCount = null,
    viewMode = "grid",
    suppressPagePrefetchRef,
  } = params;

  const { addToCart, cartItems, removeFromCart } = useCart();
  const normalizedSearch = useMemo(() => rawSearchQuery.trim(), [rawSearchQuery]);
  const hasUrlCategoryFilter = Boolean(groupFromURL || subcategoryFromURL);
  const effectiveSelectedCategories = useMemo(
    () => (hasUrlCategoryFilter ? [] : selectedCategories),
    [hasUrlCategoryFilter, selectedCategories]
  );
  const effectiveServerSortOrder = sortOrder;
  const canUseCursorPagination = selectedCars.length === 0;
  const shouldAllowCatalogDirectPriceLookup = true;
  // Paint the complete server-rendered first page on the initial client render.
  // Priming it only from the reset effect caused an avoidable empty/partial
  // frame before all cards from the first response became visible.
  const initialItems = initialPagePayload?.items ?? [];
  const hasInitialPage = initialItems.length > 0 && Boolean(initialQuerySignature);
  const [data, setData] = useState<Product[]>(initialItems);
  const [prices, setPrices] = useState<Record<string, number | null>>(
    initialPagePayload?.prices ?? {}
  );
  const [costPrices, setCostPrices] = useState<Record<string, number | null>>({});
  const [promoPrices, setPromoPrices] = useState<Record<string, number | null>>({});
  const [isPartner, setIsPartner] = useState(false);
  // Public-safe teaser: true when an item has an active partner promo at
  // all, known even to anonymous/non-partner visitors from the "fast" batch
  // response — never the discounted amount itself (that stays in
  // promoPrices, gated by isPartner).
  const [hasPromoAvailability, setHasPromoAvailability] = useState<Record<string, boolean>>({});
  // Public-safe teaser: the discount size, rounded to a whole percent, known
  // even to anonymous/non-partner visitors — never the discounted amount
  // itself (see hasPromoAvailability's own comment above).
  const [promoPercentByKey, setPromoPercentByKey] = useState<Record<string, number | null>>({});
  const [pageImages, setPageImages] = useState<Record<string, string>>(
    initialPagePayload?.images ?? {}
  );
  const [pageImagePending, setPageImagePending] = useState<Record<string, true>>({});
  const [pageImageMissing, setPageImageMissing] = useState<Record<string, true>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [euroRate, setEuroRate] = useState<number>(DEFAULT_EURO_RATE);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [directMode, setDirectMode] = useState(false);
  const [dataStartIndex, setDataStartIndex] = useState(0);
  const directRequestRef = useRef<AbortController | null>(null);
  const directUnsupportedUntilRef = useRef(0);
  const [pageRetryNonce, setPageRetryNonce] = useState(0);
  const failedPageRef = useRef(false);
  // Which already-fetched page of pageBatchSize items is on screen. Distinct
  // from `page`, which tracks the backend's forward-only cursor position —
  // this only slices data already sitting in memory, so paging backward
  // never re-fetches.
  const [displayedPage, setDisplayedPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    typeof initialPagePayload?.hasMore === "boolean" ? initialPagePayload.hasMore : true
  );
  const [loading, setLoading] = useState(!hasInitialPage);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasInitialPage);
  const [filterLoading, setFilterLoading] = useState(false);
  const [catalogReadyQuerySignature, setCatalogReadyQuerySignature] = useState(
    hasInitialPage ? initialQuerySignature ?? "" : ""
  );
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [firstPageResolvedItemCount, setFirstPageResolvedItemCount] = useState(
    initialItems.length
  );
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(initialPagePayload?.correctedQuery || null);
  const [catalogTotalCount, setCatalogTotalCount] = useState<number | null>(
    typeof initialTotalCount === "number" && initialTotalCount > 0 ? initialTotalCount : null
  );
  // Determines the display total from a first-page payload. The service is
  // only asked to compute the real total on page 1 (ВключатьОбщееКоличество
  // is sent true exactly when there's no cursor yet — see requestAllgoodsPage
  // in catalog-server.ts), so whatever totalCount comes back with that first
  // page is the genuine grand total and can be trusted directly, not just
  // when it happens to exceed this page's item count.
  const resolveFirstPageTotal = useCallback(
    (items: Product[], cachedTotal: number | null | undefined, hasMore: boolean | undefined): number | null => {
      const pageHasMore =
        typeof hasMore === "boolean" ? hasMore : items.length >= ITEMS_PER_PAGE;
      if (!pageHasMore) return items.length;
      if (typeof cachedTotal === "number" && Number.isFinite(cachedTotal) && cachedTotal >= 0) {
        return cachedTotal;
      }
      return initialTotalCount ?? null;
    },
    [initialTotalCount]
  );
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
        promoOnly,
        sortOrder: effectiveServerSortOrder,
        pricedOnly,
        priceFrom,
        priceTo,
        priceRate:
          priceFrom !== null || priceTo !== null ? euroRate : null,
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
      promoOnly,
      effectiveServerSortOrder,
      pricedOnly,
      priceFrom,
      priceTo,
      euroRate,
      inStock,
    ]
  );
  // Same signature with sortOrder pinned to "none" — used only to detect a
  // sort-only query change (everything else identical) in the reset effect
  // below, so it can keep already-rendered products on screen instead of
  // flashing the full skeleton while the re-sorted page 1 loads.
  const filtersSignatureExcludingSort = useMemo(
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
        promoOnly,
        sortOrder: "none",
        pricedOnly,
        priceFrom,
        priceTo,
        priceRate:
          priceFrom !== null || priceTo !== null ? euroRate : null,
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
      promoOnly,
      pricedOnly,
      priceFrom,
      priceTo,
      euroRate,
      inStock,
    ]
  );
  const prevFiltersSignatureExcludingSortRef = useRef(filtersSignatureExcludingSort);
  const isInitialResetRunRef = useRef(true);
  const activeQuerySignatureRef = useRef(querySignature);
  // Must start as "nothing primed yet" (null), not initialQuerySignature —
  // seeding it with the very value the guard below compares against made
  // `primedInitialPayloadSignatureRef.current !== querySignature` false on
  // the first run (initialQuerySignature !== initialQuerySignature), which
  // skipped priming the memory/session cache from the SSR payload
  // entirely. With nothing primed, the first render's memory/session
  // lookups both missed, so the code cleared the grid to empty and
  // fetched fresh from /api/catalog-page — throwing away content that was
  // already there and replacing it once that fetch resolved. Measured
  // live, that swap was the page's single largest layout shift (CLS
  // score ~0.80 on its own). The ref still does its real job afterward:
  // once set to querySignature post-priming, it correctly blocks
  // re-priming on subsequent runs with the same signature.
  const primedInitialPayloadSignatureRef = useRef<string | null>(null);
  const firstPageReadySignatureRef = useRef<string | null>(
    hasInitialPage ? initialQuerySignature ?? null : null
  );
  const pagingRequestedRef = useRef(false);
  // Debounce input: lets the fetch effect below tell "the search box changed"
  // apart from "a page/car/category click changed" without adding a second
  // effect — the latter should stay instant.
  const previousSearchTermRef = useRef("");
  const duplicatePageStreakRef = useRef(0);
  const cursorDuplicateStreakRef = useRef(0);
  const nextCursorByPageRef = useRef<Record<number, string>>({
    1: "",
    2: initialPagePayload?.nextCursor || "",
  });
  const nextCursorFieldByPageRef = useRef<Record<number, string>>({
    1: "",
    2: initialPagePayload?.cursorField || "",
  });
  const dataRef = useRef<Product[]>(initialItems);
  const pricesRef = useRef<Record<string, number | null>>(
    initialPagePayload?.prices ?? {}
  );
  const costPricesRef = useRef<Record<string, number | null>>({});
  const promoPricesRef = useRef<Record<string, number | null>>({});
  const hasPromoAvailabilityRef = useRef<Record<string, boolean>>({});
  const promoPercentByKeyRef = useRef<Record<string, number | null>>({});
  const pageImagesRef = useRef<Record<string, string>>(
    initialPagePayload?.images ?? {}
  );
  const pageImagePendingRef = useRef<Record<string, true>>({});
  const pageImageMissingRef = useRef<Record<string, true>>({});
  const pageImagePendingOwnerRef = useRef<Record<string, number>>({});
  const imageBatchRequestSequenceRef = useRef(0);
  const imageBatchAttemptKeysRef = useRef<Set<string>>(new Set());
  const priceLoadingKeysRef = useRef<Set<string>>(new Set());
  const priceRetryCooldownUntilRef = useRef<Record<string, number>>({});
  const nextPageLoaderShownAtRef = useRef(0);
  const nextPageLoaderHideTimerRef = useRef<number | null>(null);
  const prefetchNextPageTriggerRef = useRef<(() => void) | null>(null);

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
    promoPricesRef.current = promoPrices;
  }, [promoPrices]);

  useEffect(() => {
    hasPromoAvailabilityRef.current = hasPromoAvailability;
  }, [hasPromoAvailability]);

  useEffect(() => {
    promoPercentByKeyRef.current = promoPercentByKey;
  }, [promoPercentByKey]);

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

  const replacePageImages = useCallback((images?: Record<string, string>) => {
    const nextImages = images ?? {};
    pageImagesRef.current = nextImages;
    setPageImages(nextImages);
  }, []);

  const clearTransientPageImageState = useCallback(() => {
    pageImagePendingRef.current = {};
    pageImageMissingRef.current = {};
    pageImagePendingOwnerRef.current = {};
    imageBatchAttemptKeysRef.current.clear();
    setPageImagePending({});
    setPageImageMissing({});
  }, []);

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
        const needsPromoPrice =
          (includePartnerPrices &&
            !Object.prototype.hasOwnProperty.call(promoPricesRef.current, stateKey)) ||
          // The public "has a partner promo at all" teaser is independent of
          // login state and of whether the regular price is already known —
          // without this, an item whose price arrived inline (the common
          // case) never enters requestItems at all for an anonymous visitor,
          // so its "fast" batch (the only place hasPromo comes from for them)
          // never runs and the teaser badge never appears.
          !Object.prototype.hasOwnProperty.call(hasPromoAvailabilityRef.current, stateKey);
        // A signed-in user still needs the protected partner lookup even when
        // the regular public price was already embedded in the page.
        if (
          inlinePrice != null &&
          (!includeCostPrices || hasInlineCostPrice) &&
          !needsPromoPrice
        ) continue;

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
          if (!needsCostPrice && !needsPromoPrice) continue;
          // Has regular price but cost price not yet fetched — fall through
        } else if (prefetchedPrice === null) {
          immediateUpdates[stateKey] = null;
          priceRetryCooldownUntilRef.current[stateKey] =
            nowTs + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          if (!needsPromoPrice) continue;
        } else {
          const currentPrice = pricesRef.current[stateKey];
          if (
            typeof currentPrice === "number" &&
            Number.isFinite(currentPrice) &&
            currentPrice > 0
          ) {
            if (!needsCostPrice && !needsPromoPrice) continue;
            // Has regular price in state but cost price not yet fetched — fall through
          } else if (currentPrice === null) {
            // Null already committed — only retry if the cooldown has expired.
            const nullCooldown = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
            if (nullCooldown > nowTs && !needsPromoPrice) {
              continue;
            }
            // Cooldown elapsed: fall through to retry the price API.
            if (nullCooldown > 0) {
              delete priceRetryCooldownUntilRef.current[stateKey];
            }
          }
        }

        const cooldownUntil = priceRetryCooldownUntilRef.current[stateKey] ?? 0;
        if (cooldownUntil > nowTs && !needsPromoPrice) continue;
        if (cooldownUntil > 0) {
          delete priceRetryCooldownUntilRef.current[stateKey];
        }

        if (
          priceLoadingKeysRef.current.has(stateKey) &&
          !needsCostPrice &&
          !needsPromoPrice
        ) continue;

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
            if (!needsPromoPrice) continue;
          } else {
            delete priceRetryCooldownUntilRef.current[stateKey];
          }
          if (!needsCostPrice && !needsPromoPrice) continue;
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
        cooldownMs: number,
        resolvedPromoPrices?: Record<string, number | null>,
        resolvedPartnerStatus?: boolean
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

        if (resolvedPartnerStatus !== undefined) {
          setIsPartner(resolvedPartnerStatus);
          if (!resolvedPartnerStatus) {
            promoPricesRef.current = {};
            setPromoPrices({});
          }
        }

        if (
          resolvedPartnerStatus === true &&
          resolvedPromoPrices &&
          Object.keys(resolvedPromoPrices).length > 0
        ) {
          const nextPromoUpdates: Record<string, number | null> = {};
          for (const item of requestItems) {
            const resolvedPromoPrice = resolvedPromoPrices[item.stateKey];
            if (resolvedPromoPrice === undefined) continue;

            nextPromoUpdates[item.stateKey] = resolvedPromoPrice;
            for (const lookupKey of item.lookupKeys) {
              nextPromoUpdates[lookupKey] = resolvedPromoPrice;
            }
          }

          if (Object.keys(nextPromoUpdates).length > 0) {
            setPromoPrices((prev) => {
              let didChange = false;
              const next = { ...prev };
              for (const [key, value] of Object.entries(nextPromoUpdates)) {
                if (next[key] !== value) {
                  next[key] = value;
                  didChange = true;
                }
              }
              promoPricesRef.current = didChange ? next : prev;
              return didChange ? next : prev;
            });
          }
        }
      };

      const postBatch = async (
        batch: typeof requestItems,
        mode: "fast" | "partner" | "full"
      ) => {
        if (batch.length === 0) {
          return {
            prices: {},
            costPrices: {},
            promoPrices: {},
            hasPromo: {},
            promoPercent: {},
            isPartner: false,
            verified: false,
          } satisfies PriceBatchResult;
        }

        const requestKey = buildPriceBatchRequestKey(mode, batch);
        const existing = inFlightPriceBatchRequests.get(requestKey);
        if (existing) {
          return await awaitWithAbortSignal(existing, options?.signal);
        }

        const requestPromise = (async () => {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          let tokenAttached = mode === "fast";
          if (mode === "full" || mode === "partner") {
            // Both protected modes require a Firebase ID token. The server
            // independently verifies either admin or partner access.
            const adminToken = await getAdminAuthToken?.().catch(() => null);
            if (adminToken) {
              headers.Authorization = `Bearer ${adminToken}`;
              tokenAttached = true;
            }
          }

          // No token yet for a protected mode (Firebase auth still
          // initializing, or a token refresh mid-flight) — the server would
          // just answer isPartner: false with nothing actually verified.
          // Skip the request rather than let that unverified negative reach
          // the caller, who would otherwise mistake it for a real answer.
          if (!tokenAttached) {
            return {
              prices: {},
              costPrices: {},
              promoPrices: {},
              hasPromo: {},
              promoPercent: {},
              isPartner: false,
              verified: false,
            } satisfies PriceBatchResult;
          }

          const response = await fetch(`${CATALOG_PRICE_BATCH_ROUTE}?mode=${mode}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ items: batch }),
            cache: "no-store",
          });

          if (!response.ok) {
            throw new Error(`Price batch failed: ${response.status}`);
          }

          const payload = (await response.json()) as {
            prices?: Record<string, number | null>;
            costPrices?: Record<string, number | null>;
            promoPrices?: Record<string, number | null>;
            hasPromo?: Record<string, boolean>;
            promoPercent?: Record<string, number | null>;
            isPartner?: boolean;
          };
          return {
            prices: payload?.prices ?? {},
            costPrices: payload?.costPrices ?? {},
            promoPrices: payload?.promoPrices ?? {},
            hasPromo: payload?.hasPromo ?? {},
            promoPercent: payload?.promoPercent ?? {},
            isPartner: payload?.isPartner === true,
            verified: true,
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
        // Start the protected partner lookup alongside the public price batch.
        // Waiting for the public price first made promotional prices visibly
        // pop in several seconds later on slower mobile connections.
        const partnerLookupPromise =
          includePartnerPrices && allowFullLookup
            ? postBatch(requestItems, "partner")
            : null;
        const fastResult = await postBatch(requestItems, "fast");
        const normalizedFastPrices: Record<string, number | null> = {};
        const normalizedFastCostPrices: Record<string, number | null> = {};
        const normalizedFastHasPromo: Record<string, boolean> = {};
        const normalizedFastPromoPercent: Record<string, number | null> = {};
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

          if (fastResult.hasPromo[item.stateKey] === true) {
            normalizedFastHasPromo[item.stateKey] = true;
          }

          const resolvedPromoPercent = fastResult.promoPercent[item.stateKey];
          if (typeof resolvedPromoPercent === "number" && Number.isFinite(resolvedPromoPercent)) {
            normalizedFastPromoPercent[item.stateKey] = resolvedPromoPercent;
          }
        }
        if (Object.keys(normalizedFastHasPromo).length > 0) {
          setHasPromoAvailability((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const [key, value] of Object.entries(normalizedFastHasPromo)) {
              if (next[key] !== value) {
                next[key] = value;
                didChange = true;
              }
            }
            return didChange ? next : prev;
          });
        }
        if (Object.keys(normalizedFastPromoPercent).length > 0) {
          setPromoPercentByKey((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const [key, value] of Object.entries(normalizedFastPromoPercent)) {
              if (next[key] !== value) {
                next[key] = value;
                didChange = true;
              }
            }
            return didChange ? next : prev;
          });
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
        const protectedLookupItems = includePartnerPrices ? requestItems : [];
        if (fullLookupItems.length === 0 && protectedLookupItems.length === 0) return;

        if (!allowFullLookup) {
          for (const item of [...fullLookupItems, ...protectedLookupItems]) {
            priceRetryCooldownUntilRef.current[item.stateKey] =
              Date.now() + PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS;
          }
          return;
        }

        if (protectedLookupItems.length > 0) {
          void (partnerLookupPromise ?? postBatch(protectedLookupItems, "partner"))
            .then((partnerResult) => {
              // No token made it into this request (see postBatch) — nothing
              // was actually verified, so isPartner:false here is not a real
              // answer. Leave the existing isPartner/promoPrices state
              // untouched instead of wiping already-resolved promo prices
              // because of an unrelated, unlucky auth-timing race.
              if (!partnerResult.verified) return;

              const resolvedPartnerPrices: Record<string, number | null> = {};
              const resolvedPromoPrices: Record<string, number | null> = {};

              for (const item of protectedLookupItems) {
                const resolvedPrice = partnerResult.prices[item.stateKey];
                if (
                  typeof resolvedPrice === "number" &&
                  Number.isFinite(resolvedPrice) &&
                  resolvedPrice > 0
                ) {
                  resolvedPartnerPrices[item.stateKey] = resolvedPrice;
                }

                const resolvedPromoPrice = partnerResult.promoPrices[item.stateKey];
                resolvedPromoPrices[item.stateKey] =
                  partnerResult.isPartner &&
                  typeof resolvedPromoPrice === "number" &&
                  Number.isFinite(resolvedPromoPrice) &&
                  resolvedPromoPrice > 0
                    ? resolvedPromoPrice
                    : null;
              }

              commitResolvedPrices(
                resolvedPartnerPrices,
                undefined,
                PRICE_REVALIDATE_AFTER_NULL_MS,
                resolvedPromoPrices,
                partnerResult.isPartner
              );
            })
            .catch((error) => {
              // A transient network error/timeout means the partner check
              // didn't run this time — not that it came back negative. Leave
              // isPartner/promoPrices as they were; the next successful
              // batch (or scroll-triggered refetch) will reconcile them.
              if (isAbortLikeError(error)) return;
            });
        }

        if (fullLookupItems.length > 0) void postBatch(fullLookupItems, "full")
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
    [includeCostPrices, includePartnerPrices, getAdminAuthToken]
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
        skipLeadingPhotos?: number;
      }
    ) => {
      if (typeof window === "undefined") return;

      // Older 1C payloads omit hasPhoto even when a valid image exists. Only
      // an explicit false is authoritative; otherwise include the item in the
      // shared batch instead of forcing every card into a delayed direct call.
      const photoItems = items.filter((item) => item.hasPhoto !== false);
      const leadingDirectCount = Math.max(0, options?.skipLeadingPhotos ?? 0);
      const warmupItems = leadingDirectCount > 0
        ? photoItems.slice(leadingDirectCount)
        : photoItems;
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

        if (pageImagesRef.current[key]) continue;
        if (pageImagePendingRef.current[key]) continue;
        if (pageImageMissingRef.current[key]) continue;
        if (imageBatchAttemptKeysRef.current.has(key)) continue;

        requestItems.push(item);
        if (requestItems.length >= VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE) break;
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

      if (requestItems.length === 0) return;

      const pendingKeys = requestItems
        .map((item) => buildProductImageBatchKey(item.code, item.article))
        .filter(Boolean);
      const pendingOwner = ++imageBatchRequestSequenceRef.current;
      if (pendingKeys.length > 0) {
        for (const key of pendingKeys) {
          imageBatchAttemptKeysRef.current.add(key);
          pageImagePendingOwnerRef.current[key] = pendingOwner;
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

      const clearPendingKeys = (keysToClear = pendingKeys) => {
        if (keysToClear.length === 0) return;

        const ownedKeys = keysToClear.filter(
          (key) => pageImagePendingOwnerRef.current[key] === pendingOwner
        );
        if (ownedKeys.length === 0) return;

        pageImagePendingRef.current = { ...pageImagePendingRef.current };
        for (const key of ownedKeys) {
          delete pageImagePendingRef.current[key];
          delete pageImagePendingOwnerRef.current[key];
        }

        startTransition(() => {
          setPageImagePending((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const key of ownedKeys) {
              if (!next[key]) continue;
              delete next[key];
              didChange = true;
            }
            return didChange ? next : prev;
          });
        });
      };

      const applyReadyImageEntries = (
        readyEntries: Array<{ key: string; src?: string }>
      ) => {
        const validEntries = readyEntries.filter((item) => item.src);
        if (validEntries.length === 0) return;

        // Update refs synchronously so deduplication logic sees current state immediately.
        for (const item of validEntries) {
          if (item.src) pageImagesRef.current[item.key] = item.src;
          delete pageImageMissingRef.current[item.key];
        }

        // Defer React state updates so image arrivals don't interrupt active scrolling.
        startTransition(() => {
          setPageImages((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const item of validEntries) {
              if (!item.src || next[item.key]) continue;
              next[item.key] = item.src;
              didChange = true;
            }
            return didChange ? next : prev;
          });

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
        });
      };

      const applyMissingImageEntries = (
        missingEntries: Array<{
          key: string;
          status: "ready" | "missing";
          transient?: boolean;
        }>
      ) => {
        // Skip items already resolved (batch or direct load) — don't clobber them.
        const validEntries = missingEntries.filter(
          (item) => item.status === "missing" && !pageImagesRef.current[item.key]
        );
        if (validEntries.length === 0) return;

        // Update refs synchronously for deduplication in fetchCatalogPageImages.
        for (const item of validEntries) {
          pageImageMissingRef.current[item.key] = true;
        }

        startTransition(() => {
          setPageImageMissing((prev) => {
            let didChange = false;
            const next = { ...prev };
            for (const item of validEntries) {
              if (next[item.key]) continue;
              next[item.key] = true;
              didChange = true;
            }
            return didChange ? next : prev;
          });
        });
      };

      void primeCatalogImageBatch(requestItems, {
        deep: false,
        signal: options?.signal,
      })
        .then((results) => {
          if (options?.signal?.aborted) return;
          if (
            options?.querySignatureSnapshot &&
            activeQuerySignatureRef.current !== options.querySignatureSnapshot
          ) {
            return;
          }

          const readyEntries = results.filter(
            (item) => item.status === "ready" && item.src
          );
          applyReadyImageEntries(readyEntries);

          if (readyEntries.length > 0 && options?.cacheKey && options?.ttlMs) {
            const resolvedMap: Record<string, string> = {};
            for (const entry of readyEntries) {
              if (entry.src) resolvedMap[entry.key] = entry.src;
            }
            mergePageImagesIntoCache(options.cacheKey, resolvedMap, options.ttlMs);
          }

          const resultsByKey = new Map(results.map((item) => [item.key, item]));
          const recoveryItems = requestItems
            .filter((item) => {
              if (item.hasPhoto === false) return false;
              const key = buildProductImageBatchKey(item.code, item.article);
              if (!key || pageImagesRef.current[key]) return false;
              const result = resultsByKey.get(key);
              return !result || result.status !== "ready";
            })
            .slice(0, VISIBLE_IMAGE_DEEP_RECOVERY_CHUNK_SIZE);

          const recoveryKeySet = new Set(
            recoveryItems
              .map((item) => buildProductImageBatchKey(item.code, item.article))
              .filter(Boolean)
          );
          // Items outside the small deep-recovery window must immediately be
          // released to ProductCardImage's direct route. Previously they kept
          // an attempt marker forever, so later pages could remain on a
          // skeleton until each card's independent timeout fired.
          applyMissingImageEntries(
            requestItems
              .map((item) => buildProductImageBatchKey(item.code, item.article))
              .filter((key) => Boolean(key && !recoveryKeySet.has(key) && !pageImagesRef.current[key]))
              .map((key) => resultsByKey.get(key) ?? ({ key, status: "missing", transient: true } as const))
          );

          if (recoveryItems.length > 0) {
            clearPendingKeys(
              pendingKeys.filter((key) => !recoveryKeySet.has(key))
            );

            // Keep the batch pending flag until deep recovery settles. Otherwise
            // each card starts its own direct fallback while this request is
            // still running, multiplying 1C traffic for the same products.
            return new Promise<void>((resolve) => {
              window.setTimeout(() => {
                if (options?.signal?.aborted) {
                  resolve();
                  return;
                }
                if (
                  options?.querySignatureSnapshot &&
                  activeQuerySignatureRef.current !== options.querySignatureSnapshot
                ) {
                  resolve();
                  return;
                }

                void primeCatalogImageBatch(recoveryItems, {
                  deep: true,
                  signal: options?.signal,
                })
                  .then((deepResults) => {
                    if (options?.signal?.aborted) return;
                    if (
                      options?.querySignatureSnapshot &&
                      activeQuerySignatureRef.current !== options.querySignatureSnapshot
                    ) {
                      return;
                    }

                    const deepReadyEntries = deepResults.filter(
                      (item) => item.status === "ready" && item.src
                    );
                    const deepResultsByKey = new Map(
                      deepResults.map((item) => [item.key, item])
                    );
                    applyReadyImageEntries(deepReadyEntries);
                    applyMissingImageEntries(
                      recoveryItems
                        .map((item) => buildProductImageBatchKey(item.code, item.article))
                        .filter((key) => Boolean(key && !pageImagesRef.current[key]))
                        .map((key) => deepResultsByKey.get(key) ?? ({ key, status: "missing", transient: true } as const))
                    );

                    if (deepReadyEntries.length > 0 && options?.cacheKey && options?.ttlMs) {
                      const deepMap: Record<string, string> = {};
                      for (const entry of deepReadyEntries) {
                        if (entry.src) deepMap[entry.key] = entry.src;
                      }
                      mergePageImagesIntoCache(options.cacheKey, deepMap, options.ttlMs);
                    }
                  })
                  .catch((error) => {
                    if (isAbortLikeError(error)) return;
                    // Same gap as the outer catch above, but for the deep-
                    // recovery attempt specifically: this inner promise
                    // always resolves via .finally(resolve) regardless of
                    // its own failure, so the outer .catch() never sees
                    // this error — recoveryItems' keys need their own
                    // release here, or they're stuck exactly like the
                    // outer case.
                    applyMissingImageEntries(
                      recoveryItems
                        .map((item) => buildProductImageBatchKey(item.code, item.article))
                        .filter((key) => Boolean(key && !pageImagesRef.current[key]))
                        .map((key) => ({ key, status: "missing" as const, transient: true }))
                    );
                    for (const key of recoveryKeySet) {
                      if (pageImagePendingOwnerRef.current[key] === pendingOwner) {
                        imageBatchAttemptKeysRef.current.delete(key);
                      }
                    }
                  })
                  .finally(resolve);
              }, VISIBLE_IMAGE_DEEP_RECOVERY_DELAY_MS);
            });
          }
        })
        .catch((error) => {
          if (isAbortLikeError(error)) return;
          // A genuine failure (network blip, timeout, non-2xx) here left
          // requestItems' keys stuck forever: still marked as "attempted"
          // (imageBatchAttemptKeysRef, only cleared below on abort/stale —
          // not on a real error) and never marked "missing" either, so
          // ProductCardImage's own direct-load fallback never kicked in.
          // The image just never arrived until a full page reload reset
          // every in-memory ref. Release them the same way a successful-
          // but-not-ready response already does: mark missing (unblocks
          // each card's direct fallback) — the finally block below then
          // also frees the attempt marker so a future pass can retry the
          // batch route too.
          applyMissingImageEntries(
            requestItems
              .map((item) => buildProductImageBatchKey(item.code, item.article))
              .filter((key) => Boolean(key && !pageImagesRef.current[key]))
              .map((key) => ({ key, status: "missing" as const, transient: true }))
          );
          for (const key of pendingKeys) {
            if (pageImagePendingOwnerRef.current[key] === pendingOwner) {
              imageBatchAttemptKeysRef.current.delete(key);
            }
          }
        })
        .finally(() => {
          const requestBecameStale = Boolean(
            options?.querySignatureSnapshot &&
              activeQuerySignatureRef.current !== options.querySignatureSnapshot
          );
          if (options?.signal?.aborted || requestBecameStale) {
            for (const key of pendingKeys) {
              if (pageImagePendingOwnerRef.current[key] === pendingOwner) {
                imageBatchAttemptKeysRef.current.delete(key);
              }
            }
          }
          clearPendingKeys();
        });
    },
    []
  );

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
    if (filterLoading && safeData.length > 0 && catalogReadyQuerySignature === querySignature) {
      setFilterLoading(false);
    }
  }, [filterLoading, safeData, catalogReadyQuerySignature, querySignature]);

  // РєРѕСЂР·РёРЅР° > РјР°РїР°
  const cartMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cartItems) {
      if (item.code) map[item.code] = item.quantity;
    }
    return map;
  }, [cartItems]);

  // товари по коду
  // First occurrence wins per code — must match uniqueData's own dedup
  // convention below (which also keeps the first occurrence, keyed by the
  // stricter getProductStableListKey). 1C's cursor pagination can return the
  // same product again across pages with a since-changed quantity (stock
  // sold in between fetches); last-wins here disagreed with which copy
  // uniqueData/filteredData actually renders, so the qty stepper's max
  // (read from this map) could silently be a stale/different figure than
  // the one the "+" button's own disabled check used (item.quantity from
  // the rendered card) — the button stayed enabled but clicking it did
  // nothing once it hit that other quantity's cap.
  const productsByCode = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const it of safeData) {
      if (it.code && !(it.code in map)) map[it.code] = it;
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
        promoOnly,
        sort: effectiveServerSortOrder || "none",
        pricedOnly,
        priceFrom,
        priceTo,
        priceRate:
          priceFrom !== null || priceTo !== null ? euroRate : null,
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
      promoOnly,
      effectiveServerSortOrder,
      pricedOnly,
      priceFrom,
      priceTo,
      euroRate,
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
        try {
          return await awaitWithAbortSignal(existing, signal);
        } catch (err) {
          // If OUR signal was aborted, propagate cleanly.
          if (signal?.aborted) throw createAbortError();
          // The shared in-flight request was externally aborted (e.g. background
          // prefetch cancelled when the user triggered "load more"). Remove the stale
          // entry and fall through to make a fresh request below.
          if (isAbortLikeError(err)) {
            inFlightPageRequests.delete(cacheKey);
          } else {
            throw err;
          }
        }
      }

      const requestPromise: Promise<CatalogPagePayload> = (async () => {
        const res = await fetch(CATALOG_PAGE_ROUTE, {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
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
            promoOnly,
            sortOrder: effectiveServerSortOrder,
            pricedOnly,
            priceFrom: priceFrom != null ? Math.round((priceFrom / euroRate) * 100) / 100 : null,
            priceTo: priceTo != null ? Math.round((priceTo / euroRate) * 100) / 100 : null,
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
          correctedQuery?: string;
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
          correctedQuery: typeof raw?.correctedQuery === "string" ? raw.correctedQuery : undefined,
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
      promoOnly,
      effectiveServerSortOrder,
      subcategoryFromURL,
      pricedOnly,
      priceFrom,
      priceTo,
      inStock,
      euroRate,
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

            // Preserve images fetched client-side — the server always returns images: {}
            const existingCached =
              readPageFromMemory(options.cacheKey) ?? readPageFromSession(options.cacheKey);
            const existingImages = existingCached?.images ?? {};
            const mergedPayload: CatalogPagePayload =
              Object.keys(existingImages).length > 0
                ? { ...payload, images: { ...existingImages, ...(payload.images ?? {}) } }
                : payload;

            writePageToMemory(options.cacheKey, mergedPayload, options.ttlMs);
            writePageToSession(options.cacheKey, mergedPayload, options.ttlMs);
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
  const loadDirectPage = useCallback(async (targetPage: number, pageSize: number, append = false) => {
    if (Date.now() < directUnsupportedUntilRef.current) return "unsupported" as const;
    directRequestRef.current?.abort();
    const controller = new AbortController();
    directRequestRef.current = controller;
    const signature = activeQuerySignatureRef.current;
    const offset = append ? dataStartIndex + dataRef.current.length : (targetPage - 1) * pageSize;
    showNextPageLoader();
    setError(null);
    try {
      const response = await fetch(CATALOG_PAGE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          directPage: true, offset, page: targetPage, limit: pageSize,
          selectedCars, selectedCategories: effectiveSelectedCategories,
          searchQuery: correctedQuery || normalizedSearch, searchFilter,
          group: groupFromURL, subcategory: subcategoryFromURL, producer: producerFromURL,
          expandHierarchy: expandHierarchyFromURL, promoOnly,
          sortOrder: effectiveServerSortOrder, pricedOnly,
          priceFrom: priceFrom != null ? Math.round(priceFrom / euroRate * 100) / 100 : null,
          priceTo: priceTo != null ? Math.round(priceTo / euroRate * 100) / 100 : null,
          inStock,
        }),
      });
      const payload = await response.json();
      if (controller.signal.aborted || signature !== activeQuerySignatureRef.current) return "error" as const;
      if (payload.directPageUnsupported) {
        directUnsupportedUntilRef.current = Date.now() + 60_000;
        return "unsupported" as const;
      }
      if (!response.ok || payload.serviceUnavailable || payload.directOffset !== offset || !Array.isArray(payload.items)) {
        throw new Error("Не вдалося відкрити сторінку. Спробуйте ще раз.");
      }
      const items = payload.items.map(normalizeProduct) as Product[];
      if (!items.length && offset > 0) throw new Error("Склад каталогу змінився. Оновіть каталог і спробуйте ще раз.");
      setDirectMode(true);
      if (!append) setDataStartIndex(offset);
      const nextData = append ? mergeUniqueProducts(dataRef.current, items) : items;
      dataRef.current = nextData;
      setData(nextData);
      setDisplayedPage(targetPage);
      setHasMore(payload.hasMore === true);
      if (typeof payload.totalCount === "number") setCatalogTotalCount(payload.totalCount);
      applyResolvedPagePrices(items, payload.prices);
      setPageImages((previous) => append ? { ...previous, ...(payload.images || {}) } : payload.images || {});
      failedPageRef.current = false;
      return "loaded" as const;
    } catch (error) {
      if (!controller.signal.aborted && signature === activeQuerySignatureRef.current) {
        setError(error instanceof Error ? error.message : "Не вдалося відкрити сторінку");
      }
      return "error" as const;
    } finally {
      if (directRequestRef.current === controller) hideNextPageLoader(true);
    }
  }, [dataStartIndex, selectedCars, effectiveSelectedCategories, correctedQuery, normalizedSearch,
    searchFilter, groupFromURL, subcategoryFromURL, producerFromURL, expandHierarchyFromURL,
    promoOnly, effectiveServerSortOrder, pricedOnly, priceFrom, priceTo, euroRate, inStock,
    showNextPageLoader, hideNextPageLoader, applyResolvedPagePrices]);

  useEffect(() => () => { directRequestRef.current?.abort(); }, []);

  useEffect(() => {
    const isSortOnlyChange =
      !isInitialResetRunRef.current &&
      prevFiltersSignatureExcludingSortRef.current === filtersSignatureExcludingSort &&
      dataRef.current.length > 0;
    isInitialResetRunRef.current = false;
    prevFiltersSignatureExcludingSortRef.current = filtersSignatureExcludingSort;

    activeQuerySignatureRef.current = querySignature;
    firstPageReadySignatureRef.current = null;
    setCatalogReadyQuerySignature("");
    pagingRequestedRef.current = false;
    duplicatePageStreakRef.current = 0;
    cursorDuplicateStreakRef.current = 0;
    nextCursorByPageRef.current = { 1: "" };
    nextCursorFieldByPageRef.current = { 1: "" };
    priceLoadingKeysRef.current.clear();
    priceRetryCooldownUntilRef.current = {};
    directRequestRef.current?.abort();
    setDirectMode(false);
    setDataStartIndex(0);
    failedPageRef.current = false;
    setPage(1);
    setDisplayedPage(1);
    setHasMore(true);
    setHasLoadedOnce(false);
    setFirstPageResolvedItemCount(0);
    setFlippedCard(null);
    setSelectedImage(null);
    setError(null);
    clearTransientPageImageState();
    hideNextPageLoader(true);

    const trimmed = normalizedSearch;
    if (typeof window !== "undefined") {
      const cacheKey = buildCacheKey(1, trimmed);

      if (
        hasInitialPage &&
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
        replacePageImages(memoryHit.images);
        const cancelWarmup = scheduleCatalogBackgroundTask(() => {
          void fetchCatalogPagePrices(memoryHit.items, {
            prefetchedPrices: memoryHit.prices,
            cacheKey,
            ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            querySignatureSnapshot: querySignature,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(swallowAbortError);
        });
        dataRef.current = nextItems;
        setData(nextItems);
        setFirstPageResolvedItemCount(memoryHit.items.length);
        setCorrectedQuery(memoryHit.correctedQuery || null);
        setCatalogTotalCount(resolveFirstPageTotal(memoryHit.items, memoryHit.totalCount, memoryHit.hasMore));
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
        setCatalogReadyQuerySignature(querySignature);
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
        replacePageImages(sessionHit.images);
        const cancelWarmup = scheduleCatalogBackgroundTask(() => {
          void fetchCatalogPagePrices(sessionHit.items, {
            prefetchedPrices: sessionHit.prices,
            cacheKey,
            ttlMs: MEMORY_CACHE_TTL_MS_FIRST_PAGE,
            querySignatureSnapshot: querySignature,
            allowFullLookup: shouldAllowCatalogDirectPriceLookup,
          }).catch(swallowAbortError);
        });
        dataRef.current = nextItems;
        setData(nextItems);
        setFirstPageResolvedItemCount(sessionHit.items.length);
        setCorrectedQuery(sessionHit.correctedQuery || null);
        setCatalogTotalCount(resolveFirstPageTotal(sessionHit.items, sessionHit.totalCount, sessionHit.hasMore));
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
        setCatalogReadyQuerySignature(querySignature);
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

      // No immediate cache hit for this filter/query. A sort-only change keeps
      // the currently-rendered products on screen instead of clearing them —
      // showFilterTransitionOverlay's "Сортую: спочатку дешевші/дорожчі" label
      // then shows over the existing grid while the re-sorted page 1 loads,
      // rather than flashing the full "Готую товари" skeleton. Any other
      // filter/search change still clears immediately so results never mix.
      if (!isSortOnlyChange) {
        dataRef.current = [];
        setData([]);
      }
      replacePageImages({});
      setCorrectedQuery(null);
      setCatalogTotalCount(initialTotalCount ?? null);
      setLoading(true);
      setFilterLoading(true);
      return;
    }

    dataRef.current = [];
    setData([]);
    replacePageImages({});
    setCorrectedQuery(null);
    setCatalogTotalCount(initialTotalCount ?? null);
    setLoading(true);
    setFilterLoading(true);
    // Без cache показуємо чистий стан, щоб не змішувати товари старого та нового фільтра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyResolvedPagePrices,
    fetchCatalogPagePrices,
    clearTransientPageImageState,
    shouldAllowCatalogDirectPriceLookup,
    querySignature,
    initialPagePayload,
    initialQuerySignature,
    normalizedSearch,
    buildCacheKey,
    hideNextPageLoader,
    revalidateCachedPagePayload,
    replacePageImages,
    scheduleCatalogBackgroundTask,
  ]);

  // --- Завантаження списку товарів ---
  useEffect(() => {
    if (directMode) return;
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
    const cancelPageWarmup = () => {};

    const trimmed = normalizedSearch;
    // Only the search box needs debouncing — clicking a page number, a car,
    // or a category is a single discrete action already, not a keystroke
    // stream, so those stay instant. Comparing against the last search this
    // same effect saw (not e.g. a value from render) means a plain filter
    // change while a search term is already active and unchanged still runs
    // with debounceDelay 0. Clearing the box (trimmed === "") also skips the
    // wait — going back to browsing shouldn't pause either.
    const searchTermChanged = previousSearchTermRef.current !== trimmed;
    previousSearchTermRef.current = trimmed;
    const debounceDelay = searchTermChanged && trimmed ? 200 : 0;
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
      if (payload.serviceUnavailable) {
        failedPageRef.current = page > 1;
        setError(sanitizeUiErrorMessage(payload.message) || "Не вдалося завантажити сторінку. Спробуйте ще раз.");
        setHasLoadedOnce(true);
        setLoading(false);
        setFilterLoading(false);
        pagingRequestedRef.current = false;
        hideNextPageLoader();
        return false;
      }
      failedPageRef.current = false;
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
          pageImagesRef.current = { ...incomingImages };
          return Object.keys(incomingImages).length > 0 ? { ...incomingImages } : {};
        }

        const next = { ...prev, ...incomingImages };
        pageImagesRef.current = next;
        return next;
      });
      dataRef.current = nextData;
      setData(nextData);
      if (page === 1) {
        setFirstPageResolvedItemCount(items.length);
        setCorrectedQuery(payload.correctedQuery || null);
        setCatalogTotalCount(resolveFirstPageTotal(items, payload.totalCount, payload.hasMore));
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
        setCatalogReadyQuerySignature(currentQuerySignature);
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

      // Without a cursor 1C may still respect НомерСтраницы/Смещение for some queries
      // (e.g. car-filtered getdata). Allow a few attempts before giving up.
      // With a cursor tolerate a short streak in case 1C returns occasional overlaps.
      const shouldStopPaginationOnDuplicatePage =
        (!isCursorlessSortedMode && !payload.nextCursor && duplicatePageStreakRef.current >= 3) ||
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
      applyResolvedPagePrices(itemsForIncrementalWarmup, payload.prices);
      // Skipped mid multi-page jump: this page is never shown (only the one
      // the jump lands on is), so batch-fetching its images/prices would
      // just queue behind the real, still-needed catalog-page requests —
      // see suppressPagePrefetchRef's definition above.
      if (!suppressPagePrefetchRef?.current) {
        // Start the image batch before React flushes the new product list. Cards
        // therefore render with batchImagePending already set and cannot race the
        // 150 ms direct fallback while the shared 1C request is starting.
        fetchCatalogPageImages(itemsForIncrementalWarmup, {
          prefetchedImages: payload.images,
          cacheKey,
          ttlMs: ttl,
          querySignatureSnapshot: currentQuerySignature,
          signal: controller.signal,
          skipLeadingPhotos:
            page === 1
              ? viewMode === "list"
                ? IMAGE_EAGER_ITEMS_COUNT_LIST
                : IMAGE_EAGER_ITEMS_COUNT
              : 0,
        });
        void fetchCatalogPagePrices(itemsForIncrementalWarmup, {
          prefetchedPrices: payload.prices,
          cacheKey,
          ttlMs: ttl,
          querySignatureSnapshot: currentQuerySignature,
          signal: controller.signal,
          allowFullLookup: shouldAllowCatalogDirectPriceLookup,
        }).catch(swallowAbortError);
      }
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
        failedPageRef.current = page > 1;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageRetryNonce,
    directMode,
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

  // Two 1C sources never return a total_count the way plain allgoods
  // browsing does: the legacy car-filtered source (getdata), and text search
  // (searchProductFields merges results across up to 4 separate field
  // queries — name/article/code/producer — so there's no single upstream
  // total to report). Either way catalogTotalCount stays null even though
  // there are more matches than the loaded page, which previously meant no
  // total → hasKnownTotalCount false → the whole pagination bar just didn't
  // render for a search with more than one page of results. Backfill an
  // authoritative total via the dedicated counting endpoint (which
  // paginates/dedupes server-side and already handles search-only queries
  // fine) whenever either case applies and the primary fetch alone couldn't
  // establish a real total.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedCars.length === 0 && !normalizedSearch) return;
    if (catalogTotalCount !== null) return;
    if (!hasLoadedOnce) return;
    if (loading || filterLoading) return;

    const signatureAtStart = querySignature;
    const controller = new AbortController();

    const params = new URLSearchParams();
    for (const car of selectedCars) params.append("car", car);
    for (const category of effectiveSelectedCategories) params.append("category", category);
    if (normalizedSearch) {
      params.set("search", normalizedSearch);
      params.set("filter", searchFilter);
    }
    if (groupFromURL) params.set("group", groupFromURL);
    if (subcategoryFromURL) params.set("subcategory", subcategoryFromURL);
    if (producerFromURL) params.set("producer", producerFromURL);
    if (expandHierarchyFromURL) params.set("scope", "hierarchy");
    if (pricedOnly) params.set("pricedOnly", "1");
    if (typeof priceFrom === "number") {
      params.set("priceFrom", String(Math.round((priceFrom / euroRate) * 100) / 100));
    }
    if (typeof priceTo === "number") {
      params.set("priceTo", String(Math.round((priceTo / euroRate) * 100) / 100));
    }
    if (inStock) params.set("inStock", "1");

    fetchCatalogCount(params.toString())
      .then((payload: { totalCount?: number; exact?: boolean } | null) => {
        if (controller.signal.aborted || payload?.exact === false) return;
        if (activeQuerySignatureRef.current !== signatureAtStart) return;
        if (typeof payload?.totalCount !== "number" || !Number.isFinite(payload.totalCount)) return;
        setCatalogTotalCount(Math.max(0, payload.totalCount));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [
    selectedCars,
    effectiveSelectedCategories,
    querySignature,
    catalogTotalCount,
    hasLoadedOnce,
    loading,
    filterLoading,
    normalizedSearch,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    expandHierarchyFromURL,
    pricedOnly,
    priceFrom,
    priceTo,
    euroRate,
    inStock,
  ]);

  useEffect(() => {
    if (directMode || loading || !hasMore || safeData.length === 0) return;

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

    prefetchNextPageTriggerRef.current = () =>
      void prefetchUpcomingPages().catch(swallowAbortError);

    const timerId = window.setTimeout(() => {
      prefetchNextPageTriggerRef.current?.();
    }, BACKGROUND_PAGE_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      prefetchNextPageTriggerRef.current = null;
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
    directMode,
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

  // Text matching is authoritative on the server, including corrected queries
  // and OEM codes embedded in names. Re-filtering by the original input here
  // used to discard valid results and leave partially empty pages.
  const filteredData = useMemo(() => {
    const categories = new Set(effectiveSelectedCategories.map(normalizeFilterToken));
    const producer = normalizeFilterToken(producerFromURL);
    return uniqueData.filter((item) => {
      const categoryMatch = !categories.size || [item.subGroup, item.group, item.category]
        .some((value) => categories.has(normalizeFilterToken(value)));
      return categoryMatch && (!producer || normalizeFilterToken(item.producer).includes(producer));
    });
  }, [uniqueData, effectiveSelectedCategories, producerFromURL]);

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

      const regularEuro = getResolvedProductPriceEuro(item, prices);
      const regularPriceUAH = toPriceUAH(regularEuro, euroRate);
      const promoEuro = isPartner
        ? getResolvedProductPromoPriceEuro(item, promoPrices)
        : null;
      const candidatePromoPriceUAH = toPriceUAH(promoEuro, euroRate);
      const hasPromoPrice =
        candidatePromoPriceUAH != null &&
        (regularPriceUAH == null || candidatePromoPriceUAH < regularPriceUAH);
      const priceUAH = hasPromoPrice ? candidatePromoPriceUAH : regularPriceUAH;

      if (priceUAH == null) {
        return;
      }

      addToCart({
        code,
        name: item.name || "Товар",
        article: item.article || "",
        producer: item.producer || undefined,
        quantity: qtyToAdd,
        price: priceUAH,
        isPromoPrice: hasPromoPrice,
        originalPrice: hasPromoPrice ? regularPriceUAH ?? undefined : undefined,
        category: item.category || undefined,
        group: item.group || undefined,
        subGroup: item.subGroup || undefined,
      });
    },
    [cartMap, quantities, prices, promoPrices, isPartner, euroRate, addToCart]
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

    // The synchronous in-flight ref already prevents duplicate clicks.
    // A time-based cooldown also blocked legitimate cached-page continuations.
    pagingRequestedRef.current = true;
    showNextPageLoader();
    if (failedPageRef.current) setPageRetryNonce((value) => value + 1);
    else setPage((prevPage) => prevPage + 1);
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

  const prevIncludePartnerPricesRef = useRef(includePartnerPrices);
  useEffect(() => {
    const justBecameAvailable =
      includePartnerPrices && !prevIncludePartnerPricesRef.current;
    prevIncludePartnerPricesRef.current = includePartnerPrices;

    if (!includePartnerPrices) {
      setIsPartner(false);
      promoPricesRef.current = {};
      setPromoPrices({});
      return;
    }

    if (!justBecameAvailable || dataRef.current.length === 0) return;
    void fetchCatalogPagePrices(dataRef.current, {
      prefetchedPrices: pricesRef.current,
      querySignatureSnapshot: activeQuerySignatureRef.current,
      allowFullLookup: true,
    }).catch(swallowAbortError);
  }, [includePartnerPrices, fetchCatalogPagePrices]);

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

  const updateCatalogItemFields = useCallback(
    (code: string, fields: { name?: string; article?: string; group?: string; subGroup?: string; category?: string; producer?: string; quantity?: number }) => {
      if (!code || !Object.keys(fields).length) return;
      setData((prev) =>
        prev.map((item) =>
          item.code === code ? { ...item, ...fields } : item
        )
      );
    },
    []
  );

  // An admin edit made elsewhere (currently: the product page) dispatches
  // this with the confirmed field(s) that changed. If this catalog grid is
  // already mounted — e.g. still alive behind Next's router cache after the
  // admin navigates back here — patch that one row directly, the same way
  // an in-grid edit already updates itself above, instead of leaving it
  // showing the pre-edit value until some future refetch happens to include it.
  useEffect(() => {
    const handleCatalogInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<CatalogInvalidationDetail>).detail;
      if (!detail?.code) return;

      const { code, priceEuro, costPriceEuro, ...rest } = detail;
      if (priceEuro !== undefined || costPriceEuro !== undefined) {
        updateCatalogItemPrice({ code, priceEuro, costPriceEuro });
      }

      const fieldsToApply: {
        name?: string; article?: string; group?: string; subGroup?: string; category?: string; producer?: string; quantity?: number;
      } = {};
      if (rest.name !== undefined) fieldsToApply.name = rest.name;
      if (rest.article !== undefined) fieldsToApply.article = rest.article;
      if (rest.producer !== undefined) fieldsToApply.producer = rest.producer;
      if (rest.group !== undefined) fieldsToApply.group = rest.group;
      if (rest.subGroup !== undefined) fieldsToApply.subGroup = rest.subGroup;
      if (rest.category !== undefined) fieldsToApply.category = rest.category;
      if (rest.quantity !== undefined) fieldsToApply.quantity = rest.quantity;
      if (Object.keys(fieldsToApply).length) {
        updateCatalogItemFields(code, fieldsToApply);
      }
    };

    window.addEventListener("partson:catalog-invalidated", handleCatalogInvalidated);
    return () => window.removeEventListener("partson:catalog-invalidated", handleCatalogInvalidated);
  }, [updateCatalogItemPrice, updateCatalogItemFields]);

  return {
    filteredData,
    directMode,
    dataStartIndex,
    loadDirectPage,
    quantities,
    prices,
    costPrices,
    promoPrices,
    isPartner,
    hasPromoAvailability,
    promoPercentByKey,
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
    displayedPage,
    setDisplayedPage,
    handleFlip,
    handleQtyChange,
    handleAddToCart,
    handleRemoveFromCart,
    handleImageOpen,
    handleImageClose,
    loadNextPage,
    prefetchNextPageTriggerRef,
    prefetchVisibleCatalogPrices,
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
    isRefetching,
    hasLoadedOnce,
    firstPageResolvedItemCount,
    filterLoading,
    setFilterLoading,
    updateCatalogItemPrice,
    updateCatalogItemFields,
    catalogTotalCount,
    correctedQuery,
    catalogQuerySignature: querySignature,
    catalogReadyQuerySignature,
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
  viewMode = "grid",
  onViewModeChange,
  pageBatchSize = ITEMS_PER_PAGE,
  onPageBatchSizeChange,
}) => {
  const searchParams = useSearchParams();
  const catalogGridRef = useRef<HTMLDivElement | null>(null);
  // True for the duration of a multi-page jump — see its own definition in
  // useCatalogData's params for why intermediate pages skip price/image
  // prefetch entirely while this is set.
  const suppressPagePrefetchDuringJumpRef = useRef(false);
  const currentSearchParams = useMemo(() => searchParams ?? new URLSearchParams(), [searchParams]);

  const rawSearchQuery = currentSearchParams.get("search") || "";
  const searchFilter =
    (currentSearchParams.get("filter") as "all" | "article" | "name" | "code" | "producer" | "description") ||
    "all";

  // Jumping several catalog pages at once (numbered pagination, "last page")
  // chains many raw fetches back-to-back, each superseding — and aborting —
  // the previous one. Every one of those aborts is already caught in-app
  // (see isAbortLikeError/swallowAbortError throughout this file and in
  // product-image-batch-client.ts's dedup layer); this only silences the dev
  // overlay's own false-positive "Runtime AbortError" for that exact,
  // already-handled case, which fires more often once a jump means dozens of
  // fetches instead of one. Anything else still reaches the overlay normally.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isAbortLikeError(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const groupFromURL = currentSearchParams.get("group");
  const subcategoryFromURL = currentSearchParams.get("subcategory");
  const producerFromURL = (currentSearchParams.get("producer") || "").trim() || null;
  const expandHierarchyFromURL = currentSearchParams.get("scope") === "hierarchy";
  const promoOnlyFromURL = currentSearchParams.get("promo") === "1";
  const lastFilterSignatureRef = useRef<string | null>(null);
  const lastStableSortedSignatureRef = useRef("");
  const selectedCarsRef = useRef(selectedCars);
  useEffect(() => { selectedCarsRef.current = selectedCars; }, [selectedCars]);
  const softTransitionStartedAtRef = useRef(0);
  const softTransitionHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastStableSortedEntries, setLastStableSortedEntries] = useState<CatalogSortedEntry[]>([]);
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
  const [hasAuthenticatedUser, setHasAuthenticatedUser] = useState(false);
  useEffect(() => {
    const syncStoredAuth = () => {
      try {
        setHasAuthenticatedUser(Boolean(localStorage.getItem("user_id")));
      } catch {
        setHasAuthenticatedUser(false);
      }
    };
    const handleAuthChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string | null }>).detail;
      setHasAuthenticatedUser(Boolean(detail?.uid));
    };

    syncStoredAuth();
    window.addEventListener("partson:authStateChange", handleAuthChange);
    return () => window.removeEventListener("partson:authStateChange", handleAuthChange);
  }, []);
  useEffect(() => {
    const checkStoredAdminFlag = () => {
      try {
        const uid = localStorage.getItem("user_id");
        if (uid && localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
          setIsAdmin(true);
          return true;
        }
      } catch {}
      return false;
    };

    if (checkStoredAdminFlag()) return;

    // This component mounts immediately on page load, so it can mount before
    // LayoutHost's async admin-role check (Firestore role lookup +
    // /api/is-admin) finishes and writes localStorage / fires the event
    // below — missing both. Poll briefly as a fallback so it still picks up
    // admin status once that resolves (same fix as ProductGallery.tsx).
    const retryTimers = [400, 1000, 2000, 4000].map((delay) =>
      window.setTimeout(checkStoredAdminFlag, delay)
    );
    return () => retryTimers.forEach((id) => window.clearTimeout(id));
  }, []);
  useEffect(() => {
    const handleAdminChange = (e: Event) => {
      const detail = (e as CustomEvent<{ isAdmin: boolean }>).detail;
      setIsAdmin(Boolean(detail?.isAdmin));
    };
    window.addEventListener("partson:adminStateChange", handleAdminChange);
    return () => window.removeEventListener("partson:adminStateChange", handleAdminChange);
  }, []);

  const getAdminToken = useCallback((): Promise<string | null> => getAdminIdToken(), []);

  const {
    filteredData,
    directMode,
    dataStartIndex,
    loadDirectPage,
    quantities,
    prices,
    costPrices,
    promoPrices,
    isPartner,
    hasPromoAvailability,
    promoPercentByKey,
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
    displayedPage,
    setDisplayedPage,
    handleFlip,
    handleQtyChange,
    handleAddToCart,
    handleRemoveFromCart,
    handleImageOpen,
    handleImageClose,
    loadNextPage,
    prefetchNextPageTriggerRef,
    prefetchVisibleCatalogPrices,
    prefetchVisibleCatalogImages,
    isLoadingNextPage,
    isRefetching,
    hasLoadedOnce,
    firstPageResolvedItemCount,
    filterLoading,
    setFilterLoading,
    updateCatalogItemPrice,
    updateCatalogItemFields,
    catalogTotalCount,
    correctedQuery,
    catalogQuerySignature,
    catalogReadyQuerySignature,
  } = useCatalogData({
    selectedCars,
    selectedCategories,
    rawSearchQuery,
    searchFilter,
    groupFromURL,
    subcategoryFromURL,
    producerFromURL,
    expandHierarchyFromURL,
    promoOnly: promoOnlyFromURL,
    sortOrder,
    pricedOnly,
    priceFrom,
    priceTo,
    inStock,
    includeCostPrices: isAdmin,
    includePartnerPrices: hasAuthenticatedUser,
    getAdminAuthToken: getAdminToken,
    initialPagePayload,
    initialQuerySignature,
    viewMode,
    suppressPagePrefetchRef: suppressPagePrefetchDuringJumpRef,
  });

  const router = useRouter();

  // "Скільки товарів на сторінці" is implemented as auto-chained 16-item
  // loads rather than a dynamic fetch limit — ITEMS_PER_PAGE is threaded
  // through cursor caching, hasMore heuristics and prefetch sizing in
  // useCatalogData (see its own comments on a past 12/16 SSR/CSR mismatch
  // bug), so changing it per-request risked reopening that class of bug.
  // Chaining N/16 calls to the existing, already-correct single-page loader
  // gets the same visible result without touching any of that.
  const pendingBatchStepsRef = useRef(0);
  const wasLoadingNextPageRef = useRef(isLoadingNextPage);
  // "Більше товарів" no longer advances the page — it grows this page's own
  // window instead, so the pager still reads the page you were on. Declared
  // here (rather than next to displayedPageBounds below, which uses it) so
  // the completion effect just below can reference its setter without a
  // forward-reference across the render.
  const [manualExtraItemCount, setManualExtraItemCount] = useState(0);
  // Set right before a page jump (next arrow, a page-number pill, or "last
  // page") has to fetch unseen data — once the fetch chain above fully
  // lands (or runs out of hasMore early, e.g. jumping to "last page" on a
  // catalog smaller than estimated), this flips the display to that page.
  // Render-time clamping (`clampedDisplayedPage`) protects against
  // overshoot if fewer pages actually loaded than requested.
  const pendingDisplayedPageTargetRef = useRef<number | null>(null);
  // Set by "Більше товарів" when it has to fetch before it can reveal more —
  // same fetch chain as a page jump, but the payoff is added to the current
  // page's window (manualExtraItemCount) instead of moving to a new page.
  const pendingManualExtraItemsRef = useRef(0);
  // Only set for a jump spanning more than one raw fetch (a numbered pill or
  // "last page" several pages ahead) — surfaces "Завантажую сторінку X з Y"
  // in place of the bare spinner so a long sequential-cursor jump reads as
  // progress instead of a stall. A plain single-page Next/Більше товарів
  // fetch never sets this; the small spinner already reads fine there.
  const [jumpTargetPage, setJumpTargetPage] = useState<number | null>(null);
  // The chain-completion effect that reacts to these lives further down,
  // after loadedPageCount exists — it needs to clamp against it. See there.

  useEffect(() => {
    pendingBatchStepsRef.current = 0;
    pendingDisplayedPageTargetRef.current = null;
    pendingManualExtraItemsRef.current = 0;
    suppressPagePrefetchDuringJumpRef.current = false;
    setJumpTargetPage(null);
  }, [catalogQuerySignature, pageBatchSize]);

  const handleLoadMoreClick = useCallback(() => {
    pendingBatchStepsRef.current = Math.max(0, Math.round(pageBatchSize / ITEMS_PER_PAGE) - 1);
    loadNextPage();
  }, [pageBatchSize, loadNextPage]);

  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = loadMoreButtonRef.current;
    if (!button || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          prefetchNextPageTriggerRef.current?.();
        }
      },
      { rootMargin: "1400px" }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [hasMore, loading, prefetchNextPageTriggerRef]);

  const handleAdminEdit = useCallback(
    async (
      code: string,
      article: string,
      data: { description?: string; priceEuro?: number; costPriceEuro?: number; imageDataUrl?: string; imageName?: string; name?: string; catalogNumber?: string; producer?: string; group?: string; subGroup?: string; category?: string; receipt?: number; sale?: number }
    ): Promise<{ ok: boolean; error?: string; quantity?: number }> => {
      const token = await getAdminToken();
      if (!token) return { ok: false, error: "Не авторизовано" };

      const { results } = await saveProductAdminFields(code, article, data, token);
      if (results.length === 0) return { ok: true };
      const failed = results.find((r) => !r.ok);

      // Update price in local cache using confirmed values from 1C
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
          Код: priceResult.Код || code,
          ЦінаПрод: priceResult.ЦінаПрод,
          ЦінаЗакуп: priceResult.ЦінаЗакуп,
          priceEuro: priceResult.priceEuro,
          costPriceEuro: priceResult.costPriceEuro,
        });
      }

      // Update local catalog item with all confirmed values from 1C
      if (!failed) {
        const updateResult = results.find((r) => r.ok);
        const confirmedName = updateResult?.name ?? data.name;
        const confirmedArticle = updateResult?.catalogNumber ?? data.catalogNumber;
        const fieldsToUpdate: { name?: string; article?: string; group?: string; subGroup?: string; category?: string; producer?: string } = {};
        if (confirmedName) fieldsToUpdate.name = confirmedName;
        if (confirmedArticle) fieldsToUpdate.article = confirmedArticle;
        if (data.group !== undefined) fieldsToUpdate.group = data.group;
        if (data.subGroup !== undefined) fieldsToUpdate.subGroup = data.subGroup;
        if (data.category !== undefined) fieldsToUpdate.category = data.category;
        if (data.producer !== undefined) fieldsToUpdate.producer = data.producer;
        if (Object.keys(fieldsToUpdate).length) {
          updateCatalogItemFields(code, fieldsToUpdate);
        }
        const qtyResult = results.find((r) => r.ok && r.quantity !== undefined);
        if (qtyResult?.quantity !== undefined) {
          updateCatalogItemFields(code, { quantity: qtyResult.quantity });
        }
        // Clear browser page cache so the next filter/scroll fetch hits 1C fresh.
        // router.refresh() is intentionally NOT called: it would trigger a slow
        // catalog re-fetch (empty cache → full 1C round-trip) and overwrite the
        // optimistic update that is already visible via updateCatalogItemFields above.
        clearBrowserCatalogCache();
        invalidateCatalogClientCache();
      }

      return failed ?? { ok: true, quantity: results.find((r) => r.ok && r.quantity !== undefined)?.quantity };
    },
    [getAdminToken, updateCatalogItemPrice, updateCatalogItemFields]
  );

  // Зберігає запит, для якого вже пробували прибрати римські цифри / шасі-код
  // (щоб не зациклюватись — кожен рівень пробується лише раз на кожен raw-запит).
  const romanNumeralFallbackAttemptedRef = useRef<string>("");
  const chassisCodeFallbackAttemptedRef = useRef<string>("");

  // Пошук за описом з моделлю авто, що містить генераційну римську цифру
  // (напр. "Golf IV") або код кузова в кінці (напр. "100 IV C4"), рідко
  // збігається дослівно з текстом опису товару — якщо точний запит не дав
  // нічого, пробуємо ще раз без римської цифри, а якщо і це не допомогло —
  // ще раз без кінцевого коду кузова. Той самий трирівневий підхід, що й у
  // getModelGroupBreakdown (app/lib/auto-directory-data.ts).
  useEffect(() => {
    if (!hasLoadedOnce || loading || error) return;
    if (searchFilter !== "description") return;

    if (
      filteredData.length > 0 ||
      firstPageResolvedItemCount > 0 ||
      (typeof catalogTotalCount === "number" && catalogTotalCount > 0)
    ) {
      return;
    }

    const raw = rawSearchQuery.trim();
    if (!raw) return;

    const redirectTo = (nextQuery: string) => {
      const params = new URLSearchParams(currentSearchParams.toString());
      params.set("search", nextQuery);
      router.replace(`/katalog?${params.toString()}`);
    };

    if (romanNumeralFallbackAttemptedRef.current !== raw) {
      romanNumeralFallbackAttemptedRef.current = raw;
      const stripped = stripRomanNumeralsFromModel(raw);
      if (stripped && stripped !== raw) {
        redirectTo(stripped);
        return;
      }
    }

    if (chassisCodeFallbackAttemptedRef.current !== raw) {
      chassisCodeFallbackAttemptedRef.current = raw;
      const stripped = stripTrailingChassisCode(raw);
      if (stripped && stripped !== raw) {
        redirectTo(stripped);
      }
    }
  }, [
    hasLoadedOnce,
    loading,
    error,
    searchFilter,
    filteredData.length,
    firstPageResolvedItemCount,
    catalogTotalCount,
    rawSearchQuery,
    currentSearchParams,
    router,
  ]);

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        search: rawSearchQuery.trim(),
        searchFilter,
        groupFromURL,
        subcategoryFromURL,
        producerFromURL,
        promoOnlyFromURL,
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
      promoOnlyFromURL,
      selectedCategories,
      selectedCars,
      sortOrder,
      pricedOnly,
      priceFrom,
      priceTo,
      inStock,
    ]
  );

  // Only depends on filteredData — building stableKey/priceKey is cheap
  // string work, but resolving each item's price (see getResolvedProductPriceEuro)
  // does Set construction + object lookups per item, and used to live in
  // this same map. That made the combined list rebuild on every one of the
  // many price-batch updates that resolve while scrolling, at a cost that
  // grows with the accumulated list — measured causing 100ms+ main-thread
  // blocks. Price resolution is now split out below, only when it's
  // actually needed for a price sort.
  const baseEntries = useMemo<CatalogSortedEntry[]>(
    () =>
      filteredData.map((item, index) => ({
        item,
        index,
        code: item.code,
        stableKey: getProductStableListKey(item),
        priceKey: getProductPriceStateKey(item),
        priceUAH: null,
        priceResolved: false,
      })),
    [filteredData]
  );
  const sortedEntries = useMemo(() => {
    // For "none" sort: preserve server order (1C already returns priced items first via
    // ORDER BY ЕстьЦена DESC). Sorting here would cause items to jump when new pages load.
    // It also needs nothing from `prices`, so returning baseEntries directly skips the
    // per-item price resolution entirely — each card resolves its own current price at
    // render time instead (see the fallback in the render loop below).
    if (sortOrder === "none") return baseEntries;

    // For asc/desc: sort all accumulated items so the user sees a globally-sorted list.
    const entries = baseEntries.map((entry) => {
      const item = entry.item;
      const inlineEuro =
        typeof item.priceEuro === "number" &&
        Number.isFinite(item.priceEuro) &&
        item.priceEuro > 0
          ? item.priceEuro
          : null;
      // hasResolvedProductPriceState() short-circuits on item.priceEuro/hasPrice before
      // touching lookup keys, same as the inlineEuro case below — only build them when a
      // prices-state lookup is actually needed. Previously this called
      // getResolvedProductPriceEuro() and hasResolvedProductPriceState() with no
      // precomputed keys, so each one independently rebuilt the same lookup-key Set —
      // duplicate work on every item, on every prices-batch update, across the whole
      // accumulated (unpaginated) list.
      const priceLookupKeys =
        inlineEuro == null && item.priceEuro !== null && item.hasPrice !== false
          ? Array.from(new Set([entry.priceKey, ...getProductPriceLookupKeys(item)].filter(Boolean)))
          : undefined;
      const euro = inlineEuro ?? getResolvedProductPriceEuro(item, prices, priceLookupKeys);
      return {
        ...entry,
        priceUAH: toPriceUAH(euro, euroRate),
        priceResolved: hasResolvedProductPriceState(item, prices, priceLookupKeys),
      };
    });

    const priceSortFn = (a: CatalogSortedEntry, b: CatalogSortedEntry) => {
      // 0 = confirmed has price, 1 = price status unknown (batch not loaded), 2 = confirmed no price
      const priceGroup = (e: CatalogSortedEntry) => {
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

    return entries.sort(priceSortFn);
  }, [baseEntries, prices, euroRate, sortOrder]);
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
    setLastStableSortedEntries(sortedEntries);
  }, [sortedEntries, sortedDataSignature]);
  const shouldKeepStableGrid =
    isLoadingNextPage &&
    lastStableSortedEntries.length > 0;
  // While the next page is loading, keep showing the previously captured
  // entries as-is instead of re-deriving price/key metadata for the whole
  // accumulated list from the latest `prices` state. That re-derive used to
  // run as a second full-list pass on top of `sortedEntries` above, and
  // since it's gated on `isLoadingNextPage` it fired on every page load
  // triggered by scrolling — a real, measured 100ms+ main-thread block per
  // page once the list grew past a couple hundred items.
  const accumulatedSortedEntries = shouldKeepStableGrid ? lastStableSortedEntries : sortedEntries;
  const accumulatedSortedData = useMemo(
    () => (shouldKeepStableGrid ? accumulatedSortedEntries.map((entry) => entry.item) : sortedData),
    [shouldKeepStableGrid, accumulatedSortedEntries, sortedData]
  );

  // Classic pagination is a display-only slice on top of the forward-only
  // cursor fetch above: everything fetched so far stays in
  // accumulatedSorted{Entries,Data}, and the arrows just move which
  // pageBatchSize-sized window of it is on screen — no re-fetch on "back".
  const effectivePageSize = pageBatchSize > 0 ? pageBatchSize : ITEMS_PER_PAGE;
  const hasKnownTotalCount =
    typeof catalogTotalCount === "number" && Number.isFinite(catalogTotalCount) && catalogTotalCount > 0;
  const totalPageCount = hasKnownTotalCount
    ? Math.max(1, Math.ceil((catalogTotalCount as number) / effectivePageSize))
    : null;
  const loadedPageCount = Math.max(1, Math.ceil((dataStartIndex + accumulatedSortedData.length) / effectivePageSize));
  const clampedDisplayedPage = totalPageCount
    ? Math.min(displayedPage, totalPageCount)
    : Math.min(displayedPage, loadedPageCount);
  // Resets manualExtraItemCount whenever the page itself actually changes
  // (number pill, arrow, page-size change), since extra items only make
  // sense in the context of one page.
  useEffect(() => {
    setManualExtraItemCount(0);
  }, [clampedDisplayedPage, effectivePageSize]);
  const displayedPageBounds = useMemo(() => {
    const start = (clampedDisplayedPage - 1) * effectivePageSize;
    return { start, end: start + effectivePageSize + manualExtraItemCount };
  }, [clampedDisplayedPage, effectivePageSize, manualExtraItemCount]);
  const visibleSortedEntries = useMemo(
    () => accumulatedSortedEntries.slice(Math.max(0, displayedPageBounds.start - dataStartIndex), Math.max(0, displayedPageBounds.end - dataStartIndex)),
    [accumulatedSortedEntries, displayedPageBounds, dataStartIndex]
  );
  const visibleSortedData = useMemo(
    () => accumulatedSortedData.slice(Math.max(0, displayedPageBounds.start - dataStartIndex), Math.max(0, displayedPageBounds.end - dataStartIndex)),
    [accumulatedSortedData, displayedPageBounds, dataStartIndex]
  );

  // Continue the cursor chain before paint. Keep the target operation active
  // until enough products for its entire display page have actually arrived.
  useIsomorphicLayoutEffect(() => {
    const wasLoading = wasLoadingNextPageRef.current;
    wasLoadingNextPageRef.current = isLoadingNextPage;
    if (!wasLoading || isLoadingNextPage) return;
    // Stop on an error; another click retries the failed cursor page rather
    // than advancing over it. The current visible page remains intact.
    const target = pendingDisplayedPageTargetRef.current;
    const targetItemCount = target === null ? 0 : Math.min(
      target * effectivePageSize,
      catalogTotalCount ?? Number.POSITIVE_INFINITY
    );
    const needsTargetItems = target !== null && accumulatedSortedData.length < targetItemCount;
    if ((needsTargetItems || (target === null && pendingBatchStepsRef.current > 0)) && hasMore && !error) {
      pendingBatchStepsRef.current = Math.max(0, pendingBatchStepsRef.current - 1);
      loadNextPage();
      return;
    }
    pendingBatchStepsRef.current = 0;
    setJumpTargetPage(null);
    suppressPagePrefetchDuringJumpRef.current = false;
    if (pendingManualExtraItemsRef.current > 0) {
      const extra = pendingManualExtraItemsRef.current;
      pendingManualExtraItemsRef.current = 0;
      setManualExtraItemCount((prev) => prev + extra);
      return;
    }
    if (pendingDisplayedPageTargetRef.current !== null) {
      const target = pendingDisplayedPageTargetRef.current;
      pendingDisplayedPageTargetRef.current = null;
      // catalogTotalCount can overstate how many pages the forward cursor
      // actually reaches (1C's own count vs. duplicate-page early-stopping,
      // see cursorDuplicateStreakRef above) — landing on a target beyond
      // what truly loaded left visibleSortedData slicing past the end of
      // accumulatedSortedData, i.e. an empty grid that looked like the
      // click had silently failed. Clamp to what's real.
      if (!error) setDisplayedPage(Math.min(target, loadedPageCount));
    }
  }, [isLoadingNextPage, hasMore, error, loadNextPage, setDisplayedPage, loadedPageCount,
    effectivePageSize, catalogTotalCount, accumulatedSortedData.length]);

  // "Більше товарів": reveal another effectivePageSize worth of items on the
  // *current* page instead of moving to the next one (unlike the Next arrow,
  // which advances clampedDisplayedPage). If enough is already loaded, this
  // is an instant, fetch-free reveal; otherwise it fetches first, the same
  // way a page jump does, and the completion effect above applies the extra
  // items once that lands.
  const handleLoadMoreItemsClick = useCallback(() => {
    if (loading || isLoadingNextPage) return;
    if (directMode) {
      void loadDirectPage(clampedDisplayedPage, effectivePageSize, true).then((result) => {
        if (result === "loaded") setManualExtraItemCount((previous) => previous + effectivePageSize);
      });
      return;
    }
    const neededLength = displayedPageBounds.end + effectivePageSize;
    if (accumulatedSortedData.length >= neededLength) {
      setManualExtraItemCount((prev) => prev + effectivePageSize);
      return;
    }
    if (!hasMore) {
      const remaining = accumulatedSortedData.length - displayedPageBounds.end;
      if (remaining > 0) setManualExtraItemCount((prev) => prev + remaining);
      return;
    }
    pendingBatchStepsRef.current = Math.max(0, Math.round(effectivePageSize / ITEMS_PER_PAGE) - 1);
    pendingManualExtraItemsRef.current = effectivePageSize;
    loadNextPage();
  }, [
    directMode, loadDirectPage, clampedDisplayedPage, effectivePageSize,
    loading,
    isLoadingNextPage,
    displayedPageBounds.end,
    accumulatedSortedData.length,
    hasMore,
    loadNextPage,
  ]);

  const handleNextPageClick = useCallback(() => {
    if (loading || isLoadingNextPage) return;
    if (directMode) { void loadDirectPage(clampedDisplayedPage + 1, effectivePageSize); return; }
    if (displayedPage < loadedPageCount) {
      setDisplayedPage((prev) => prev + 1);
      return;
    }
    if (hasMore) {
      pendingDisplayedPageTargetRef.current = clampedDisplayedPage + 1;
      setJumpTargetPage(clampedDisplayedPage + 1);
      handleLoadMoreClick();
    }
  }, [
    directMode, loadDirectPage, effectivePageSize,
    loading,
    isLoadingNextPage,
    displayedPage,
    loadedPageCount,
    hasMore,
    clampedDisplayedPage,
    handleLoadMoreClick,
    setDisplayedPage,
  ]);

  const handlePrevPageClick = useCallback(() => {
    if (directMode) { void loadDirectPage(Math.max(1, clampedDisplayedPage - 1), effectivePageSize); return; }
    setDisplayedPage((prev) => Math.max(1, prev - 1));
  }, [directMode, loadDirectPage, clampedDisplayedPage, effectivePageSize, setDisplayedPage]);

  // Request the target page directly when 1C confirms offset support.
  // Older 1C modules retain the forward-cursor fallback.
  const handleGoToPageClick = useCallback(
    async (targetPage: number) => {
      if (loading || isLoadingNextPage) return;
      const safeTarget = Math.max(1, Math.round(targetPage));
      if (!directMode && safeTarget <= loadedPageCount) {
        setDisplayedPage(safeTarget);
        return;
      }
      const directResult = await loadDirectPage(safeTarget, effectivePageSize);
      if (directResult !== "unsupported") return;
      if (!hasMore) {
        setDisplayedPage(loadedPageCount);
        return;
      }
      const pagesToLoad = safeTarget - loadedPageCount;
      const stepsPerBatch = Math.max(1, Math.round(effectivePageSize / ITEMS_PER_PAGE));
      pendingBatchStepsRef.current = pagesToLoad * stepsPerBatch - 1;
      pendingDisplayedPageTargetRef.current = safeTarget;
      setJumpTargetPage(safeTarget);
      suppressPagePrefetchDuringJumpRef.current = true;
      loadNextPage();
    },
    [
      directMode, loadDirectPage,
      loading,
      isLoadingNextPage,
      loadedPageCount,
      hasMore,
      effectivePageSize,
      loadNextPage,
      setDisplayedPage,
      setJumpTargetPage,
    ]
  );

  // Restores the page position from the URL's `?page=` on load — a hard
  // refresh or the browser's Back button both land here with the same URL
  // the user left, but with fresh React state (page 1). Waits for
  // hasLoadedOnce so handleGoToPageClick has a real loadedPageCount/hasMore
  // to clamp against, and runs at most once per mount.
  const restoredPageFromUrlRef = useRef(false);
  // Consumed by the scroll-on-page-change effect below: a restored page
  // wasn't reached by any click, so jumping the viewport down to the
  // results the instant the page finishes loading read as a random,
  // unprovoked scroll — exactly the "page suddenly throws itself down"
  // complaint, just on load instead of mid-session.
  const skipNextPageScrollRef = useRef(false);
  useEffect(() => {
    if (restoredPageFromUrlRef.current) return;
    if (!hasLoadedOnce) return;
    restoredPageFromUrlRef.current = true;
    const rawPage = Number(currentSearchParams.get("page"));
    if (Number.isFinite(rawPage) && rawPage > 1) {
      skipNextPageScrollRef.current = true;
      handleGoToPageClick(rawPage);
    }
  }, [hasLoadedOnce, currentSearchParams, handleGoToPageClick]);

  // Keeps `?page=` in sync with the visible page so a refresh or Back lands
  // on the same page instead of resetting to 1. Uses history.replaceState
  // directly rather than next/navigation's router.replace: the latter asks
  // the server for a fresh RSC payload on every call, which would add a
  // round-trip to every pagination click — exactly what this whole change
  // is trying to avoid. Skipped until the restore effect above has run, so
  // it never clobbers a deep-linked page with "1" first.
  const lastSyncedUrlPageRef = useRef<number | null>(null);
  useEffect(() => {
    if (!restoredPageFromUrlRef.current) return;
    if (lastSyncedUrlPageRef.current === clampedDisplayedPage) return;
    lastSyncedUrlPageRef.current = clampedDisplayedPage;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (clampedDisplayedPage > 1) {
      url.searchParams.set("page", String(clampedDisplayedPage));
    } else {
      url.searchParams.delete("page");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [clampedDisplayedPage]);

  // Reads the target page off the clicked button's dataset instead of an
  // inline `() => handleGoToPageClick(p)` closure per pill — react-hooks/refs
  // flags a fresh render-time closure over a ref-reading callback as an
  // "accessed during render" risk, even though it only ever runs from the
  // click event.
  const handlePageNumberButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const raw = event.currentTarget.dataset.page;
      if (!raw) return;
      handleGoToPageClick(Number(raw));
    },
    [handleGoToPageClick]
  );

  const canGoToPrevPage = clampedDisplayedPage > 1;
  const canGoToNextPage =
    !(loading || isLoadingNextPage || jumpTargetPage !== null) && (clampedDisplayedPage < loadedPageCount || hasMore);
  const isJumpingPages = loading || isLoadingNextPage || jumpTargetPage !== null;

  // Classic "1 … 4 5 6 … N" layout: page 1 and the last page are always
  // reachable as plain number pills (no separate first/last arrow buttons —
  // one fewer interactive element to get into a bad state), with up to 2
  // pages on each side of the current one in between, and a static "…"
  // marker (not a button) wherever the run is skipped.
  type PaginationItem = { type: "page"; page: number } | { type: "ellipsis"; key: string };
  const paginationItems = useMemo((): PaginationItem[] => {
    if (!totalPageCount) return [];
    if (totalPageCount <= 1) return [{ type: "page", page: 1 }];

    const windowStart = Math.max(2, clampedDisplayedPage - 2);
    const windowEnd = Math.min(totalPageCount - 1, clampedDisplayedPage + 2);

    const items: PaginationItem[] = [{ type: "page", page: 1 }];
    if (windowStart > 2) items.push({ type: "ellipsis", key: "start" });
    for (let p = windowStart; p <= windowEnd; p += 1) {
      if (p === 1 || p === totalPageCount) continue;
      items.push({ type: "page", page: p });
    }
    if (windowEnd < totalPageCount - 1) items.push({ type: "ellipsis", key: "end" });
    items.push({ type: "page", page: totalPageCount });
    return items;
  }, [clampedDisplayedPage, totalPageCount]);

  // Also fires on a filter/search/sort change (catalogQuerySignature), not
  // just a page-number switch — previously only pagination scrolled back to
  // the results, so changing a category/producer/search while scrolled down
  // on the current page left the (now entirely different) results loading
  // in below the fold instead of where you were looking. Both deps share
  // this one effect rather than two separate ones so a change that touches
  // both at once (e.g. a new filter also resetting the page to 1) still
  // only scrolls once, not twice.
  const isInitialDisplayedPageMountRef = useRef(true);
  useEffect(() => {
    if (isInitialDisplayedPageMountRef.current) {
      isInitialDisplayedPageMountRef.current = false;
      return;
    }
    if (skipNextPageScrollRef.current) {
      skipNextPageScrollRef.current = false;
      return;
    }
    if (typeof document === "undefined") return;
    document.getElementById("catalog-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clampedDisplayedPage, catalogQuerySignature]);

  // Changing "На сторінці" reshuffles what a "page" means (different window
  // size), so any page position from before the change is meaningless — back
  // to page 1 rather than showing a mismatched slice.
  const prevPageBatchSizeRef = useRef(pageBatchSize);
  useEffect(() => {
    if (prevPageBatchSizeRef.current === pageBatchSize) return;
    prevPageBatchSizeRef.current = pageBatchSize;
    if (directMode) void loadDirectPage(1, pageBatchSize);
    else setDisplayedPage(1);
  }, [pageBatchSize, directMode, loadDirectPage, setDisplayedPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDataLoading = loading || filterLoading;
    const totalCountForCurrentFilter =
      typeof catalogTotalCount === "number" && Number.isFinite(catalogTotalCount)
        ? catalogTotalCount
        : accumulatedSortedData.length;

    const win = window as Window & {
      __partsonCatalogVisibleCount?: number;
      __partsonCatalogVisibleSignature?: string;
      __partsonCatalogTotalCount?: number | null;
      __partsonCatalogTotalSignature?: string;
    };
    win.__partsonCatalogVisibleCount = visibleSortedData.length;
    win.__partsonCatalogVisibleSignature = filterSignature;
    win.__partsonCatalogTotalCount = totalCountForCurrentFilter;
    win.__partsonCatalogTotalSignature = filterSignature;
    window.dispatchEvent(
      new CustomEvent("partson:catalog-visible-count", {
        detail: { count: visibleSortedData.length, signature: filterSignature, loading: isDataLoading },
      })
    );
    window.dispatchEvent(
      new CustomEvent("partson:catalog-filter-total-count", {
        detail: { count: totalCountForCurrentFilter, signature: filterSignature, loading: isDataLoading },
      })
    );
  }, [
    catalogTotalCount,
    filterSignature,
    visibleSortedData.length,
    accumulatedSortedData.length,
    loading,
    filterLoading,
  ]);
  const analyticsList = useMemo(() => {
    const safeSearch = sanitizeAnalyticsSearchTerm(rawSearchQuery);

    if (safeSearch) {
      return {
        id: "catalog_search",
        name: `Пошук: ${safeSearch}`,
      };
    }
    if (promoOnlyFromURL) {
      return {
        id: "catalog_promo",
        name: "Акційні товари",
      };
    }
    if (producerFromURL) {
      return {
        id: "catalog_manufacturer",
        name: `Виробник: ${producerFromURL}`,
      };
    }
    if (subcategoryFromURL || groupFromURL || selectedCategories.length > 0) {
      const label =
        subcategoryFromURL ||
        groupFromURL ||
        selectedCategories.join(", ");
      return {
        id: "catalog_category",
        name: label ? `Категорія: ${label}` : "Категорія",
      };
    }
    if (selectedCars.length > 0) {
      return {
        id: "catalog_vehicle",
        name: "Підбір за авто",
      };
    }
    return { id: "catalog_all", name: "Каталог товарів" };
  }, [
    groupFromURL,
    producerFromURL,
    promoOnlyFromURL,
    rawSearchQuery,
    selectedCars.length,
    selectedCategories,
    subcategoryFromURL,
  ]);
  const catalogAnalyticsRef = useRef<{
    signature: string;
    viewedKeys: Set<string>;
  }>({ signature: "", viewedKeys: new Set() });
  const searchResultsAnalyticsSignatureRef = useRef("");

  useEffect(() => {
    if (catalogReadyQuerySignature !== catalogQuerySignature) return;
    if (loading || filterLoading || visibleSortedEntries.length === 0) return;

    if (catalogAnalyticsRef.current.signature !== catalogQuerySignature) {
      catalogAnalyticsRef.current = {
        signature: catalogQuerySignature,
        viewedKeys: new Set(),
      };
    }

    const newEntries = visibleSortedEntries
      .map((entry, displayIndex) => ({ entry, displayIndex }))
      .filter(({ entry }) => {
        const key = getProductStableListKey(entry.item);
        return key && !catalogAnalyticsRef.current.viewedKeys.has(key);
      });
    if (newEntries.length === 0) return;

    for (const { entry } of newEntries) {
      catalogAnalyticsRef.current.viewedKeys.add(
        getProductStableListKey(entry.item)
      );
    }

    pushEcommerceEvent("view_item_list", {
      currency: "UAH",
      item_list_id: analyticsList.id,
      item_list_name: analyticsList.name,
      items: newEntries.map(({ entry, displayIndex }) => {
        const resolvedPriceUAH = entry.priceUAH ?? getResolvedProductPriceUAH(entry.item, prices, euroRate);
        return {
          item_id: entry.item.code || entry.item.article,
          item_name: entry.item.name || "Товар",
          ...(entry.item.producer
            ? { item_brand: entry.item.producer }
            : {}),
          ...(entry.item.category
            ? { item_category: entry.item.category }
            : {}),
          ...(entry.item.group
            ? { item_category2: entry.item.group }
            : {}),
          ...(entry.item.subGroup
            ? { item_category3: entry.item.subGroup }
            : {}),
          ...(entry.item.article
            ? { item_variant: entry.item.article }
            : {}),
          item_list_id: analyticsList.id,
          item_list_name: analyticsList.name,
          index: displayIndex,
          ...(resolvedPriceUAH != null ? { price: resolvedPriceUAH } : {}),
          quantity: 1,
        };
      }),
    });
  }, [
    analyticsList.id,
    analyticsList.name,
    catalogQuerySignature,
    catalogReadyQuerySignature,
    euroRate,
    filterLoading,
    loading,
    prices,
    visibleSortedEntries,
  ]);

  useEffect(() => {
    const searchTerm = sanitizeAnalyticsSearchTerm(rawSearchQuery);
    if (!searchTerm) return;
    if (catalogReadyQuerySignature !== catalogQuerySignature) return;
    if (loading || filterLoading) return;
    if (
      searchResultsAnalyticsSignatureRef.current === catalogQuerySignature
    ) {
      return;
    }

    searchResultsAnalyticsSignatureRef.current = catalogQuerySignature;
    pushAnalyticsEvent("view_search_results", {
      search_term: searchTerm,
      search_filter: searchFilter,
      results_count:
        typeof catalogTotalCount === "number" &&
        Number.isFinite(catalogTotalCount)
          ? catalogTotalCount
          : visibleSortedData.length,
    });
  }, [
    catalogQuerySignature,
    catalogReadyQuerySignature,
    catalogTotalCount,
    filterLoading,
    loading,
    rawSearchQuery,
    searchFilter,
    visibleSortedData.length,
  ]);
  // Render the complete first visible row with direct image URLs in SSR HTML.
  // Those requests can start while React is still hydrating; cards below the
  // fold continue through the shared batch to avoid a request burst.
  const directCatalogImageKeys = useMemo(() => {
    if (catalogReadyQuerySignature !== catalogQuerySignature) return new Set<string>();
    const keys = visibleSortedData
      .filter((item) => item.hasPhoto !== false)
      .slice(0, viewMode === "list" ? IMAGE_EAGER_ITEMS_COUNT_LIST : IMAGE_EAGER_ITEMS_COUNT)
      .map((item) => buildProductImageBatchKey(item.code, item.article))
      .filter(Boolean);
    return new Set(keys);
  }, [catalogQuerySignature, catalogReadyQuerySignature, viewMode, visibleSortedData]);
  const visibleCatalogImageCandidates = useMemo(
    () =>
      catalogReadyQuerySignature === catalogQuerySignature
        ? visibleSortedData.filter((item) => {
            if (item.hasPhoto === false) return false;
            const key = buildProductImageBatchKey(item.code, item.article);
            return Boolean(key && !directCatalogImageKeys.has(key));
          })
        : [],
    [
      catalogQuerySignature,
      catalogReadyQuerySignature,
      directCatalogImageKeys,
      visibleSortedData,
    ]
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
    if (viewportWidth >= 640) return 2;
    return 1;
  }, [viewportWidth]);
  // List view's row height differs from the grid card's fixed 340-360px, and
  // the virtual window's spacer math assumes that fixed height — rather than
  // re-deriving it for a second layout, list mode simply renders unwindowed
  // (its rows are much shorter than a flip-card, so more of them mounted at
  // once is cheaper than in grid view anyway).
  const shouldUseVirtualWindow =
    viewMode === "grid" &&
    viewportWidth > 0 &&
    visibleSortedEntries.length >= VIRTUALIZATION_MIN_ITEMS;
  // A list row is a fraction of a grid card's height, so the same absolute
  // item count covers far less of the first viewport in list mode — eager/
  // high-priority thresholds tuned for a 2-4 column grid badly under-cover
  // list view's first screen (which fits 10+ rows), leaving genuinely
  // visible rows on lazy/auto priority instead of eager/high.
  const imageEagerItemsCount = viewMode === "list" ? IMAGE_EAGER_ITEMS_COUNT_LIST : IMAGE_EAGER_ITEMS_COUNT;
  const imageHighPriorityItemsCount = viewMode === "list" ? 3 : IMAGE_HIGH_PRIORITY_ITEMS_COUNT;
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
  // Appending a page must never start the full-grid transition. Previously
  // `isLoadingNextPage` enabled `isSoftTransitioning`; when the request ended,
  // the `!isLoadingNextPage` overlay condition became true for the remainder
  // of its minimum display time and produced a brief white flash over every
  // existing card. Keep the current grid fully stable and use only the compact
  // loader inside the "more products" button while a page is appended.
  const shouldUseSoftTransition = filterLoading || isRefetching;
  const showFilterTransitionOverlay =
    isSoftTransitioning && visibleSortedData.length > 0 && !isLoadingNextPage;
  const shouldDimCatalogGrid = false;
  const filterTransitionLabel = useMemo(() => {
    if (isLoadingNextPage) return "Підвантажую наступну сторінку";
    if (sortOrder === "asc") return "Сортую: спочатку дешевші";
    if (sortOrder === "desc") return "Сортую: спочатку дорожчі";
    if (subcategoryFromURL) return `Оновлюю підгрупу: ${subcategoryFromURL}`;
    if (groupFromURL) return `Оновлюю групу: ${groupFromURL}`;
    if (producerFromURL) return `Оновлюю виробника: ${producerFromURL}`;
    if (rawSearchQuery.trim()) return `Оновлюю результати для: ${rawSearchQuery.trim()}`;
    return "Оновлюю каталог";
  }, [groupFromURL, isLoadingNextPage, producerFromURL, rawSearchQuery, sortOrder, subcategoryFromURL]);

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
    // Cached sorting can resolve in one frame. Keep only the visual indicator
    // around briefly so the action still has clear feedback; products beneath
    // it are updated immediately and are not artificially delayed.
    const minVisibleMs = 420;
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

    const nextChunk = visibleCatalogImageCandidates.filter((item) => {
      const key = buildProductImageBatchKey(item.code, item.article);
      if (!key) return false;
      if (pageImages[key]) return false;
      if (pageImagePending[key]) return false;
      if (pageImageMissing[key]) return false;
      return true;
    });

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


  // Row height only changes when layout/content changes, not on every
  // scroll tick — measure it via ResizeObserver instead of inside the
  // scroll-driven loop below. getComputedStyle()/getBoundingClientRect()
  // force a synchronous style/layout recalc, and running that on every
  // animation frame during a fast scroll is what caused the scroll lag.
  useEffect(() => {
    if (typeof window === "undefined" || !shouldUseVirtualWindow) return;

    const measure = () => {
      const grid = catalogGridRef.current;
      if (!grid) return;
      const firstCard = grid.querySelector<HTMLElement>("[data-catalog-card='1']");
      if (!firstCard) return;

      const cardRect = firstCard.getBoundingClientRect();
      const gridStyle = window.getComputedStyle(grid);
      const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
      const measuredRowHeight = cardRect.height + rowGap;

      if (
        Number.isFinite(measuredRowHeight) &&
        measuredRowHeight >= 220 &&
        measuredRowHeight <= 520
      ) {
        setVirtualRowHeightPx((prev) =>
          Math.abs(measuredRowHeight - prev) > 1 ? measuredRowHeight : prev
        );
      }
    };

    measure();

    const grid = catalogGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure, { passive: true });
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [shouldUseVirtualWindow, gridColumnCount, visibleSortedEntries.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!shouldUseVirtualWindow) {
      const estimatedHeight = viewportWidth < 640 ? 372 : 358;
      setVirtualRowHeightPx(estimatedHeight);
      setVirtualWindowRange({
        startIndex: 0,
        endIndex: visibleSortedEntries.length,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
      });
      return;
    }

    let rafId = 0;
    const grid = catalogGridRef.current;
    if (!grid) return;
    let gridTop = window.scrollY + grid.getBoundingClientRect().top;

    // One-time measurement, taken when this effect (re-)runs — not inside
    // updateRange, which fires on every scroll tick and must stay free of
    // forced-layout reads (see the comment on the ResizeObserver effect
    // above). Without this, updateRange's very first call used the rough
    // VIRTUAL_ROW_ESTIMATED_HEIGHT_PX guess to size the top/bottom spacers,
    // then a moment later re-ran with the real height once the separate
    // ResizeObserver-driven effect corrected virtualRowHeightPx in state —
    // that correction resized the whole results container, which is what
    // measured live as a large, single Cumulative Layout Shift. Seeding the
    // first calculation with a real measurement (when a card already
    // exists to measure) removes that two-step "guess, then correct" jump.
    let effectiveRowHeightPx = virtualRowHeightPx;
    const firstCardForMeasurement = grid.querySelector<HTMLElement>("[data-catalog-card='1']");
    if (firstCardForMeasurement) {
      const cardRect = firstCardForMeasurement.getBoundingClientRect();
      const gridStyle = window.getComputedStyle(grid);
      const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
      const measuredRowHeight = cardRect.height + rowGap;
      if (
        Number.isFinite(measuredRowHeight) &&
        measuredRowHeight >= 220 &&
        measuredRowHeight <= 520
      ) {
        effectiveRowHeightPx = measuredRowHeight;
      }
    }

    const refreshGridTop = () => {
      gridTop = window.scrollY + grid.getBoundingClientRect().top;
    };

    const updateRange = () => {
      const totalItems = visibleSortedEntries.length;
      const columns = Math.max(1, gridColumnCount);
      const totalRows = Math.ceil(totalItems / columns);
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const rowHeight = Math.max(1, effectiveRowHeightPx);
      const overscanPx = VIRTUAL_OVERSCAN_ROWS * rowHeight;

      const rawStartRow = Math.floor(
        (viewportTop - gridTop - overscanPx) / rowHeight
      );
      const rawEndRow = Math.ceil(
        (viewportBottom - gridTop + overscanPx) / rowHeight
      );

      // Keep at least the final row mounted after the viewport passes below
      // the grid. Clamping to `totalRows` produced an empty slice; the safety
      // fallback then mounted the *entire* catalog at once near the footer,
      // causing a severe pause on fast downward and reverse scrolling.
      const clampedStartRow = Math.max(
        0,
        Math.min(Math.max(0, totalRows - 1), rawStartRow)
      );
      const clampedEndRow = Math.max(
        clampedStartRow + 1,
        Math.min(totalRows, rawEndRow)
      );
      const startRow = Math.max(
        0,
        Math.floor(clampedStartRow / VIRTUAL_WINDOW_STEP_ROWS) *
          VIRTUAL_WINDOW_STEP_ROWS
      );
      const endRow = Math.min(
        totalRows,
        Math.ceil(clampedEndRow / VIRTUAL_WINDOW_STEP_ROWS) *
          VIRTUAL_WINDOW_STEP_ROWS
      );

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
    const handleResize = () => {
      refreshGridTop();
      scheduleUpdate();
    };
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", handleResize);
    };
  }, [
    gridColumnCount,
    shouldUseVirtualWindow,
    viewportWidth,
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
        {!loading && correctedQuery && (
          <p role="status" className="mb-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-slate-700">
            За запитом «{rawSearchQuery}» збігів немає. Показуємо результати для «{correctedQuery}».
          </p>
        )}
        {!loading && error && (
          <div className="text-center text-red-500 mb-4">{error}</div>
        )}

        {/* The page's h1 lives above this component (/katalog's own
            sr-only heading), and the SEO copy block below the grid has the
            page's first visible h2 — without this, the DOM order was
            h1 → h3 (every ProductCard title) → h2, skipping past h2 before
            one existed. sr-only so it doesn't add visible chrome above the
            grid. */}
        {shouldShowCatalogGrid && (
          <h2 className="sr-only">Товари каталогу</h2>
        )}

        {shouldShowCatalogGrid && (
          <div className="relative">
            <div
              ref={catalogGridRef}
              className={`${viewMode === "list" ? CATALOG_LIST_CLASS : CATALOG_GRID_CLASS} ${
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
                // Resolving a price against `prices` involves building this same
                // key set (getResolvedProductPriceEuro / hasResolvedProductPriceState
                // each build their own copy). Computing it once per card and passing
                // it through avoids four redundant Set() constructions per item on
                // every render — real, measurable cost multiplied across every
                // visible card each time a price batch resolves during scroll.
                const priceLookupKeysOnly = getProductPriceLookupKeys(item);
                const priceLookupKeys = Array.from(
                  new Set([entry.priceKey, ...priceLookupKeysOnly].filter(Boolean))
                );
                const priceUAH =
                  entry.priceUAH ?? getResolvedProductPriceUAH(item, prices, euroRate, priceLookupKeys);
                const statePromoPriceEuro = isPartner
                  ? getResolvedProductPromoPriceEuro(item, promoPrices, priceLookupKeys)
                  : null;
                const candidatePromoPriceUAH = toPriceUAH(statePromoPriceEuro, euroRate);
                const promoPriceUAH =
                  candidatePromoPriceUAH != null &&
                  (priceUAH == null || candidatePromoPriceUAH < priceUAH)
                    ? candidatePromoPriceUAH
                    : null;
                const hasPromo =
                  hasPromoAvailability[entry.priceKey] === true ||
                  priceLookupKeys.some((key) => hasPromoAvailability[key] === true);
                const promoPercent =
                  promoPercentByKey[entry.priceKey] ??
                  priceLookupKeys
                    .map((key) => promoPercentByKey[key])
                    .find((value) => typeof value === "number") ??
                  null;
                if (!item?.code) return null;

                const code = item.code;
                const qty = quantities[code] ?? 1;
                const cartQty = cartMap[code] ?? 0;
                const absoluteIndex = effectiveVirtualWindowStartIndex + index;
                const hasResolvedPriceState = hasResolvedProductPriceState(item, prices, priceLookupKeys);
                const isKnownNoPrice =
                  hasResolvedPriceState && getResolvedProductPriceEuro(item, prices, priceLookupKeys) === null;
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

                        for (const lookupKey of priceLookupKeysOnly) {
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
                  promoPriceUAH != null || priceUAH != null
                    ? "ready"
                    : isKnownNoPrice
                      ? "request"
                      : "loading";
                const shouldPrioritizeImage =
                  absoluteIndex < imageHighPriorityItemsCount;
                const shouldEagerLoadImage = absoluteIndex < imageEagerItemsCount;
                const imageBatchKey = buildProductImageBatchKey(item.code, item.article);
                const shouldDirectLoadImage = Boolean(
                  imageBatchKey && directCatalogImageKeys.has(imageBatchKey)
                );
                const prefetchedImageSrc =
                  (imageBatchKey ? pageImages[imageBatchKey] : null) ?? null;
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
                    className={`min-w-0 ${
                      shouldAnimateList && absoluteIndex < 12
                        ? "catalog-card-reveal"
                        : ""
                    }`}
                    style={
                      shouldAnimateList && absoluteIndex < 12
                        ? ({ "--catalog-reveal-index": absoluteIndex } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {viewMode === "list" ? (
                      <ProductListRow
                        item={item}
                        productHref={productHref}
                        qty={qty}
                        cartQty={cartQty}
                        priceUAH={priceUAH}
                        promoPriceUAH={promoPriceUAH}
                        isPartner={isPartner}
                        hasPromo={hasPromo}
                        promoPercent={promoPercent}
                        priceStatus={priceStatus}
                        imageLoadingMode={shouldEagerLoadImage ? "eager" : "lazy"}
                        imageFetchPriority={shouldPrioritizeImage ? "high" : "auto"}
                        prefetchedImageSrc={prefetchedImageSrc}
                        batchImagePending={Boolean(imageBatchKey && pageImagePending[imageBatchKey])}
                        batchImageMissing={
                          Boolean(imageBatchKey && pageImageMissing[imageBatchKey])
                        }
                        batchImageOnly={Boolean(imageBatchKey && !shouldDirectLoadImage)}
                        isAdmin={isAdmin}
                        costPriceUAH={isAdmin && stateCostPriceEuro != null ? Math.round(stateCostPriceEuro * euroRate) : null}
                        costPriceEuro={isAdmin ? stateCostPriceEuro : undefined}
                        onAdminEdit={isAdmin ? (data) => handleAdminEdit(code, item.article || "", data) : undefined}
                        onAddToCart={handleAddToCart}
                        onRequestPrice={handleRequestPriceForItem}
                        onRemoveFromCart={handleRemoveFromCart}
                        onQtyChange={handleQtyChange}
                        onImageOpen={handleImageOpen}
                      />
                    ) : (
                      <ProductCard
                        item={item}
                        productHref={productHref}
                        qty={qty}
                        cartQty={cartQty}
                        priceUAH={priceUAH}
                        promoPriceUAH={promoPriceUAH}
                        isPartner={isPartner}
                        hasPromo={hasPromo}
                        promoPercent={promoPercent}
                        costPriceUAH={isAdmin && stateCostPriceEuro != null ? Math.round(stateCostPriceEuro * euroRate) : null}
                        costPriceEuro={isAdmin ? stateCostPriceEuro : undefined}
                        isAdmin={isAdmin}
                        onAdminEdit={isAdmin ? (data) => handleAdminEdit(code, item.article || "", data) : undefined}
                        priceStatus={priceStatus}
                        analyticsListId={analyticsList.id}
                        analyticsListName={analyticsList.name}
                        analyticsIndex={absoluteIndex}
                        imageLoadingMode={shouldEagerLoadImage ? "eager" : "lazy"}
                        imageFetchPriority={shouldPrioritizeImage ? "high" : "auto"}
                        prefetchedImageSrc={prefetchedImageSrc}
                        batchImagePending={Boolean(imageBatchKey && pageImagePending[imageBatchKey])}
                        batchImageMissing={
                          Boolean(imageBatchKey && pageImageMissing[imageBatchKey])
                        }
                        batchImageOnly={Boolean(imageBatchKey && !shouldDirectLoadImage)}
                        isFlipped={flippedCard === code}
                        motionEnabled={shouldAnimateList}
                        onAddToCart={handleAddToCart}
                        onRequestPrice={handleRequestPriceForItem}
                        onRemoveFromCart={handleRemoveFromCart}
                        onQtyChange={handleQtyChange}
                        onFlip={handleFlip}
                        onImageOpen={handleImageOpen}
                      />
                    )}
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
                // Before the very first successful fetch, this slot picks up
                // right after KatalogClientPage's own CatalogStateLoader (same
                // "Завантажую каталог" wording, same box height) — matching
                // both keeps that handoff from reading as two different
                // loaders flashing in sequence. Once real data has loaded at
                // least once, a filter/sort change re-showing this skeleton
                // switches to the specific filterTransitionLabel instead,
                // since that's a status update for an action the user just
                // took, not part of the initial-load handoff.
                <CatalogTransitionLoader
                  label={hasLoadedOnce ? filterTransitionLabel : "Завантажую каталог"}
                />
              )}

              {showInlineLoader && (
                <CatalogTransitionLoader label="Підвантажую товари" compact />
              )}
            </div>

            {showFilterTransitionOverlay && (
              <div className="catalog-transition-overlay pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-[24px] bg-white/46 px-4 py-5 backdrop-blur-[1px]">
                <div className="catalog-loader-card inline-flex min-w-[250px] items-center gap-3.5 rounded-[19px] border border-sky-100/90 bg-white/96 px-4 py-3.5 shadow-[0_18px_46px_rgba(14,165,233,0.16)] ring-1 ring-white/90">
                  <span className="catalog-modern-loader" aria-hidden="true"><i /><b /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black leading-tight text-slate-700">{filterTransitionLabel}</span>
                    <span className="catalog-loader-line mt-2 block" aria-hidden="true" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {!shouldShowInitialSkeleton && visibleSortedData.length > 0 && (
          <div
            className="flex w-full flex-wrap items-center justify-center gap-3 px-1 pt-3 sm:pt-4"
            aria-live="polite"
          >
            <div className="catalog-view-controls inline-flex items-center gap-1 rounded-[16px] border border-cyan-200/70 bg-[linear-gradient(150deg,#ffffff_0%,#f0fbff_55%,#eefdf6_100%)] p-1.5 shadow-[0_10px_26px_rgba(14,165,233,0.14),inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div
                role="group"
                aria-label="Вигляд каталогу"
                className="inline-flex items-center gap-0.5 rounded-[12px] bg-white/70 p-0.5 ring-1 ring-inset ring-sky-100"
              >
                <button
                  type="button"
                  onClick={() => onViewModeChange?.("grid")}
                  aria-pressed={viewMode === "grid"}
                  title="Сітка"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-[background,color,box-shadow] duration-200 ${
                    viewMode === "grid"
                      ? "bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] text-white shadow-[0_5px_12px_rgba(2,132,199,0.38)]"
                      : "text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                  }`}
                >
                  <LayoutGrid size={15} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange?.("list")}
                  aria-pressed={viewMode === "list"}
                  title="Список"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-[background,color,box-shadow] duration-200 ${
                    viewMode === "list"
                      ? "bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] text-white shadow-[0_5px_12px_rgba(2,132,199,0.38)]"
                      : "text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                  }`}
                >
                  <List size={15} strokeWidth={2.4} />
                </button>
              </div>

              <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-sky-100" />

              <label className="inline-flex items-center gap-1.5 rounded-[12px] bg-white/70 py-0.5 pl-2.5 pr-0.5 text-[11.5px] font-black uppercase tracking-[0.03em] text-sky-800 ring-1 ring-inset ring-sky-100">
                На сторінці
                <select
                  value={pageBatchSize}
                  onChange={(e) => onPageBatchSizeChange?.(Number(e.target.value))}
                  className="h-8 cursor-pointer rounded-[10px] border-0 bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] px-2 text-[12.5px] font-black text-white shadow-[0_5px_12px_rgba(2,132,199,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                  <option value={48}>48</option>
                </select>
              </label>
            </div>

            {hasKnownTotalCount && (
              <div
                className="catalog-page-indicator inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[14px] border border-cyan-200/70 bg-[linear-gradient(150deg,#ffffff_0%,#f0fbff_55%,#eefdf6_100%)] p-1 shadow-[0_8px_20px_rgba(14,165,233,0.12),inset_0_1px_0_rgba(255,255,255,0.85)]"
                role="group"
                aria-label="Перемикання сторінок каталогу"
              >
                <button
                  type="button"
                  onClick={handlePrevPageClick}
                  disabled={!canGoToPrevPage || isJumpingPages}
                  title="Попередня сторінка"
                  aria-label="Попередня сторінка"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/70 text-sky-700 ring-1 ring-inset ring-sky-100 transition-[background,color,box-shadow] duration-200 hover:bg-sky-50 hover:text-sky-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={15} strokeWidth={2.6} />
                </button>

                <div className="flex shrink-0 items-center justify-center gap-1.5" aria-live="polite">
                  {
                    paginationItems.map((item) =>
                      item.type === "ellipsis" ? (
                        <span
                          key={item.key}
                          aria-hidden="true"
                          className="inline-flex h-7 w-3.5 shrink-0 items-end justify-center pb-1 text-[11px] font-black text-slate-400"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={item.page}
                          type="button"
                          data-page={item.page}
                          onClick={handlePageNumberButtonClick}
                          disabled={isJumpingPages}
                          aria-current={item.page === clampedDisplayedPage ? "page" : undefined}
                          title={`Сторінка ${item.page}`}
                          className={`inline-flex h-7 min-w-[26px] shrink-0 items-center justify-center rounded-[9px] px-1 text-[11.5px] font-black tabular-nums transition-[background,color,box-shadow] duration-200 ${
                            item.page === clampedDisplayedPage
                              ? "bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] text-white shadow-[0_4px_10px_rgba(2,132,199,0.38)]"
                              : "text-slate-500 hover:bg-sky-50 hover:text-sky-700 disabled:pointer-events-none disabled:opacity-40"
                          }`}
                        >
                          {item.page}
                        </button>
                      )
                    )
                  }
                </div>

                <button
                  ref={loadMoreButtonRef}
                  type="button"
                  onClick={handleNextPageClick}
                  disabled={!canGoToNextPage}
                  title="Наступна сторінка"
                  aria-label="Наступна сторінка"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/70 text-sky-700 ring-1 ring-inset ring-sky-100 transition-[background,color,box-shadow] duration-200 hover:bg-sky-50 hover:text-sky-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight size={15} strokeWidth={2.6} />
                </button>
              </div>
            )}

            {(jumpTargetPage !== null || isLoadingNextPage) && (
              <span role="status" className="inline-flex items-center gap-2 text-xs font-semibold text-sky-700">
                <span className="catalog-modern-loader catalog-modern-loader-small" aria-hidden="true"><i /><b /></span>
                {jumpTargetPage !== null
                  ? `Завантажую сторінку ${jumpTargetPage} · отримано ${loadedPageCount} стор.`
                  : "Завантажую товари…"}
              </span>
            )}

            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMoreItemsClick}
                disabled={loading || isLoadingNextPage}
                className="inline-flex min-h-11 w-auto min-w-[200px] max-w-full items-center justify-center gap-2 rounded-[15px] border border-cyan-200/70 bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_100%)] px-5 py-2.5 text-[13px] font-black text-white shadow-[0_10px_26px_rgba(2,132,199,0.32)] transition-[filter,box-shadow] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40 disabled:cursor-wait disabled:opacity-60 sm:min-w-[220px] sm:text-sm"
              >
                {isLoadingNextPage ? (
                  <>
                    <span className="catalog-modern-loader catalog-modern-loader-small" aria-hidden="true"><i /><b /></span>
                    <span>Готую наступні товари</span>
                  </>
                ) : (
                  <>
                    <ChevronsDown size={17} strokeWidth={2.6} />
                    <span>Більше товарів</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {showEmptyState && (
          <div className="relative col-span-full overflow-hidden rounded-[26px] border border-white bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.95)_48%,rgba(248,250,252,0.98))] shadow-[0_18px_46px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80">
            <span className="pointer-events-none absolute inset-x-10 top-0 z-10 h-[3px] rounded-b-full bg-gradient-to-r from-transparent via-sky-500 to-cyan-400 shadow-[0_4px_18px_rgba(14,165,233,0.4)]" />
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-sky-100 bg-[linear-gradient(145deg,#f0f9ff,#e0f2fe)] text-sky-700 shadow-[0_12px_26px_rgba(14,165,233,0.16),inset_0_1px_0_white]">
                  <SearchX size={20} />
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
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-[15px] border border-sky-300/50 bg-[linear-gradient(135deg,#0284c7,#2563eb)] px-5 py-2.5 text-sm font-black text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 active:scale-[0.98] sm:w-auto"
              >
                <MessageCircle size={16} aria-hidden />
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
                                                          
