import { NextResponse } from "next/server";

import {
  fetchCatalogProductsByQuery,
  fetchPriceEuroMapByLookupKeys,
  type CatalogProduct,
  type CatalogSearchFilter,
} from "app/lib/catalog-server";
import {
  fetchProductImageBase64Batch,
} from "app/lib/product-image";

export const runtime = "nodejs";

const CATALOG_PAGE_IMAGE_PREWARM_COUNT = 10;
const CATALOG_PAGE_RESPONSE_CACHE_TTL_MS = 1000 * 20;
const CATALOG_PAGE_RESPONSE_STALE_TTL_MS = 1000 * 60 * 5;
const CATALOG_PAGE_SOURCE_TIMEOUT_MS = 9000;
const CATALOG_PAGE_IMAGE_PREWARM_OPTIONS = {
  timeoutMs: 1150,
  retries: 0,
  retryDelayMs: 80,
  cacheTtlMs: 1000 * 60 * 20,
  missCacheTtlMs: 1000 * 10,
  allowUrlDownload: true,
  skipMissCache: true,
  batchConcurrency: 6,
  maxKeys: CATALOG_PAGE_IMAGE_PREWARM_COUNT * 4,
};
const CATALOG_PAGE_PRICE_SOURCE_TIMEOUT_MS = 1800;
const CATALOG_PAGE_PRICE_LOOKUP_TIMEOUT_MS = 2100;
const CATALOG_PAGE_PRICE_CACHE_TTL_MS = 1000 * 60 * 5;
type CatalogPageRequestPayload = {
  page?: number;
  limit?: number;
  cursor?: string | null;
  selectedCars?: string[];
  selectedCategories?: string[];
  searchQuery?: string;
  searchFilter?: CatalogSearchFilter;
  group?: string | null;
  subcategory?: string | null;
  producer?: string | null;
  sortOrder?: "none" | "asc" | "desc";
};

type CatalogPageResponsePayload = {
  items: CatalogProduct[];
  prices: Record<string, number | null>;
  images: Record<string, string>;
  hasMore?: boolean;
  nextCursor?: string;
  serviceUnavailable?: boolean;
  message?: string;
};

const catalogPageResponseCache = new Map<
  string,
  {
    freshUntil: number;
    staleUntil: number;
    payload: CatalogPageResponsePayload;
  }
>();
const catalogPageInFlight = new Map<string, Promise<CatalogPageResponsePayload>>();
const CATALOG_PAGE_UNAVAILABLE_MESSAGE =
  "Каталог тимчасово недоступний: немає з'єднання з 1С. Спробуйте оновити сторінку трохи пізніше.";

type CatalogCursorPayload = {
  cursor: string;
  searchField?: string | null;
};

const getProductPriceStateKey = (item: Pick<CatalogProduct, "code" | "article">) =>
  (item.code || item.article || "").trim();

const getProductPriceLookupKeys = (item: Pick<CatalogProduct, "code" | "article">) =>
  Array.from(
    new Set([(item.article || "").trim(), (item.code || "").trim()].filter(Boolean))
  );

const getProductImageLookupKeys = (item: Pick<CatalogProduct, "code" | "article">) =>
  Array.from(
    new Set([(item.code || "").trim(), (item.article || "").trim()].filter(Boolean))
  );

const resolveInlineCatalogPagePrices = (items: CatalogProduct[]) => {
  const prices: Record<string, number | null> = {};

  for (const item of items) {
    const stateKey = getProductPriceStateKey(item);
    if (!stateKey) continue;

    const inlinePrice =
      typeof item.priceEuro === "number" &&
      Number.isFinite(item.priceEuro) &&
      item.priceEuro > 0
        ? item.priceEuro
        : null;

    prices[stateKey] = inlinePrice;
  }

  return prices;
};

