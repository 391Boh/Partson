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
const catalogPricesRouteCache = new Map<
  string,
  { payload: CatalogPricesPayload; expiresAt: number }
>();
const catalogPricesRouteInFlight = new Map<string, Promise<CatalogPricesPayload>>();

const normalizeLookupKeys = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
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
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const existing = catalogPricesRouteInFlight.get(cacheKey);
    if (existing) {
      const payload = await existing;
      return NextResponse.json(payload, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const resolvePayloadPromise = (async (): Promise<CatalogPricesPayload> => {
      const allLookupKeys = Array.from(
        new Set(normalizedItems.flatMap((item) => item.lookupKeys))
      );

      const isFullMode = mode === "full";
      const lookupDetailsPromise = isFullMode
        ? fetchCatalogPriceDetailsByLookupKeys(allLookupKeys, {
            timeoutMs: 850,
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
        sourceTimeoutMs: isFullMode ? 760 : 360,
        sourceCacheTtlMs: 1000 * 20,
        timeoutMs: isFullMode ? 760 : 360,
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
      for (const item of normalizedItems) {
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

    catalogPricesRouteInFlight.set(cacheKey, resolvePayloadPromise);
    resolvePayloadPromise.finally(() => {
      catalogPricesRouteInFlight.delete(cacheKey);
    });

    const payload = await resolvePayloadPromise;
    catalogPricesRouteCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CATALOG_PRICES_ROUTE_CACHE_TTL_MS,
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
