import { NextResponse } from "next/server";

import {
  fetchCatalogProductsByQuery,
  type CatalogProduct,
  type CatalogSearchFilter,
} from "app/lib/catalog-server";

export const dynamic = "force-dynamic";

const COUNT_PAGE_LIMIT = 500;
const COUNT_MAX_PAGES = 40;
const COUNT_TIME_BUDGET_MS = 8500;
const COUNT_CACHE_TTL_MS = 1000 * 60 * 10;

type CountCacheEntry = {
  expiresAt: number;
  value: CatalogSearchCountPayload;
};

type CatalogSearchCountPayload = {
  totalCount: number;
  exact: boolean;
};

const countCache = new Map<string, CountCacheEntry>();
const inFlightCounts = new Map<string, Promise<CatalogSearchCountPayload>>();

const normalizeString = (value: string | null) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeSearchFilter = (value: string | null): CatalogSearchFilter => {
  if (
    value === "article" ||
    value === "name" ||
    value === "code" ||
    value === "producer" ||
    value === "description"
  ) {
    return value;
  }

  return "all";
};

const getProductCountKey = (item: CatalogProduct) => {
  const code = normalizeString(item.code).toLowerCase();
  const article = normalizeString(item.article).toLowerCase();
  const name = normalizeString(item.name).toLowerCase();
  const producer = normalizeString(item.producer).toLowerCase();

  return code || article || `${name}:${producer}`;
};

const buildCountCacheKey = (params: URLSearchParams) =>
  JSON.stringify({
    search: normalizeString(params.get("search")),
    filter: normalizeSearchFilter(params.get("filter")),
    group: normalizeString(params.get("group")),
    subcategory: normalizeString(params.get("subcategory")),
    producer: normalizeString(params.get("producer")),
    hierarchy: normalizeString(params.get("scope")) === "hierarchy",
    cars: params.getAll("car").map(normalizeString).filter(Boolean).sort(),
    categories: params.getAll("category").map(normalizeString).filter(Boolean).sort(),
    pricedOnly: params.get("pricedOnly") === "1",
    priceFrom: normalizeString(params.get("priceFrom")),
    priceTo: normalizeString(params.get("priceTo")),
    inStock: params.get("inStock") === "1",
  });

const getFreshCache = (key: string) => {
  const cached = countCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    countCache.delete(key);
    return null;
  }
  return cached.value;
};

const fetchSearchCount = async (
  params: URLSearchParams
): Promise<CatalogSearchCountPayload> => {
  const startedAt = Date.now();
  const searchQuery = normalizeString(params.get("search"));
  const searchFilter = normalizeSearchFilter(params.get("filter"));
  const group = normalizeString(params.get("group")) || null;
  const subcategory = normalizeString(params.get("subcategory")) || null;
  const producer = normalizeString(params.get("producer")) || null;
  const expandHierarchy = normalizeString(params.get("scope")) === "hierarchy";
  const selectedCars = params.getAll("car").map(normalizeString).filter(Boolean);
  const selectedCategories = params.getAll("category").map(normalizeString).filter(Boolean);
  const pricedOnly = params.get("pricedOnly") === "1";
  const priceFromRaw = Number(params.get("priceFrom"));
  const priceFrom = Number.isFinite(priceFromRaw) && priceFromRaw > 0 ? priceFromRaw : null;
  const priceToRaw = Number(params.get("priceTo"));
  const priceTo = Number.isFinite(priceToRaw) && priceToRaw > 0 ? priceToRaw : null;
  const inStock = params.get("inStock") === "1";
  const seenProducts = new Set<string>();
  const seenCursors = new Set<string>();

  const hasAnyFilter =
    Boolean(searchQuery) ||
    selectedCars.length > 0 ||
    selectedCategories.length > 0 ||
    Boolean(group) ||
    Boolean(subcategory) ||
    Boolean(producer) ||
    pricedOnly ||
    priceFrom !== null ||
    priceTo !== null ||
    inStock;

  if (!hasAnyFilter) {
    return { totalCount: 0, exact: true };
  }

  let cursor = "";
  let cursorField = "";
  let exact = true;
  let duplicatePageStreak = 0;

  for (let page = 1; page <= COUNT_MAX_PAGES; page += 1) {
    if (Date.now() - startedAt > COUNT_TIME_BUDGET_MS) {
      exact = false;
      break;
    }

    const pageResult = await fetchCatalogProductsByQuery({
      page,
      limit: COUNT_PAGE_LIMIT,
      cursor,
      cursorField,
      selectedCars,
      selectedCategories,
      searchQuery,
      searchFilter,
      group,
      subcategory,
      producer,
      expandHierarchy,
      sortOrder: "none",
      timeoutMs: 5200,
      retries: 0,
      retryDelayMs: 80,
      cacheTtlMs: COUNT_CACHE_TTL_MS,
      includePriceEnrichment: false,
      preferLegacySource: false,
      forceAllgoodsSource: true,
      pricedItemsOnly: pricedOnly,
      priceFrom,
      priceTo,
      onlyInStock: inStock,
    });

    // 1C повертає total_count одразу на allgoods-джерелі — немає сенсу пагінувати далі.
    // Car-filtered queries never go through allgoods (see canUseAllgoods in
    // catalog-server.ts), so this branch simply won't trigger for them.
    if (
      page === 1 &&
      !cursor &&
      typeof pageResult.totalCount === "number" &&
      Number.isFinite(pageResult.totalCount) &&
      pageResult.totalCount >= 0
    ) {
      return { totalCount: Math.floor(pageResult.totalCount), exact: true };
    }

    let newItems = 0;
    for (const item of pageResult.items) {
      const key = getProductCountKey(item);
      if (!key || seenProducts.has(key)) continue;
      seenProducts.add(key);
      newItems += 1;
    }

    duplicatePageStreak = newItems > 0 ? 0 : duplicatePageStreak + 1;

    if (!pageResult.hasMore) {
      break;
    }

    if (duplicatePageStreak >= 2) {
      exact = false;
      break;
    }

    // The legacy car-filtered 1C source (getdata) paginates by page number/
    // offset instead of a cursor, so an empty nextCursor here is expected —
    // just advance to the next page; the for-loop's `page` increment drives
    // the next offset internally. Only cursor-based sources (allgoods) need
    // the cursor threaded through explicitly.
    const nextCursor = normalizeString(pageResult.nextCursor);
    if (nextCursor) {
      const nextCursorField = normalizeString(pageResult.cursorField || cursorField);
      if (seenCursors.has(`${nextCursorField}:${nextCursor}`)) {
        exact = false;
        break;
      }
      seenCursors.add(`${nextCursorField}:${nextCursor}`);
      cursor = nextCursor;
      cursorField = nextCursorField;
    } else {
      cursor = "";
      cursorField = "";
    }

    if (page === COUNT_MAX_PAGES) {
      exact = false;
    }
  }

  return {
    totalCount: seenProducts.size,
    exact,
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cacheKey = buildCountCacheKey(url.searchParams);
  const cached = getFreshCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    });
  }

  const existing = inFlightCounts.get(cacheKey);
  const countPromise = existing ?? fetchSearchCount(url.searchParams);
  if (!existing) {
    inFlightCounts.set(cacheKey, countPromise);
  }

  try {
    const value = await countPromise;
    countCache.set(cacheKey, {
      expiresAt: Date.now() + COUNT_CACHE_TTL_MS,
      value,
    });

    return NextResponse.json(value, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    });
  } finally {
    inFlightCounts.delete(cacheKey);
  }
}