const getInlineCatalogItemPrice = (item: CatalogProduct) =>
  typeof item.priceEuro === "number" &&
  Number.isFinite(item.priceEuro) &&
  item.priceEuro > 0
    ? item.priceEuro
    : null;

const sortCatalogItemsForResponse = (
  items: CatalogProduct[],
  sortOrder: CatalogPageRequestPayload["sortOrder"]
) =>
  items
    .map((item, index) => ({
      item,
      index,
      price: getInlineCatalogItemPrice(item),
    }))
    .sort((a, b) => {
      const aHasPrice = a.price != null ? 0 : 1;
      const bHasPrice = b.price != null ? 0 : 1;
      if (aHasPrice !== bHasPrice) return aHasPrice - bHasPrice;

      if (sortOrder === "asc" && a.price != null && b.price != null) {
        if (a.price !== b.price) return a.price - b.price;
      }

      if (sortOrder === "desc" && a.price != null && b.price != null) {
        if (a.price !== b.price) return b.price - a.price;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);

const resolveCatalogPagePrices = async (items: CatalogProduct[]) => {
  const prices: Record<string, number | null> = {};
  const lookupKeys = new Set<string>();

  for (const item of items) {
    const stateKey = getProductPriceStateKey(item);
    if (!stateKey) continue;

    const inlinePrice =
      typeof item.priceEuro === "number" &&
      Number.isFinite(item.priceEuro) &&
      item.priceEuro > 0
        ? item.priceEuro
        : null;

    if (inlinePrice != null) {
      prices[stateKey] = inlinePrice;
      continue;
    }

    for (const lookupKey of getProductPriceLookupKeys(item)) {
      lookupKeys.add(lookupKey);
    }
  }

  if (lookupKeys.size === 0) {
    return prices;
  }

  const resolvedPriceMap = await fetchPriceEuroMapByLookupKeys(Array.from(lookupKeys), {
    sourceTimeoutMs: CATALOG_PAGE_PRICE_SOURCE_TIMEOUT_MS,
    sourceCacheTtlMs: CATALOG_PAGE_PRICE_CACHE_TTL_MS,
    includeDirectLookup: true,
    includePricesPost: false,
    timeoutMs: CATALOG_PAGE_PRICE_LOOKUP_TIMEOUT_MS,
    retries: 1,
    retryDelayMs: 120,
    cacheTtlMs: CATALOG_PAGE_PRICE_CACHE_TTL_MS,
    directConcurrency: 8,
    maxKeys: Math.max(items.length * 3, 48),
  }).catch(() => ({} as Record<string, number>));

  for (const item of items) {
    const stateKey = getProductPriceStateKey(item);
    if (!stateKey || Object.prototype.hasOwnProperty.call(prices, stateKey)) continue;

    const matchedPrice = getProductPriceLookupKeys(item)
      .map((lookupKey) => resolvedPriceMap[lookupKey.toLowerCase()] ?? null)
      .find(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value) && value > 0
      );

    if (matchedPrice != null) {
      prices[stateKey] = matchedPrice;
    }
  }

  return prices;
};

const encodeCatalogCursor = (payload: CatalogCursorPayload) => {
  const cursor = payload.cursor.trim();
  if (!cursor) return "";

  return Buffer.from(
    JSON.stringify({
      cursor,
      searchField: payload.searchField?.trim() || "",
    }),
    "utf8"
  ).toString("base64url");
};

const decodeCatalogCursor = (value: string | null | undefined): CatalogCursorPayload => {
  const cursor = (value || "").trim();
  if (!cursor) {
    return { cursor: "", searchField: null };
  }

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return {
      cursor: typeof parsed?.cursor === "string" ? parsed.cursor.trim() : "",
      searchField:
        typeof parsed?.searchField === "string" && parsed.searchField.trim()
          ? parsed.searchField.trim()
          : null,
    };
  } catch {
    return { cursor, searchField: null };
  }
};

