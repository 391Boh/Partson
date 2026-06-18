import { NextResponse } from "next/server";

import {
  fetchCatalogPriceDetailsByLookupKeys,
  fetchPriceEuroMapByLookupKeys,
} from "app/lib/catalog-server";

export const runtime = "nodejs";

type PriceBatchItem = {
  stateKey?: unknown;
  lookupKeys?: unknown;
};

type CatalogPricesPayload = {
  prices: Record<string, number | null>;
  costPrices: Record<string, number | null>;
};

const CATALOG_PRICES_ROUTE_CACHE_TTL_MS = 1000 * 60 * 4;
const CATALOG_PRICES_ROUTE_SHORT_CACHE_TTL_MS = 1000 * 20;
const CATALOG_PRICES_ITEM_CACHE_MAX_ENTRIES = 2500;
const catalogPricesRouteCache = new Map<
  string,
  { payload: CatalogPricesPayload; expiresAt: number }
>();
const catalogPriceItemCache = new Map<
  string,
  { price: number | null; costPrice: number | null; expiresAt: number }
>();
const catalogPricesRouteInFlight = new Map<string, Promise<CatalogPricesPayload>>();

const normalizeLookupKeys = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.replace(/\s+/g, " ").trim().toLowerCase())
            .filter(Boolean)
        )
      )
    : [];

const normalizeStateKey = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const buildCatalogPricesRouteCacheKey = (
  mode: string,
  items: Array<{ stateKey: string; lookupKeys: string[] }>
) =>
  JSON.stringify({
    mode,
    items: items
      .map((item) => ({
        stateKey: item.stateKey.trim().toLowerCase(),
        lookupKeys: Array.from(
          new Set(item.lookupKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))
        ).sort(),
      }))
      .sort((left, right) => left.stateKey.localeCompare(right.stateKey)),
  });

const buildCatalogPriceItemCacheKey = (
  mode: string,
  item: { stateKey: string; lookupKeys: string[] }
) =>
  JSON.stringify({
    mode,
    stateKey: item.stateKey.trim().toLowerCase(),
    lookupKeys: Array.from(
      new Set(item.lookupKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))
    ).sort(),
  });

const readCatalogPriceItemCache = (
  mode: string,
  item: { stateKey: string; lookupKeys: string[] },
  now: number
) => {
  const key = buildCatalogPriceItemCacheKey(mode, item);
  const cached = catalogPriceItemCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    catalogPriceItemCache.delete(key);
    return null;
  }
  return cached;
};

const writeCatalogPriceItemCache = (
  mode: string,
  item: { stateKey: string; lookupKeys: string[] },
  price: number | null,
  costPrice: number | null,
  ttlMs: number
) => {
  catalogPriceItemCache.set(buildCatalogPriceItemCacheKey(mode, item), {
    price,
    costPrice,
    expiresAt: Date.now() + ttlMs,
  });
};

