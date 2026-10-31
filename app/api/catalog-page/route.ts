import { readVehicleSelection, matchesVehicleFitment } from "app/lib/vehicle-fitment";
import { NextResponse } from "next/server";
import { withoutCostPrice } from "app/lib/public-catalog-product";

import { warmCatalogImages } from "app/lib/catalog-image-batch-server";
import {
  fetchCatalogProductsByQuery,
  fetchPromoCatalogProducts,
  listCatalogFromSnapshot,
  searchCatalogIndex,
} from "app/lib/catalog-server";
import type { CatalogProduct } from "app/lib/catalog-server";
import { decodeSearchCursor, encodeSearchCursor, normalizeSearchQuery, type SearchField } from "app/lib/catalog-search";
import { buildCatalogCategoryPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";

// Snapshot listings page by position in the filtered snapshot.
const SNAPSHOT_CURSOR_FIELD = "snapshot";
const SNAPSHOT_CURSOR_PREFIX = "snap-v1:";
const encodeSnapshotCursor = (offset: number) => `${SNAPSHOT_CURSOR_PREFIX}${offset}`;
const decodeSnapshotCursor = (value: string): number | null => {
  if (!value.startsWith(SNAPSHOT_CURSOR_PREFIX)) return null;
  const offset = Number(value.slice(SNAPSHOT_CURSOR_PREFIX.length));
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
};

// Ranked suggestions page by position in the ranked list, not by 1C code.
const RANK_CURSOR_PREFIX = "rank-v1:";
const encodeRankCursor = (query: string, offset: number) =>
  RANK_CURSOR_PREFIX + JSON.stringify({ query, offset });
const decodeRankCursor = (value: string): { query: string; offset: number } | null => {
  if (!value.startsWith(RANK_CURSOR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(RANK_CURSOR_PREFIX.length)) as { query?: unknown; offset?: unknown };
    return typeof parsed.query === "string" && Number.isSafeInteger(parsed.offset) && (parsed.offset as number) >= 0
      ? { query: parsed.query, offset: parsed.offset as number }
      : null;
  } catch {
    return null;
  }
};
import {
  canUseProductParams,
  isTerminalCatalogParamsQuery,
  getCatalogProductsMatchingParams,
  readCatalogParamsListOptions,
  readCatalogParamsQuery,
} from "app/lib/catalog-params-server";
import { decodeProductParamFilters } from "app/lib/product-params";
import {
  routeSuccessCache,
  type CatalogPageApiPayload,
} from "app/lib/catalog-page-route-cache";

const ROUTE_SUCCESS_CACHE_TTL_MS = 1000 * 60 * 10;
const ROUTE_SUCCESS_STALE_TTL_MS = 1000 * 60 * 240;
const ROUTE_SUCCESS_STALE_TIGHT_FILTER_TTL_MS = 1000 * 60 * 90;
const CATALOG_ROUTE_RESPONSE_TIMEOUT_MS = 9000;

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

// The catalog sends one sort value: "asc"/"desc" (price) or
// "name_asc"/"name_desc" (alphabetical). Price wins if both are somehow set.
const readPriceSortOrder = (body: Record<string, unknown>): "none" | "asc" | "desc" =>
  body.sortOrder === "asc" || body.sortOrder === "desc" ? body.sortOrder : "none";
const readNameSortOrder = (body: Record<string, unknown>): "none" | "asc" | "desc" =>
  readPriceSortOrder(body) !== "none"
    ? "none"
    : body.sortOrder === "name_asc"
      ? "asc"
      : body.sortOrder === "name_desc"
        ? "desc"
        : "none";

const buildRouteCacheKey = (body: Record<string, unknown>) => {
  const rawFilter =
    body.searchFilter === "article" ||
    body.searchFilter === "name" ||
    body.searchFilter === "code" ||
    body.searchFilter === "producer" ||
    body.searchFilter === "description"
      ? body.searchFilter
      : "all";
  const effectiveFilter = rawFilter;
  const rawSearch = toTrimmedString(body.searchQuery);
  const effectiveSearch = normalizeSearchQuery(rawSearch);
  return JSON.stringify({
    source: "catalog-page:v42-photo-paging",
    vehicle: readVehicleSelection(body.vehicle),
    // Suggestions are ranked by relevance; the catalog's own first page keeps
    // code order (its next page continues after the last code).
    ranked: body.purpose === "suggestions",
    directOffset: body.directPage === true ? toNonNegativeNumber(body.offset) : null,
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
    sortOrder: readPriceSortOrder(body),
    nameSort: readNameSortOrder(body),
    pricedOnly: body.pricedOnly === true,
    withPhoto: body.withPhoto === true,
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

const CATALOG_ROUTE_TIMEOUT_RESULT = Symbol("catalog-route-timeout");

const awaitCatalogPayloadWithinBudget = async (
  promise: Promise<CatalogPageApiPayload>,
  timeoutMs: number
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      promise,
      new Promise<typeof CATALOG_ROUTE_TIMEOUT_RESULT>((resolve) => {
        timer = setTimeout(() => resolve(CATALOG_ROUTE_TIMEOUT_RESULT), timeoutMs);
      }),
    ]);
    return result === CATALOG_ROUTE_TIMEOUT_RESULT ? null : result;
  } finally {
    clearTimeout(timer);
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

// This route answers anonymous visitors: never send the 1C purchase price.
// Admins read cost prices from the authenticated /api/catalog-prices.
const withoutCostPrices = <T,>(payload: T): T => {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return payload;
  return {
    ...payload,
    items: items.map((item) =>
      item && typeof item === "object" ? withoutCostPrice(item as object) : item
    ),
  };
};

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  let routeCacheKey = "";

  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.vehicle && !readVehicleSelection(body.vehicle)) {
      return NextResponse.json({ error: "Invalid vehicle configuration" }, { status: 400 });
    }

    // "Акційні товари" — 1C has no server-side promo filter (verified against
    // the live endpoint), so this reads a precomputed, periodically refreshed
    // snapshot instead of running the normal 1C query below at all.
    if (body.promoOnly === true) {
      // The promo list with every other active filter (search, group,
      // producer, stock, price range, sort) and its exact total. It used to
      // apply only the car and photo filters, so "Акційні" + a search or a
      // category listed — and counted — every promo product.
      const promoOffset =
        body.directPage === true
          ? Math.floor(toNonNegativeNumber(body.offset) ?? 0)
          : (toPositiveInt(body.page, 1) - 1) * toPositiveInt(body.limit, 10);
      const promoListing = await listCatalogFromSnapshot({
        searchQuery: normalizeSearchQuery(toTrimmedString(body.searchQuery)),
        searchFilter:
          body.searchFilter === "article" ||
          body.searchFilter === "name" ||
          body.searchFilter === "code" ||
          body.searchFilter === "producer" ||
          body.searchFilter === "description"
            ? body.searchFilter
            : "all",
        group: toTrimmedString(body.group),
        subcategory: toTrimmedString(body.subcategory),
        producer: toTrimmedString(body.producer),
        selectedCategories: toStringArray(body.selectedCategories),
        expandHierarchy: body.expandHierarchy === true,
        vehicle: readVehicleSelection(body.vehicle),
        sortOrder: readPriceSortOrder(body),
        nameSort: readNameSortOrder(body),
        pricedOnly: body.pricedOnly === true,
        withPhoto: body.withPhoto === true,
        inStock: body.inStock === true,
        priceFrom: toNonNegativeNumber(body.priceFrom),
        priceTo: toNonNegativeNumber(body.priceTo),
        promoOnly: true,
        offset: promoOffset,
        limit: toPositiveInt(body.limit, 10),
      }).catch(() => null);
      if (promoListing) {
        return NextResponse.json(
          withoutCostPrices({
            items: promoListing.items,
            prices: buildInlinePrices(promoListing.items),
            images: {},
            hasMore: promoListing.hasMore,
            nextCursor: "",
            cursorField: "",
            totalCount: promoListing.totalCount,
            ...(body.directPage === true ? { directOffset: promoOffset } : {}),
          }),
          { headers: { "cache-control": "no-store" } }
        );
      }

      // No snapshot yet (cold start): the precomputed promo list as before.
      const { products: promoProducts, stale } = await fetchPromoCatalogProducts();
      const vehicle = readVehicleSelection(body.vehicle);
      const products = promoProducts.filter(item => (!vehicle || matchesVehicleFitment(item.description, vehicle)) && (body.withPhoto !== true || item.hasPhoto === true));
      const page = toPositiveInt(body.page, 1);
      const limit = toPositiveInt(body.limit, 10);
      const start = body.directPage === true ? Math.floor(toNonNegativeNumber(body.offset) ?? 0) : (page - 1) * limit;
      const items = products.slice(start, start + limit);

      return NextResponse.json(
        withoutCostPrices({
          items,
          prices: buildInlinePrices(items),
          images: {},
          hasMore: start + limit < products.length,
          nextCursor: "",
          cursorField: "",
          totalCount: products.length,
          ...(body.directPage === true ? { directOffset: start } : {}),
          stale,
        }),
        { headers: { "cache-control": "no-store" } }
      );
    }

    // "Параметри" tab — 1C cannot filter by description lines, so the whole
    // category is loaded once (catalog-params-server keeps it for a few
    // minutes) and filtered here, then paged the same way as the promo list.
    const paramFilters = decodeProductParamFilters(
      typeof body.paramFilters === "string" ? body.paramFilters : ""
    );
    if (paramFilters.length > 0) {
      const paramsQuery = readCatalogParamsQuery(body);
      if (canUseProductParams(paramsQuery) && await isTerminalCatalogParamsQuery(paramsQuery)) {
        const products = await getCatalogProductsMatchingParams(
          paramsQuery,
          paramFilters,
          readCatalogParamsListOptions(body)
        );
        const page = toPositiveInt(body.page, 1);
        const limit = toPositiveInt(body.limit, 10);
        const start = body.directPage === true ? Math.floor(toNonNegativeNumber(body.offset) ?? 0) : (page - 1) * limit;
        const items = products.slice(start, start + limit);

        return NextResponse.json(
          withoutCostPrices({
            items,
            prices: buildInlinePrices(items),
            images: {},
            hasMore: start + limit < products.length,
            nextCursor: "",
            cursorField: "",
            totalCount: products.length,
            ...(body.directPage === true ? { directOffset: start } : {}),
          }),
          { headers: { "cache-control": "no-store" } }
        );
      }
    }

    routeCacheKey = buildRouteCacheKey(body);
    pruneRouteSuccessCache();

    const cacheHit = getFreshRouteCacheValue(routeCacheKey);
    // A cached 1C answer without a total loses to the snapshot listing below,
    // which has the exact count.
    if (cacheHit && typeof cacheHit.totalCount === "number") {
      return NextResponse.json(withoutCostPrices(cacheHit), {
        headers: { "cache-control": "no-store" },
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
    const effectiveSearchFilter = searchFilterValue;
    const normalizedSearchQuery = normalizeSearchQuery(rawSearchQuery);
    const normalizedGroup = toTrimmedString(body.group);
    const normalizedSubcategory = toTrimmedString(body.subcategory);
    const normalizedProducer = toTrimmedString(body.producer);
    const expandHierarchy = body.expandHierarchy === true;
    const normalizedSelectedCategories = toStringArray(body.selectedCategories);
    const hasPriceControls =
      body.sortOrder === "asc" ||
      body.sortOrder === "desc" ||
      body.pricedOnly === true ||
      toNonNegativeNumber(body.priceFrom) !== null ||
      toNonNegativeNumber(body.priceTo) !== null;
    const isDescriptionSearch =
      body.searchFilter === "description" && Boolean(normalizedSearchQuery);
    const hasTightFilterContext = Boolean(
      normalizedSearchQuery ||
        normalizedGroup ||
        normalizedSubcategory ||
        normalizedProducer ||
        expandHierarchy ||
        normalizedSelectedCategories.length > 0 ||
        hasPriceControls ||
        body.inStock === true
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
    // 15s used to be the cap here (see the matching client-side pageCacheTtl
    // in Data.tsx for why a low TTL was never actually needed for
    // freshness-after-edit — clearCatalogPageRouteCache() already blanket-
    // clears this whole cache on any admin write). Raised to cut repeat 1C
    // round trips for the common retype/backspace/Back-button case.
    const cacheTtlMs = normalizedSearchQuery ? 60_000 : hasTightFilterContext ? 1000 * 60 * 8 : 1000 * 60 * 5;
    const freshTtlMs = normalizedSearchQuery ? 60_000 : ROUTE_SUCCESS_CACHE_TTL_MS;
    // Search used to get NO stale grace period at all (staleTtlMs equaled
    // freshTtlMs), unlike every other filtered query below, which unlocks a
    // much longer stale-serve window. That meant a search box's quick
    // suggestions blocked on a live 1C round trip on every single distinct
    // query older than 60s — the actual cause of "search feels slow", not
    // just cold/rare terms. Giving search its own (shorter than the general
    // tight-filter window) stale window lets a repeated or popular query
    // return instantly from cache while it revalidates in the background,
    // same pattern the rest of this route already relies on.
    const SEARCH_STALE_TTL_MS = 1000 * 60 * 5;
    const staleTtlMs = normalizedSearchQuery
      ? SEARCH_STALE_TTL_MS
      : hasTightFilterContext
        ? ROUTE_SUCCESS_STALE_TIGHT_FILTER_TTL_MS
        : ROUTE_SUCCESS_STALE_TTL_MS;

    const directOffset = body.directPage === true ? toNonNegativeNumber(body.offset) : null;
    if (body.directPage === true && (directOffset === null || !Number.isSafeInteger(directOffset))) {
      return NextResponse.json({ error: "Invalid page offset" }, { status: 400 });
    }
    const queryBase = {
      ...(directOffset !== null ? { directOffset } : {}),
      page: toPositiveInt(body.page, 1),
      limit: toPositiveInt(body.limit, 10),
      cursor: toTrimmedString(body.cursor),
      cursorField: toTrimmedString(body.cursorField),
      vehicle: readVehicleSelection(body.vehicle),
      selectedCars: toStringArray(body.selectedCars),
      selectedCategories: normalizedSelectedCategories,
      searchQuery: normalizedSearchQuery,
      searchFilter: effectiveSearchFilter,
      group: normalizedGroup,
      subcategory: normalizedSubcategory,
      producer: normalizedProducer,
      expandHierarchy,
      sortOrder: readPriceSortOrder(body),
      nameSort: readNameSortOrder(body),
      pricedOnly: body.pricedOnly === true,
      withPhoto: body.withPhoto === true,
      priceFrom: toNonNegativeNumber(body.priceFrom),
      priceTo: toNonNegativeNumber(body.priceTo),
      inStock: body.inStock === true,
    } as const;

    // Instant path: a plain "search everything, first page" request — what
    // the header's quick-search box sends on every keystroke, and what a
    // fresh /katalog search loads before the user touches any other filter —
    // can be answered straight from the in-memory catalog snapshot instead of
    // a live 1C round trip (see searchCatalogIndex's own comment), and so can
    // its next pages (the "search" cursor it hands out). Anything with a facet
    // filter, sort, price range or car binding goes to listCatalogFromSnapshot
    // below instead.
    const searchIndexFilter: SearchField | "all" | null =
      effectiveSearchFilter;
    const isSuggestions = body.purpose === "suggestions";
    const rankCursor = isSuggestions ? decodeRankCursor(queryBase.cursor || "") : null;
    const searchCursor =
      !isSuggestions && queryBase.cursorField === "search" ? decodeSearchCursor(queryBase.cursor || "") : null;
    const canUseSearchIndex =
      Boolean(normalizedSearchQuery) &&
      searchIndexFilter !== null &&
      (queryBase.page === 1 || searchCursor !== null) &&
      directOffset === null &&
      (!queryBase.cursor || rankCursor !== null || searchCursor !== null) &&
      (!queryBase.cursorField || searchCursor !== null) &&
      !queryBase.vehicle &&
      queryBase.selectedCars.length === 0 &&
      queryBase.selectedCategories.length === 0 &&
      !normalizedGroup &&
      !normalizedSubcategory &&
      !normalizedProducer &&
      !expandHierarchy &&
      queryBase.sortOrder === "none" &&
      queryBase.nameSort === "none" &&
      !queryBase.pricedOnly &&
      !queryBase.withPhoto &&
      queryBase.priceFrom === null &&
      queryBase.priceTo === null &&
      !queryBase.inStock;

    if (canUseSearchIndex && searchIndexFilter) {
      const indexResult = await searchCatalogIndex(rankCursor?.query ?? searchCursor?.query ?? normalizedSearchQuery, {
        filter: searchIndexFilter,
        limit: queryBase.limit,
        afterCode: searchCursor?.cursor,
        rank: isSuggestions,
        offset: rankCursor?.offset ?? 0,
      });

      if (indexResult) {
        const usedQuery =
          indexResult.correctedQuery || rankCursor?.query || searchCursor?.query || normalizedSearchQuery;
        const shown = (rankCursor?.offset ?? 0) + indexResult.items.length;
        const hasMore = isSuggestions
          ? shown < indexResult.totalCount
          : indexResult.hasMore ?? indexResult.items.length < indexResult.totalCount;
        const payload: CatalogPageApiPayload = {
          items: indexResult.items,
          prices: buildInlinePrices(indexResult.items),
          images: {},
          hasMore,
          nextCursor: !hasMore || !indexResult.items.length
            ? ""
            : isSuggestions
              ? encodeRankCursor(usedQuery, shown)
              : encodeSearchCursor(usedQuery, indexResult.items[indexResult.items.length - 1].code),
          cursorField: "search",
          totalCount: indexResult.totalCount,
          ...(indexResult.correctedQuery && !rankCursor && !searchCursor ? { correctedQuery: indexResult.correctedQuery } : {}),
          ...(indexResult.facets
            ? {
                facets: {
                  categories: indexResult.facets.categories.map((facet) => ({
                    label: facet.label,
                    count: facet.count,
                    href: buildCatalogCategoryPath(facet.group || facet.subGroup, facet.subGroup || undefined),
                  })),
                  producers: indexResult.facets.producers.map((facet) => ({
                    label: facet.label,
                    count: facet.count,
                    href: buildManufacturerPathFromLabel(facet.label),
                  })),
                },
              }
            : {}),
        };

        if (routeCacheKey) {
          routeSuccessCache.set(routeCacheKey, {
            freshUntil: Date.now() + freshTtlMs,
            staleUntil: Date.now() + Math.max(freshTtlMs, staleTtlMs),
            value: payload,
          });
        }

        return NextResponse.json(withoutCostPrices(payload), {
          headers: { "cache-control": "no-store" },
        });
      }
      // A ranked continuation means nothing to the 1C path (the snapshot was
      // rebuilt or dropped since): end the list instead of sending it there.
      if (rankCursor) {
        return NextResponse.json(
          { items: [], prices: {}, images: {}, hasMore: false, nextCursor: "" },
          { headers: { "cache-control": "no-store" } }
        );
      }
    }

    // Every other listing (category, producer, price, stock, photo, sort,
    // car fitment, search with filters) is answered from the same snapshot,
    // which applies allgoods' own filters and returns the exact total — the
    // catalog counter needs it, and 1C under load times out on exactly these
    // queries. It continues with its own "snapshot" offset cursor; a listing
    // already paging through 1C stays there.
    const snapshotCursorOffset =
      queryBase.cursorField === SNAPSHOT_CURSOR_FIELD ? decodeSnapshotCursor(queryBase.cursor || "") : null;
    const canUseSnapshotListing =
      !isSuggestions &&
      // The car picker sends the car's label in selectedCars, but the actual
      // filter is the vehicle fitment (+ description search), which the
      // snapshot applies itself.
      (queryBase.selectedCars.length === 0 || Boolean(queryBase.vehicle)) &&
      (queryBase.cursorField ? snapshotCursorOffset !== null : !queryBase.cursor);
    if (canUseSnapshotListing) {
      const listing = await listCatalogFromSnapshot({
        searchQuery: normalizedSearchQuery,
        searchFilter: effectiveSearchFilter,
        group: normalizedGroup,
        subcategory: normalizedSubcategory,
        producer: normalizedProducer,
        selectedCategories: normalizedSelectedCategories,
        expandHierarchy,
        vehicle: queryBase.vehicle,
        sortOrder: queryBase.sortOrder,
        nameSort: queryBase.nameSort,
        pricedOnly: queryBase.pricedOnly,
        withPhoto: queryBase.withPhoto,
        inStock: queryBase.inStock,
        priceFrom: queryBase.priceFrom,
        priceTo: queryBase.priceTo,
        offset: snapshotCursorOffset ?? directOffset ?? (queryBase.page - 1) * queryBase.limit,
        limit: queryBase.limit,
      });
      // An empty search result may be a product created since the last scan:
      // let 1C confirm it.
      if (listing && !(normalizedSearchQuery && listing.totalCount === 0)) {
        const payload: CatalogPageApiPayload = {
          items: listing.items,
          prices: buildInlinePrices(listing.items),
          images: {},
          hasMore: listing.hasMore,
          nextCursor: listing.hasMore ? encodeSnapshotCursor(listing.nextOffset) : "",
          cursorField: listing.hasMore ? SNAPSHOT_CURSOR_FIELD : "",
          totalCount: listing.totalCount,
          ...(directOffset !== null ? { directOffset } : {}),
        };
        return NextResponse.json(withoutCostPrices(payload), {
          headers: { "cache-control": "no-store" },
        });
      }
    }

    const toApiPayload = (
      result: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>> & { correctedQuery?: string }
    ) => {
      const items = result.items;
      return {
        items,
        prices: buildInlinePrices(items),
        images: {},
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        cursorField: result.cursorField || "",
        totalCount: result.totalCount ?? null,
        ...(result.directOffset !== undefined ? { directOffset: result.directOffset } : {}),
        ...(result.correctedQuery ? { correctedQuery: result.correctedQuery } : {}),
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
        queryBase.withPhoto ||
        queryBase.priceFrom !== null ||
        queryBase.priceTo !== null ||
        queryBase.sortOrder !== "none" ||
        queryBase.nameSort !== "none" ||
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
          withPhotoOnly: queryBase.withPhoto,
          priceFrom: queryBase.priceFrom,
          priceTo: queryBase.priceTo,
          onlyInStock: queryBase.inStock,
        });

      let allgoodsPrimary: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>> | null = null;

      // One shared search pipeline performs all field queries and fallbacks.
      // Do not retry a valid empty result through the same cached source.
      // Only allgoods knows the alphabetical order, so no legacy fallbacks.
      if (
        (canUseCompleteAllgoodsCatalog && !queryBase.searchQuery && queryBase.sortOrder === "none" && queryBase.nameSort === "none") ||
        queryBase.vehicle ||
        queryBase.directOffset !== undefined ||
        (queryBase.searchQuery && canUseCompleteAllgoodsCatalog) ||
        (queryBase.nameSort !== "none" && canUseCompleteAllgoodsCatalog)
      ) return runAllgoodsQuery();

      if (canUseCompleteAllgoodsCatalog) {
        let allgoodsError: unknown;
        allgoodsPrimary = await runAllgoodsQuery().catch((error: unknown) => {
          allgoodsError = error;
          return null;
        });
        if (
          allgoodsError instanceof Error &&
          allgoodsError.message === "CATALOG_PAGINATION_STALLED"
        ) {
          throw allgoodsError;
        }

        if (
          allgoodsPrimary &&
          (allgoodsPrimary.items.length > 0 ||
            queryBase.pricedOnly ||
            queryBase.priceFrom !== null ||
            queryBase.priceTo !== null)
        ) {
          return allgoodsPrimary;
        }
      }

      if (shouldUseCursorBackedSource) {
        if (allgoodsPrimary && allgoodsPrimary.items.length > 0) {
          return allgoodsPrimary;
        }

        // A "load more" cursor continuation that comes back empty is
        // ambiguous — it means "genuinely reached the end of the catalog"
        // just as easily as "1C hiccuped on this one call". The old code
        // trusted it immediately either way, permanently setting hasMore
        // to false (the "Більше товарів" button disappearing) on a single
        // transient miss, with no retry — silently truncating pagination
        // for the rest of the session. One retry before accepting "no
        // more" rules out the common transient case without meaningfully
        // slowing down the real end-of-list case (which stays empty either
        // way).
        const cursorRetry = await runAllgoodsQuery().catch(() => null);
        if (cursorRetry && cursorRetry.items.length > 0) {
          return cursorRetry;
        }

        return allgoodsPrimary ?? cursorRetry ?? runAllgoodsQuery();
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
        withPhotoOnly: queryBase.withPhoto,
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
        withPhotoOnly: queryBase.withPhoto,
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

      const finalResult = await fetchCatalogProductsByQuery({
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
        withPhotoOnly: queryBase.withPhoto,
        priceFrom: queryBase.priceFrom,
        priceTo: queryBase.priceTo,
        onlyInStock: queryBase.inStock,
      });

      // Every fallback above already came back empty/failed by this point.
      // For an unfiltered "browse everything" query (no search, no facet,
      // no car binding) zero items is never a real business state for a
      // 10k+-product catalog — it only happens when 1C is degraded. Letting
      // this cache as a normal "success" used to poison routeSuccessCache
      // with a bogus "0 products" answer for up to ROUTE_SUCCESS_STALE_TTL_MS
      // (4h): one transient 1C blip made the catalog look permanently empty
      // long after 1C itself had recovered. Throwing instead routes this
      // through the catch block below, which returns serviceUnavailable
      // (uncached) so the very next request gets a real retry.
      if (finalResult.items.length === 0 && !hasTightFilterContext) {
        throw new Error("Catalog getdata failed: no products returned for unfiltered browse query");
      }

      return finalResult;
    };

    let inFlight = routeInFlightRequests.get(routeCacheKey);
    if (!inFlight) {
      inFlight = runQuery({ timeoutMs, retries, retryDelayMs, cacheTtlMs })
        .then((result) => toApiPayload(result))
        .then((payload) => {
          // Start this page's 1C photo lookup now instead of after the browser
          // has received, rendered and idle-scheduled its own batch request.
          // Header suggestions fetch visible photos themselves. Warming every
          // intermediate query competes with the next lookup for 1C capacity.
          if (body.purpose !== "suggestions" && !request.signal.aborted) {
            warmCatalogImages(payload.items ?? []);
          }
          if (routeCacheKey) {
            routeSuccessCache.set(routeCacheKey, {
              freshUntil: Date.now() + freshTtlMs,
              staleUntil: Date.now() + Math.max(freshTtlMs, staleTtlMs),
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
      const stalePayload = buildStaleCatalogPayload(staleCacheHit);
      return NextResponse.json(withoutCostPrices(stalePayload), {
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

    return NextResponse.json(withoutCostPrices(payload), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DIRECT_PAGINATION_UNSUPPORTED") {
      return NextResponse.json({ directPageUnsupported: true }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (!routeCacheKey) {
      routeCacheKey = buildRouteCacheKey(body);
    }
    pruneRouteSuccessCache();
    const staleHit = getStaleRouteCacheValue(routeCacheKey);
    if (staleHit) {
      return NextResponse.json(
        buildStaleCatalogPayload(staleHit)
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
