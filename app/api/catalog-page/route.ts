import { NextResponse } from "next/server";

import { resolvePersistentCatalogImageMap } from "app/lib/catalog-persistent-images";
import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import type { CatalogProduct } from "app/lib/catalog-server";

type CatalogPageApiPayload = {
  items: CatalogProduct[];
  prices: Record<string, number | null>;
  images: Record<string, string>;
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string;
  totalCount?: number | null;
  serviceUnavailable?: boolean;
  message?: string;
  stale?: boolean;
};

const ROUTE_SUCCESS_CACHE_TTL_MS = 1000 * 60 * 10;
const ROUTE_SUCCESS_STALE_TTL_MS = 1000 * 60 * 240;
const ROUTE_SUCCESS_STALE_TIGHT_FILTER_TTL_MS = 1000 * 60 * 90;
const CATALOG_ROUTE_RESPONSE_TIMEOUT_MS = 9000;

type RouteSuccessCacheEntry = {
  freshUntil: number;
  staleUntil: number;
  value: CatalogPageApiPayload;
};

const routeSuccessCache = new Map<string, RouteSuccessCacheEntry>();
const routeInFlightRequests = new Map<string, Promise<CatalogPageApiPayload>>();

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const toNonNegativeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  "й":"q","ц":"w","у":"e","к":"r","е":"t","н":"y","г":"u","ш":"i","щ":"o","з":"p",
  "ф":"a","і":"s","в":"d","а":"f","п":"g","р":"h","о":"j","л":"k","д":"l",
  "я":"z","ч":"x","с":"c","м":"v","и":"b","т":"n","ь":"m",
};

// Converts Cyrillic (UA keyboard layout) → Latin, then strips everything except letters, digits, and /
const normalizeArticleQuery = (query: string): string =>
  query
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? "")
    .replace(/[^a-z0-9/]/g, "");

const buildRouteCacheKey = (body: Record<string, unknown>) => {
  const rawFilter =
    body.searchFilter === "article" ||
    body.searchFilter === "name" ||
    body.searchFilter === "code" ||
    body.searchFilter === "producer" ||
    body.searchFilter === "description"
      ? body.searchFilter
      : "all";
  const effectiveFilter = rawFilter === "article" ? "name" : rawFilter;
  const rawSearch = toTrimmedString(body.searchQuery);
  const effectiveSearch = rawFilter === "article" ? normalizeArticleQuery(rawSearch) : rawSearch;
  return JSON.stringify({
    source: "catalog-page:v29-photo-flag-only",
    page: toPositiveInt(body.page, 1),
    limit: toPositiveInt(body.limit, 10),
    cursor: toTrimmedString(body.cursor),
    cursorField: toTrimmedString(body.cursorField),
    selectedCars: toStringArray(body.selectedCars),
    selectedCategories: toStringArray(body.selectedCategories),
    searchQuery: effectiveSearch,
    searchFilter: effectiveFilter,
    group: toTrimmedString(body.group),
    subcategory: toTrimmedString(body.subcategory),
    producer: toTrimmedString(body.producer),
    hierarchy: body.expandHierarchy === true,
    sortOrder:
      body.sortOrder === "asc" || body.sortOrder === "desc"
        ? body.sortOrder
        : "none",
    pricedOnly: body.pricedOnly === true,
    priceFrom: toNonNegativeNumber(body.priceFrom),
    priceTo: toNonNegativeNumber(body.priceTo),
    inStock: body.inStock === true,
  });
};

const pruneRouteSuccessCache = () => {
  const now = Date.now();
  for (const [key, entry] of routeSuccessCache.entries()) {
    if (!entry || entry.staleUntil <= now) {
      routeSuccessCache.delete(key);
    }
  }
};

const getRouteCacheEntry = (key: string) => {
  const entry = routeSuccessCache.get(key);
  if (!entry) return null;
  if (entry.staleUntil <= Date.now()) {
    routeSuccessCache.delete(key);
    return null;
  }
  return entry;
};

const getFreshRouteCacheValue = (key: string) => {
  const entry = getRouteCacheEntry(key);
  if (!entry || entry.freshUntil <= Date.now()) return null;
  return entry.value;
};

const getStaleRouteCacheValue = (key: string) => getRouteCacheEntry(key)?.value ?? null;

const buildStaleCatalogPayload = (payload: CatalogPageApiPayload): CatalogPageApiPayload => ({
  ...payload,
  stale: true,
  serviceUnavailable: false,
  message: "",
});

const withPersistentCatalogImages = async (
  payload: CatalogPageApiPayload
): Promise<CatalogPageApiPayload> => {
  const images = await resolvePersistentCatalogImageMap(payload.items);
  return {
    ...payload,
    // `images` is derived from the current persistent cache. Replacing it
    // prevents a URL stored in the route response cache from surviving image
    // invalidation merely because it existed in an older payload.
    images,
  };
};

