"use client";

import { createAbortError } from "app/lib/catalog-request-lifecycle";
import { CATALOG_PAGE_CACHE_VERSION } from "app/lib/catalog-client-cache";
import {
  PRICE_CACHE_PREFIX,
  PRICE_NEGATIVE_CACHE_TTL_MS,
  PRICE_CACHE_TTL_MS,
  PRICE_PERSISTED_CACHE_TTL_MS,
  PRICE_STALE_POSITIVE_CACHE_TTL_MS,
  getProductPriceStateKey,
  getProductPriceLookupKeys,
  toPriceUAH,
  PAGE_MEMORY_CACHE_MAX_ENTRIES,
  normalizePriceKey,
  ITEMS_PER_PAGE,
  PAGE_SESSION_CACHE_INDEX_KEY,
  MEMORY_CACHE_TTL_MS_NEXT_PAGES,
  PAGE_SESSION_CACHE_MAX_ENTRIES,
  normalizeProduct
} from "./catalog-model";
import type { Product, PageCacheEntry, CatalogPagePayload, PageSessionCacheIndexEntry } from "./catalog-model";

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
  batch: Array<{ stateKey: string; lookupKeys: string[] }>,
  accessScope = ""
) =>
  JSON.stringify({
    mode,
    accessScope: mode === "fast" ? undefined : accessScope,
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

export { writeCachedPriceEntry, readCachedPriceEntry, readStalePositivePriceEntry, mergePagePricesIntoCache, buildPriceBatchRequestKey, inFlightPriceBatchRequests, mergePageImagesIntoCache, normalizeCacheString, normalizeCacheList, normalizeOptionalCacheString, inFlightPageRequests, readPageFromSession, normalizePagePriceMap, normalizePageImageMap, normalizePageHasMore, normalizePageCursor, writePageToMemory, writePageToSession, readPageFromMemory, abortControllerSafely, normalizeFilterToken, getResolvedProductPriceEuro, getResolvedProductPromoPriceEuro, hasResolvedProductPriceState, getResolvedProductPriceUAH };

export type { PriceBatchResult };