const normalizePayload = (payload: unknown): CatalogPageRequestPayload => {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const asStringArray = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
      : [];

  const asPositiveInt = (value: unknown, fallback: number) => {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
    return Math.floor(normalized);
  };

  const searchFilter = (() => {
    const value = typeof record.searchFilter === "string" ? record.searchFilter : "all";
    return ["all", "article", "name", "code", "producer"].includes(value)
      ? (value as CatalogSearchFilter)
      : "all";
  })();

  return {
    page: asPositiveInt(record.page, 1),
    limit: asPositiveInt(record.limit, 10),
    cursor: typeof record.cursor === "string" ? record.cursor.trim() : "",
    selectedCars: asStringArray(record.selectedCars),
    selectedCategories: asStringArray(record.selectedCategories),
    searchQuery:
      typeof record.searchQuery === "string" ? record.searchQuery.replace(/\s+/g, " ").trim() : "",
    searchFilter,
    group: typeof record.group === "string" ? record.group.trim() : "",
    subcategory: typeof record.subcategory === "string" ? record.subcategory.trim() : "",
    producer: typeof record.producer === "string" ? record.producer.trim() : "",
    sortOrder:
      record.sortOrder === "asc" || record.sortOrder === "desc"
        ? record.sortOrder
        : "none",
  };
};

const buildCatalogPageCacheKey = (payload: CatalogPageRequestPayload) =>
  JSON.stringify({
    page: payload.page ?? 1,
    limit: payload.limit ?? 10,
    cursor: payload.cursor ?? "",
    selectedCars: payload.selectedCars ?? [],
    selectedCategories: payload.selectedCategories ?? [],
    searchQuery: payload.searchQuery ?? "",
    searchFilter: payload.searchFilter ?? "all",
    group: payload.group ?? "",
    subcategory: payload.subcategory ?? "",
    producer: payload.producer ?? "",
    sortOrder: payload.sortOrder ?? "none",
  });

const getCachedCatalogPageResponse = (key: string) => {
  const cached = catalogPageResponseCache.get(key);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    catalogPageResponseCache.delete(key);
    return null;
  }
  if (cached.freshUntil <= Date.now()) {
    return null;
  }
  return cached.payload;
};

const getStaleCatalogPageResponse = (key: string) => {
  const cached = catalogPageResponseCache.get(key);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    catalogPageResponseCache.delete(key);
    return null;
  }
  return cached.payload;
};

const setCachedCatalogPageResponse = (
  key: string,
  payload: CatalogPageResponsePayload
) => {
  catalogPageResponseCache.set(key, {
    freshUntil: Date.now() + CATALOG_PAGE_RESPONSE_CACHE_TTL_MS,
    staleUntil: Date.now() + CATALOG_PAGE_RESPONSE_STALE_TTL_MS,
    payload,
  });
};

const mergeResolvedPricesIntoCatalogPageCache = (
  key: string,
  resolvedPrices: Record<string, number | null>
) => {
  if (Object.keys(resolvedPrices).length === 0) return;

  const cached = getStaleCatalogPageResponse(key);
  if (!cached) return;

  let didChange = false;
  const nextPrices = { ...(cached.prices ?? {}) };

  for (const [priceKey, priceValue] of Object.entries(resolvedPrices)) {
    if (
      typeof priceValue === "number" &&
      Number.isFinite(priceValue) &&
      priceValue > 0 &&
      nextPrices[priceKey] !== priceValue
    ) {
      nextPrices[priceKey] = priceValue;
      didChange = true;
    }
  }

  if (!didChange) return;

  setCachedCatalogPageResponse(key, {
    ...cached,
    prices: nextPrices,
  });
};

const prewarmCatalogImages = async (items: CatalogProduct[]) => {
  const lookupKeys = Array.from(
    new Set(
      items
        .filter((item) => item.hasPhoto !== false)
        .slice(0, CATALOG_PAGE_IMAGE_PREWARM_COUNT)
        .flatMap((item) => getProductImageLookupKeys(item))
    )
  );

  if (lookupKeys.length === 0) return;

  await fetchProductImageBase64Batch(lookupKeys, CATALOG_PAGE_IMAGE_PREWARM_OPTIONS).catch(
    () => ({} as Record<string, string>)
  );
};

