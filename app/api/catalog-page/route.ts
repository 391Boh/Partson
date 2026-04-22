import { NextResponse } from "next/server";

import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import type { CatalogProduct } from "app/lib/catalog-server";

type CatalogPageApiPayload = {
  items: CatalogProduct[];
  prices: Record<string, number | null>;
  images: Record<string, string>;
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string;
  serviceUnavailable?: boolean;
  message?: string;
  stale?: boolean;
};

const ROUTE_SUCCESS_CACHE_TTL_MS = 1000 * 60 * 2;
const ROUTE_SUCCESS_STALE_TTL_MS = 1000 * 60 * 12;
const ROUTE_SUCCESS_STALE_TIGHT_FILTER_TTL_MS = 1000 * 60 * 6;
const CATALOG_ROUTE_RESPONSE_TIMEOUT_MS = 6500;

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

const buildRouteCacheKey = (body: Record<string, unknown>) =>
  JSON.stringify({
    source: "allgoods-photo-price-unknown-state:v2",
    page: toPositiveInt(body.page, 1),
    limit: toPositiveInt(body.limit, 10),
    cursor: toTrimmedString(body.cursor),
    cursorField: toTrimmedString(body.cursorField),
    selectedCars: toStringArray(body.selectedCars),
    selectedCategories: toStringArray(body.selectedCategories),
    searchQuery: toTrimmedString(body.searchQuery),
    searchFilter:
      body.searchFilter === "article" ||
      body.searchFilter === "name" ||
      body.searchFilter === "code" ||
      body.searchFilter === "producer"
        ? body.searchFilter
        : "all",
    group: toTrimmedString(body.group),
    subcategory: toTrimmedString(body.subcategory),
    producer: toTrimmedString(body.producer),
    sortOrder:
      body.sortOrder === "asc" || body.sortOrder === "desc"
        ? body.sortOrder
        : "none",
  });

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
    return "Каталог тимчасово перевантажений. Спробуйте ще раз через кілька секунд.";
  }

  return stripped.length > 220 ? `${stripped.slice(0, 220)}...` : stripped;
};

const buildInlinePrices = (
  items: Array<{ code?: string; article?: string; priceEuro?: number | null }>
) => {
  const prices: Record<string, number | null> = {};

  for (const item of items) {
    const price = item?.priceEuro;
    if (price === undefined) continue;

    const resolvedPrice =
      typeof price === "number" && Number.isFinite(price) && price > 0
        ? price
        : null;

    const code = typeof item.code === "string" ? item.code.trim() : "";
    const article = typeof item.article === "string" ? item.article.trim() : "";

    if (code && prices[code] === undefined) {
      prices[code] = resolvedPrice;
    }
    if (article && prices[article] === undefined) {
      prices[article] = resolvedPrice;
    }
  }

  return prices;
};

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  let routeCacheKey = "";

  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    routeCacheKey = buildRouteCacheKey(body);
    pruneRouteSuccessCache();

    const cacheHit = getFreshRouteCacheValue(routeCacheKey);
    if (cacheHit) {
      return NextResponse.json(cacheHit);
    }

    const staleCacheHit = getStaleRouteCacheValue(routeCacheKey);

    const normalizedSearchQuery = toTrimmedString(body.searchQuery);
    const normalizedGroup = toTrimmedString(body.group);
    const normalizedSubcategory = toTrimmedString(body.subcategory);
    const normalizedProducer = toTrimmedString(body.producer);
    const hasTightFilterContext = Boolean(
      normalizedSearchQuery ||
        normalizedGroup ||
        normalizedSubcategory ||
        normalizedProducer
    );

      const timeoutMs = hasTightFilterContext ? 3200 : 5600;
    const retries = 0;
    const retryDelayMs = hasTightFilterContext ? 80 : 150;
    const cacheTtlMs = hasTightFilterContext ? 1000 * 20 : 1000 * 45;
    const staleTtlMs = hasTightFilterContext
      ? ROUTE_SUCCESS_STALE_TIGHT_FILTER_TTL_MS
      : ROUTE_SUCCESS_STALE_TTL_MS;

    const queryBase = {
      page: toPositiveInt(body.page, 1),
      limit: toPositiveInt(body.limit, 10),
      cursor: toTrimmedString(body.cursor),
      cursorField: toTrimmedString(body.cursorField),
      selectedCars: toStringArray(body.selectedCars),
      selectedCategories: toStringArray(body.selectedCategories),
      searchQuery: normalizedSearchQuery,
      searchFilter:
        body.searchFilter === "article" ||
        body.searchFilter === "name" ||
        body.searchFilter === "code" ||
        body.searchFilter === "producer"
          ? body.searchFilter
          : "all",
      group: normalizedGroup,
      subcategory: normalizedSubcategory,
      producer: normalizedProducer,
      sortOrder:
        body.sortOrder === "asc" || body.sortOrder === "desc"
          ? body.sortOrder
          : "none",
    } as const;

    const toApiPayload = (result: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>>) => ({
      items: result.items,
      prices: buildInlinePrices(result.items),
      images: {},
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      cursorField: result.cursorField || "",
    });

    const runQuery = (runtime: {
      timeoutMs: number;
      retries: number;
      retryDelayMs: number;
      cacheTtlMs: number;
    }) =>
      fetchCatalogProductsByQuery({
        ...queryBase,
        timeoutMs: runtime.timeoutMs,
        retries: runtime.retries,
        retryDelayMs: runtime.retryDelayMs,
        cacheTtlMs: runtime.cacheTtlMs,
        includePriceEnrichment: false,
        forceAllgoodsSource: true,
      });

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
      return NextResponse.json(buildStaleCatalogPayload(staleCacheHit));
    }

    const payload = await awaitCatalogPayloadWithinBudget(
      inFlight,
      CATALOG_ROUTE_RESPONSE_TIMEOUT_MS
    );
    if (!payload) {
      void inFlight.catch(() => null);
      throw new Error(
        `Catalog route timed out after ${CATALOG_ROUTE_RESPONSE_TIMEOUT_MS}ms`
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (!routeCacheKey) {
      routeCacheKey = buildRouteCacheKey(body);
    }
    pruneRouteSuccessCache();
    const staleHit = getStaleRouteCacheValue(routeCacheKey);
    if (staleHit) {
      return NextResponse.json(buildStaleCatalogPayload(staleHit));
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
        message: normalizedMessage || "Каталог тимчасово недоступний.",
      },
      { status: 503 }
    );
  }
}