const CATALOG_ROUTE_TIMEOUT_RESULT = Symbol("catalog-route-timeout");

const awaitCatalogPayloadWithinBudget = async (
  promise: Promise<CatalogPageApiPayload>,
  timeoutMs: number
) => {
  const result = await Promise.race<
    CatalogPageApiPayload | typeof CATALOG_ROUTE_TIMEOUT_RESULT
  >([
    promise,
    new Promise<typeof CATALOG_ROUTE_TIMEOUT_RESULT>((resolve) => {
      setTimeout(() => resolve(CATALOG_ROUTE_TIMEOUT_RESULT), timeoutMs);
    }),
  ]);

  if (result === CATALOG_ROUTE_TIMEOUT_RESULT) {
    return null;
  }

  return result;
};

const sanitizeCatalogErrorMessage = (value: string | null | undefined) => {
  const raw = (value || "").trim();
  if (!raw) return "";

  if (/<\s*html|<\s*!doctype|<\s*script|<\s*body/i.test(raw)) {
    return "";
  }

  const stripped = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return "";

  if (
    /catalog\s+getdata\s+failed|request\s+timeout|timed?\s*out|timeout after/i.test(
      stripped
    )
  ) {
    return "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043F\u0435\u0440\u0435\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u0438\u0439. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437 \u0447\u0435\u0440\u0435\u0437 \u043A\u0456\u043B\u044C\u043A\u0430 \u0441\u0435\u043A\u0443\u043D\u0434.";
  }

  return stripped.length > 220 ? `${stripped.slice(0, 220)}...` : stripped;
};

