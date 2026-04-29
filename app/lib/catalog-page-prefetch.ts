"use client";

const CATALOG_PAGE_ROUTE = "/api/catalog-page";
const CATALOG_ITEMS_PER_PAGE = 12;
const CATALOG_PAGE_CACHE_VERSION = "catalog-page:v18-description-all-words";

type CatalogSearchFilter = "all" | "article" | "name" | "code" | "producer" | "description";

const VALID_SEARCH_FILTERS = new Set<CatalogSearchFilter>([
  "all",
  "article",
  "name",
  "code",
  "producer",
  "description",
]);

const catalogPagePrefetchInFlight = new Map<string, Promise<void>>();

const normalizeOptionalValue = (value: string | null | undefined) => {
  const trimmed = (value || "").trim();
  return trimmed || null;
};

const normalizeSearchFilter = (value: string | null | undefined): CatalogSearchFilter => {
  const normalized = (value || "").trim().toLowerCase();
  if (VALID_SEARCH_FILTERS.has(normalized as CatalogSearchFilter)) {
    return normalized as CatalogSearchFilter;
  }
  return "all";
};

const buildCatalogPageCacheKey = (params: {
  page: number;
  searchQuery: string;
  searchFilter: CatalogSearchFilter;
  group: string | null;
  subcategory: string | null;
  producer: string | null;
}) =>
  JSON.stringify({
    endpoint: CATALOG_PAGE_CACHE_VERSION,
    page: params.page,
    limit: CATALOG_ITEMS_PER_PAGE,
    cursor: "",
    cursorField: "",
    q: params.searchQuery,
    filter: params.searchFilter,
    cars: [],
    cats: [],
    group: params.group,
    subcat: params.subcategory,
    producer: params.producer,
    sort: "none",
  });

const hasCatalogPageSessionCache = (cacheKey: string) => {
  if (typeof window === "undefined") return false;

  try {
    return Boolean(window.sessionStorage.getItem(cacheKey));
  } catch {
    return false;
  }
};

const writeCatalogPageSessionCache = (cacheKey: string, payload: unknown) => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota issues.
  }
};

export const prefetchCatalogListing = async (href: string) => {
  if (typeof window === "undefined") return;

  let targetUrl: URL;
  try {
    targetUrl = new URL(href, window.location.origin);
  } catch {
    return;
  }

  if (targetUrl.pathname !== "/katalog") return;

  const searchQuery = (targetUrl.searchParams.get("search") || "").replace(/\s+/g, " ").trim();
  const searchFilter = normalizeSearchFilter(targetUrl.searchParams.get("filter"));
  const group = normalizeOptionalValue(targetUrl.searchParams.get("group"));
  const subcategory = normalizeOptionalValue(targetUrl.searchParams.get("subcategory"));
  const producer = normalizeOptionalValue(targetUrl.searchParams.get("producer"));
  const cacheKey = buildCatalogPageCacheKey({
    page: 1,
    searchQuery,
    searchFilter,
    group,
    subcategory,
    producer,
  });

  if (hasCatalogPageSessionCache(cacheKey)) {
    return;
  }

  const existing = catalogPagePrefetchInFlight.get(cacheKey);
  if (existing) {
    await existing;
    return;
  }

  const requestPromise = (async () => {
    const response = await fetch(CATALOG_PAGE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: 1,
        limit: CATALOG_ITEMS_PER_PAGE,
        selectedCars: [],
        selectedCategories: [],
        searchQuery,
        searchFilter,
        group: group || "",
        subcategory: subcategory || "",
        producer: producer || "",
      }),
      cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) return;

    const payload = (await response.json().catch(() => null)) as
      | {
          items?: unknown[];
          prices?: Record<string, number | null>;
          images?: Record<string, string>;
          hasMore?: boolean;
          nextCursor?: string;
        }
      | null;

    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return;

    writeCatalogPageSessionCache(cacheKey, {
      items: payload.items,
      prices:
        payload.prices && typeof payload.prices === "object" ? payload.prices : {},
      images:
        payload.images && typeof payload.images === "object" ? payload.images : {},
      hasMore: payload.hasMore === true,
      nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : "",
    });
  })().finally(() => {
    catalogPagePrefetchInFlight.delete(cacheKey);
  });

  catalogPagePrefetchInFlight.set(cacheKey, requestPromise);
  await requestPromise;
};