const buildUnavailableCatalogPageResponse = (
  message = CATALOG_PAGE_UNAVAILABLE_MESSAGE
): CatalogPageResponsePayload => ({
  items: [],
  prices: {},
  images: {},
  hasMore: false,
  nextCursor: "",
  serviceUnavailable: true,
  message,
});

const buildCatalogPageJsonResponse = (
  payload: CatalogPageResponsePayload,
  status = 200
) =>
  NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "public, max-age=10, s-maxage=10, stale-while-revalidate=40",
    },
  });

const refreshCatalogPageResponse = (
  cacheKey: string,
  payload: CatalogPageRequestPayload
) => {
  const existing = catalogPageInFlight.get(cacheKey);
  if (existing) return existing;

  const responsePromise: Promise<CatalogPageResponsePayload> = (async () => {
    const decodedCursor = decodeCatalogCursor(payload.cursor);
    const pageResult = await fetchCatalogProductsByQuery({
      ...payload,
      cursor: decodedCursor.cursor,
      cursorField: decodedCursor.searchField,
      sortOrder: payload.sortOrder,
      timeoutMs: CATALOG_PAGE_SOURCE_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 0,
      cacheTtlMs: 1000 * 10,
    });

    const items = sortCatalogItemsForResponse(pageResult.items, payload.sortOrder);
    const nextCursor =
      pageResult.hasMore && pageResult.nextCursor
        ? encodeCatalogCursor({
            cursor: pageResult.nextCursor,
            searchField: pageResult.cursorField ?? null,
          })
        : "";

    const responsePayload: CatalogPageResponsePayload = {
      items,
      prices: resolveInlineCatalogPagePrices(items),
      images: {},
      hasMore: pageResult.hasMore,
      nextCursor,
    };

    setCachedCatalogPageResponse(cacheKey, responsePayload);

    if (items.length > 0) {
      void prewarmCatalogImages(items);
      if ((payload.selectedCars ?? []).length > 0) {
        void resolveCatalogPagePrices(items)
          .then((resolvedPrices) => {
            mergeResolvedPricesIntoCatalogPageCache(cacheKey, resolvedPrices);
          })
          .catch(() => undefined);
      }
    }

    return responsePayload;
  })().finally(() => {
    catalogPageInFlight.delete(cacheKey);
  });

  catalogPageInFlight.set(cacheKey, responsePromise);
  return responsePromise;
};

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return buildCatalogPageJsonResponse({ items: [], prices: {}, images: {} });
  }

  const normalizedPayload = normalizePayload(payload);
  const cacheKey = buildCatalogPageCacheKey(normalizedPayload);
  const staleCached = getStaleCatalogPageResponse(cacheKey);
  const cached = getCachedCatalogPageResponse(cacheKey);
  if (cached) {
    if (cached.items.length > 0) {
      void prewarmCatalogImages(cached.items);
    }
    return buildCatalogPageJsonResponse(cached);
  }

  if (staleCached) {
    void refreshCatalogPageResponse(cacheKey, normalizedPayload).catch(() => undefined);
    if (staleCached.items.length > 0) {
      void prewarmCatalogImages(staleCached.items);
    }
    return buildCatalogPageJsonResponse(staleCached);
  }

  const responsePayload = await refreshCatalogPageResponse(
    cacheKey,
    normalizedPayload
  ).catch(() => null);
  if (!responsePayload) {
    const unavailablePayload = buildUnavailableCatalogPageResponse();
    setCachedCatalogPageResponse(cacheKey, unavailablePayload);
    return buildCatalogPageJsonResponse(unavailablePayload);
  }

  return buildCatalogPageJsonResponse(responsePayload);
}