function buildInlinePrices(
  items: Array<{ code?: string; article?: string; priceEuro?: number | null }>
): Record<string, number | null> {
  const prices: Record<string, number | null> = {};

  const normalizeKey = (value: string | undefined) =>
    (value || "").replace(/\s+/g, " ").trim().toLowerCase();

  for (const item of items) {
    const price = item?.priceEuro;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const code = normalizeKey(item.code);
    const article = normalizeKey(item.article);

    if (code && prices[code] === undefined) {
      prices[code] = price;
    }
    if (article && prices[article] === undefined) {
      prices[article] = price;
    }
  }

  return prices;
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  let routeCacheKey = "";

  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    routeCacheKey = buildRouteCacheKey(body);
    pruneRouteSuccessCache();

    const cacheHit = getFreshRouteCacheValue(routeCacheKey);
    if (cacheHit) {
      return NextResponse.json(await withPersistentCatalogImages(cacheHit), {
        headers: { "cache-control": "private, max-age=60, stale-while-revalidate=600" },
      });
    }

    const staleCacheHit = getStaleRouteCacheValue(routeCacheKey);

    const rawSearchQuery = toTrimmedString(body.searchQuery);
    const searchFilterValue =
      body.searchFilter === "article" ||
      body.searchFilter === "name" ||
      body.searchFilter === "code" ||
      body.searchFilter === "producer" ||
      body.searchFilter === "description"
        ? body.searchFilter
        : "all";
    const effectiveSearchFilter = searchFilterValue === "article" ? "name" : searchFilterValue;
    const normalizedSearchQuery = searchFilterValue === "article"
      ? normalizeArticleQuery(rawSearchQuery)
      : rawSearchQuery;
    const normalizedGroup = toTrimmedString(body.group);
    const normalizedSubcategory = toTrimmedString(body.subcategory);
    const normalizedProducer = toTrimmedString(body.producer);
    const expandHierarchy = body.expandHierarchy === true;
    const normalizedSelectedCategories = toStringArray(body.selectedCategories);
    const isDescriptionSearch =
      body.searchFilter === "description" && Boolean(normalizedSearchQuery);
    const hasTightFilterContext = Boolean(
      normalizedSearchQuery ||
        normalizedGroup ||
        normalizedSubcategory ||
        normalizedProducer ||
        expandHierarchy ||
        normalizedSelectedCategories.length > 0
    );

    // Catalog browsing without car binding should prefer the complete allgoods feed.
    // Keep getdata as fallback and as the only source for selectedCars queries.
    const timeoutMs = isDescriptionSearch
      ? 5200
      : hasTightFilterContext
        ? 4200
        : 3600;
    const retries = 0;
    const retryDelayMs = hasTightFilterContext ? 80 : 150;
    const cacheTtlMs = hasTightFilterContext ? 1000 * 60 * 8 : 1000 * 60 * 5;
    const staleTtlMs = hasTightFilterContext
      ? ROUTE_SUCCESS_STALE_TIGHT_FILTER_TTL_MS
      : ROUTE_SUCCESS_STALE_TTL_MS;

    const queryBase = {
      page: toPositiveInt(body.page, 1),
      limit: toPositiveInt(body.limit, 10),
      cursor: toTrimmedString(body.cursor),
      cursorField: toTrimmedString(body.cursorField),
      selectedCars: toStringArray(body.selectedCars),
      selectedCategories: normalizedSelectedCategories,
      searchQuery: normalizedSearchQuery,
      searchFilter: effectiveSearchFilter,
      group: normalizedGroup,
      subcategory: normalizedSubcategory,
      producer: normalizedProducer,
      expandHierarchy,
      sortOrder:
        body.sortOrder === "asc" || body.sortOrder === "desc"
          ? body.sortOrder
          : "none",
      pricedOnly: body.pricedOnly === true,
      priceFrom: toNonNegativeNumber(body.priceFrom),
      priceTo: toNonNegativeNumber(body.priceTo),
      inStock: body.inStock === true,
    } as const;

    const toApiPayload = (result: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>>) => {
      const items = result.items;
      return {
        items,
        prices: buildInlinePrices(items),
        images: {},
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        cursorField: result.cursorField || "",
        totalCount: result.totalCount ?? null,
      };
    };

    const runQuery = async (runtime: {
      timeoutMs: number;
      retries: number;
      retryDelayMs: number;
      cacheTtlMs: number;
    }) => {
      const canUseCompleteAllgoodsCatalog = queryBase.selectedCars.length === 0;
      const shouldUseCursorBackedSource =
        Boolean(queryBase.cursor || queryBase.cursorField) ||
        Boolean(queryBase.searchQuery) ||
        queryBase.pricedOnly ||
        queryBase.priceFrom !== null ||
        queryBase.priceTo !== null ||
        queryBase.sortOrder !== "none" ||
        isDescriptionSearch;

      const runAllgoodsQuery = () =>
        fetchCatalogProductsByQuery({
          ...queryBase,
          // Contract from 1C НайтиТовары/ПолучитьТоварыПакетом:
          // ЦенаОт/ЦенаДо and СортировкаПоЦене work independently from
          // ТолькоСЦеной. Do not force ТолькоСЦеной for every price control:
          // some 1C bases return an empty page for that flag while still
          // supporting range/sort parameters.
          sortOrder: queryBase.sortOrder,
          timeoutMs: runtime.timeoutMs,
          retries: runtime.retries,
          retryDelayMs: runtime.retryDelayMs,
          cacheTtlMs: runtime.cacheTtlMs,
          includePriceEnrichment: false,
          preferLegacySource: false,
          forceAllgoodsSource: true,
          pricedItemsOnly: queryBase.pricedOnly,
          priceFrom: queryBase.priceFrom,
          priceTo: queryBase.priceTo,
          onlyInStock: queryBase.inStock,
        });

      let allgoodsPrimary: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>> | null = null;

      if (canUseCompleteAllgoodsCatalog) {
        allgoodsPrimary = await runAllgoodsQuery().catch(() => null);

        if (
          allgoodsPrimary &&
          (allgoodsPrimary.items.length > 0 ||
            queryBase.pricedOnly ||
            queryBase.priceFrom !== null ||
            queryBase.priceTo !== null ||
            Boolean(queryBase.cursor || queryBase.cursorField))
        ) {
          return allgoodsPrimary;
        }
      }

      if (shouldUseCursorBackedSource) {
        if (allgoodsPrimary) {
          return allgoodsPrimary;
        }

        return runAllgoodsQuery();
      }

      const legacyResult = await fetchCatalogProductsByQuery({
        ...queryBase,
        timeoutMs: runtime.timeoutMs,
        retries: runtime.retries,
        retryDelayMs: runtime.retryDelayMs,
        cacheTtlMs: runtime.cacheTtlMs,
        includePriceEnrichment: false,
        preferLegacySource: true,
        forceAllgoodsSource: false,
        pricedItemsOnly:
          queryBase.pricedOnly ||
          queryBase.priceFrom !== null ||
          queryBase.priceTo !== null ||
          queryBase.sortOrder !== "none",
        priceFrom: queryBase.priceFrom,
        priceTo: queryBase.priceTo,
        onlyInStock: queryBase.inStock,
      }).catch((error) => {
        if (queryBase.selectedCars.length > 0) throw error;
        return null;
      });

      const shouldCheckAllgoodsCoverage =
        Boolean(legacyResult) &&
        queryBase.selectedCars.length === 0 &&
        hasTightFilterContext &&
        legacyResult!.items.length > 0 &&
        (!legacyResult!.hasMore || legacyResult!.items.length < queryBase.limit);

      if (
        legacyResult &&
        (legacyResult.items.length > 0 || queryBase.selectedCars.length > 0) &&
        !shouldCheckAllgoodsCoverage
      ) {
        return legacyResult;
      }

      if (queryBase.selectedCars.length > 0) {
        return legacyResult ?? {
          items: [] as CatalogProduct[],
          hasMore: false,
          nextCursor: "",
          cursorField: null,
        };
      }

      const allgoodsFallback = await fetchCatalogProductsByQuery({
        ...queryBase,
        timeoutMs: Math.min(Math.max(runtime.timeoutMs, 4200), 5200),
        retries: 0,
        retryDelayMs: runtime.retryDelayMs,
        cacheTtlMs: runtime.cacheTtlMs,
        includePriceEnrichment: false,
        preferLegacySource: false,
        forceAllgoodsSource: true,
        pricedItemsOnly:
          queryBase.pricedOnly ||
          queryBase.priceFrom !== null ||
          queryBase.priceTo !== null ||
          queryBase.sortOrder !== "none",
        priceFrom: queryBase.priceFrom,
        priceTo: queryBase.priceTo,
        onlyInStock: queryBase.inStock,
      }).catch(() => null);

      if (allgoodsFallback && allgoodsFallback.items.length > 0) {
        if (
          !legacyResult ||
          allgoodsFallback.items.length > legacyResult.items.length ||
          (!legacyResult.hasMore && allgoodsFallback.hasMore)
        ) {
          return allgoodsFallback;
        }
      }

      if (legacyResult && legacyResult.items.length > 0) {
        return legacyResult;
      }

      if (allgoodsFallback && allgoodsFallback.items.length > 0) {
        return allgoodsFallback;
      }

      return fetchCatalogProductsByQuery({
        ...queryBase,
        sortOrder: queryBase.sortOrder,
        timeoutMs: Math.min(Math.max(runtime.timeoutMs, 4200), 5200),
        retries: 0,
        retryDelayMs: runtime.retryDelayMs,
        cacheTtlMs: runtime.cacheTtlMs,
        includePriceEnrichment: false,
        preferLegacySource: false,
        forceAllgoodsSource: true,
        pricedItemsOnly:
          queryBase.pricedOnly ||
          queryBase.priceFrom !== null ||
          queryBase.priceTo !== null ||
          queryBase.sortOrder !== "none",
        priceFrom: queryBase.priceFrom,
        priceTo: queryBase.priceTo,
        onlyInStock: queryBase.inStock,
      });
    };

    let inFlight = routeInFlightRequests.get(routeCacheKey);
    if (!inFlight) {
      inFlight = runQuery({ timeoutMs, retries, retryDelayMs, cacheTtlMs })
        .then((result) => toApiPayload(result))
        .then((payload) => {
          if (routeCacheKey) {
            routeSuccessCache.set(routeCacheKey, {
              freshUntil: Date.now() + ROUTE_SUCCESS_CACHE_TTL_MS,
              staleUntil: Date.now() + Math.max(ROUTE_SUCCESS_CACHE_TTL_MS, staleTtlMs),
              value: payload,
            });
          }

          return payload;
        })
        .finally(() => {
          routeInFlightRequests.delete(routeCacheKey);
        });

      routeInFlightRequests.set(routeCacheKey, inFlight);
    }

    if (staleCacheHit) {
      void inFlight.catch(() => null);
      const stalePayload = await withPersistentCatalogImages(
        buildStaleCatalogPayload(staleCacheHit)
      );
      return NextResponse.json(stalePayload, {
        headers: { "cache-control": "private, max-age=30, stale-while-revalidate=300" },
      });
    }

    const payload = await awaitCatalogPayloadWithinBudget(
      inFlight,
      isDescriptionSearch ? 9000 : CATALOG_ROUTE_RESPONSE_TIMEOUT_MS
    );
    if (!payload) {
      void inFlight.catch(() => null);
      throw new Error(
        `Catalog route timed out after ${CATALOG_ROUTE_RESPONSE_TIMEOUT_MS}ms`
      );
    }

    return NextResponse.json(await withPersistentCatalogImages(payload), {
      headers: { "cache-control": "private, max-age=60, stale-while-revalidate=600" },
    });
  } catch (error) {
    if (!routeCacheKey) {
      routeCacheKey = buildRouteCacheKey(body);
    }
    pruneRouteSuccessCache();
    const staleHit = getStaleRouteCacheValue(routeCacheKey);
    if (staleHit) {
      return NextResponse.json(
        await withPersistentCatalogImages(buildStaleCatalogPayload(staleHit))
      );
    }

    const normalizedMessage = sanitizeCatalogErrorMessage(
      error instanceof Error ? error.message : ""
    );

    return NextResponse.json(
      {
        items: [],
        prices: {},
        images: {},
        hasMore: false,
        nextCursor: "",
        serviceUnavailable: true,
        message: normalizedMessage || "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439.",
      },
      { status: 503 }
    );
  }
}