const pruneCatalogPriceItemCache = (now: number) => {
  for (const [key, entry] of catalogPriceItemCache.entries()) {
    if (entry.expiresAt <= now) {
      catalogPriceItemCache.delete(key);
    }
  }

  if (catalogPriceItemCache.size <= CATALOG_PRICES_ITEM_CACHE_MAX_ENTRIES) return;

  const overflow = catalogPriceItemCache.size - CATALOG_PRICES_ITEM_CACHE_MAX_ENTRIES;
  for (const key of Array.from(catalogPriceItemCache.keys()).slice(0, overflow)) {
    catalogPriceItemCache.delete(key);
  }
};

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const mode = requestUrl.searchParams.get("mode") === "full" ? "full" : "fast";
    const body = (await request.json().catch(() => ({}))) as {
      items?: PriceBatchItem[];
    };

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    const normalizedItems = items
      .map((item) => ({
        stateKey: normalizeStateKey(item?.stateKey),
        lookupKeys: normalizeLookupKeys(item?.lookupKeys),
      }))
      .filter((item) => item.stateKey && item.lookupKeys.length > 0);

    if (normalizedItems.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    const cacheKey = buildCatalogPricesRouteCacheKey(mode, normalizedItems);
    const cached = catalogPricesRouteCache.get(cacheKey);
    const now = Date.now();
    pruneCatalogPriceItemCache(now);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const cachedItemPrices: Record<string, number | null> = {};
    const cachedItemCostPrices: Record<string, number | null> = {};
    const missingItems: typeof normalizedItems = [];

    for (const item of normalizedItems) {
      const cachedItem = readCatalogPriceItemCache(mode, item, now);
      if (!cachedItem) {
        missingItems.push(item);
        continue;
      }

      cachedItemPrices[item.stateKey] = cachedItem.price;
      cachedItemCostPrices[item.stateKey] = cachedItem.costPrice;
    }

    if (missingItems.length === 0) {
      const payload = {
        prices: cachedItemPrices,
        costPrices: cachedItemCostPrices,
      };
      catalogPricesRouteCache.set(cacheKey, {
        payload,
        expiresAt: now + CATALOG_PRICES_ROUTE_CACHE_TTL_MS,
      });
      return NextResponse.json(payload, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const missingCacheKey = buildCatalogPricesRouteCacheKey(mode, missingItems);
    const existing = catalogPricesRouteInFlight.get(missingCacheKey);
    if (existing) {
      const missingPayload = await existing;
      const payload = {
        prices: { ...cachedItemPrices, ...missingPayload.prices },
        costPrices: { ...cachedItemCostPrices, ...missingPayload.costPrices },
      };
      catalogPricesRouteCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + CATALOG_PRICES_ROUTE_CACHE_TTL_MS,
      });
      return NextResponse.json(payload, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const resolvePayloadPromise = (async (): Promise<CatalogPricesPayload> => {
      const allLookupKeys = Array.from(
        new Set(missingItems.flatMap((item) => item.lookupKeys))
      );

      const isFullMode = mode === "full";
      const lookupDetailsPromise = isFullMode
        ? fetchCatalogPriceDetailsByLookupKeys(allLookupKeys, {
            timeoutMs: 3000,
            cacheTtlMs: 1000 * 20,
            includePricesPost: true,
          }).catch(() => ({
            prices: {} as Record<string, number>,
            costPrices: {} as Record<string, number>,
          }))
        : Promise.resolve({
            prices: {} as Record<string, number>,
            costPrices: {} as Record<string, number>,
          });

      const lookupPricesPromise = fetchPriceEuroMapByLookupKeys(allLookupKeys, {
        sourceTimeoutMs: isFullMode ? 2000 : 1800,
        sourceCacheTtlMs: 1000 * 20,
        timeoutMs: isFullMode ? 2000 : 1800,
        retries: 0,
        retryDelayMs: 80,
        cacheTtlMs: 1000 * 60 * 5,
        includeDirectLookup: isFullMode,
        includePricesPost: true,
        directConcurrency: isFullMode ? 4 : 6,
        maxKeys: isFullMode ? 36 : 120,
      }).catch(() => ({} as Record<string, number>));

      const [lookupDetails, fallbackLookupPrices] = await Promise.all([
        lookupDetailsPromise,
        lookupPricesPromise,
      ]);
      const lookupPrices = {
        ...fallbackLookupPrices,
        ...lookupDetails.prices,
      };
      const lookupCostPrices = lookupDetails.costPrices;

      const prices: Record<string, number | null> = {};
      const costPrices: Record<string, number | null> = {};
      for (const item of missingItems) {
        const matched = item.lookupKeys
          .map((lookupKey) => lookupPrices[lookupKey.trim().toLowerCase()])
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

        prices[item.stateKey] =
          typeof matched === "number" && Number.isFinite(matched) && matched > 0
            ? matched
            : null;

        const matchedCost = item.lookupKeys
          .map((lookupKey) => lookupCostPrices[lookupKey.trim().toLowerCase()])
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

        costPrices[item.stateKey] =
          typeof matchedCost === "number" && Number.isFinite(matchedCost) && matchedCost > 0
            ? matchedCost
            : null;
      }

      return { prices, costPrices };
    })();

    catalogPricesRouteInFlight.set(missingCacheKey, resolvePayloadPromise);
    resolvePayloadPromise.finally(() => {
      catalogPricesRouteInFlight.delete(missingCacheKey);
    });

    const missingPayload = await resolvePayloadPromise;
    // Use a short TTL when full-mode returns no cost prices — likely a timeout, not
    // genuinely absent data. This lets the next request retry against a fresh 1C response
    // instead of serving stale nulls for 4 minutes.
    const allCostPricesNull =
      mode === "full" &&
      Object.keys(missingPayload.costPrices).length > 0 &&
      Object.values(missingPayload.costPrices).every((v) => v === null);
    const itemCacheTtlMs = allCostPricesNull
      ? CATALOG_PRICES_ROUTE_SHORT_CACHE_TTL_MS
      : CATALOG_PRICES_ROUTE_CACHE_TTL_MS;

    for (const item of missingItems) {
      writeCatalogPriceItemCache(
        mode,
        item,
        Object.prototype.hasOwnProperty.call(missingPayload.prices, item.stateKey)
          ? missingPayload.prices[item.stateKey]
          : null,
        Object.prototype.hasOwnProperty.call(missingPayload.costPrices, item.stateKey)
          ? missingPayload.costPrices[item.stateKey]
          : null,
        itemCacheTtlMs
      );
    }

    const payload = {
      prices: { ...cachedItemPrices, ...missingPayload.prices },
      costPrices: { ...cachedItemCostPrices, ...missingPayload.costPrices },
    };

    catalogPricesRouteCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + itemCacheTtlMs,
    });

    return NextResponse.json(
      payload,
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        prices: {},
        error: error instanceof Error ? error.message : "Failed to resolve catalog prices",
      },
      { status: 500 }
    );
  }
}
