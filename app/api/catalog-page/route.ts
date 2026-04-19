import { NextResponse } from "next/server";

import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import type { CatalogProduct } from "app/lib/catalog-server";

type CatalogPageApiPayload = {
  items: CatalogProduct[];
  prices: Record<string, number>;
  images: Record<string, string>;
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string;
  serviceUnavailable?: boolean;
  message?: string;
  stale?: boolean;
};

const ROUTE_SUCCESS_CACHE_TTL_MS = 1000 * 60 * 2;
const routeSuccessCache = new Map<string, { expiresAt: number; value: CatalogPageApiPayload }>();
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
    if (!entry || entry.expiresAt <= now) {
      routeSuccessCache.delete(key);
    }
  }
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

const isRetryableCatalogError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const normalized = (error.message || "").toLowerCase();

  return /timeout|timed?\s*out|getdata failed|allgoods failed|fetch failed|503|502/.test(
    normalized
  );
};

const buildInlinePrices = (
  items: Array<{ code?: string; article?: string; priceEuro?: number | null }>
) => {
  const prices: Record<string, number> = {};

  for (const item of items) {
    const price = item?.priceEuro;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const code = typeof item.code === "string" ? item.code.trim() : "";
    const article = typeof item.article === "string" ? item.article.trim() : "";

    if (code && prices[code] === undefined) {
      prices[code] = price;
    }
    if (article && prices[article] === undefined) {
      prices[article] = price;
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

    const cacheHit = routeSuccessCache.get(routeCacheKey);
    if (cacheHit && cacheHit.expiresAt > Date.now()) {
      return NextResponse.json(cacheHit.value);
    }

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

    const timeoutMs = hasTightFilterContext ? 1400 : 2600;
    const retries = hasTightFilterContext ? 0 : 1;
    const retryDelayMs = hasTightFilterContext ? 80 : 150;
    const cacheTtlMs = hasTightFilterContext ? 1000 * 20 : 1000 * 45;

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
      });

    let inFlight = routeInFlightRequests.get(routeCacheKey);
    if (!inFlight) {
      inFlight = runQuery({ timeoutMs, retries, retryDelayMs, cacheTtlMs })
        .catch(async (error) => {
          if (!isRetryableCatalogError(error)) {
            throw error;
          }

          const relaxedRuntime = {
            timeoutMs: hasTightFilterContext ? 3000 : 3800,
            retries: 1,
            retryDelayMs: hasTightFilterContext ? 160 : 220,
            cacheTtlMs: hasTightFilterContext ? 1000 * 35 : 1000 * 60,
          };

          return await runQuery(relaxedRuntime);
        })
        .then((result) => toApiPayload(result))
        .finally(() => {
          routeInFlightRequests.delete(routeCacheKey);
        });

      routeInFlightRequests.set(routeCacheKey, inFlight);
    }

    const payload = await inFlight;

    if (routeCacheKey) {
      routeSuccessCache.set(routeCacheKey, {
        expiresAt: Date.now() + ROUTE_SUCCESS_CACHE_TTL_MS,
        value: payload,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (!routeCacheKey) {
      routeCacheKey = buildRouteCacheKey(body);
    }
    pruneRouteSuccessCache();
    const staleHit = routeSuccessCache.get(routeCacheKey);
    if (staleHit && staleHit.expiresAt > Date.now()) {
      return NextResponse.json({
        ...staleHit.value,
        stale: true,
        serviceUnavailable: false,
        message: "",
      });
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