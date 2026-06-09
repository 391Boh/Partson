import { NextResponse } from "next/server";

import {
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  toPriceUah,
} from "app/lib/catalog-server";

const normalizeLookupKeys = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

type ProductPricePayload = {
  priceUah: number | null;
  priceEuro: number | null;
  hasPhoto: null;
};

const PRODUCT_PRICE_ROUTE_CACHE_TTL_MS = 1000 * 60 * 5;
const PRODUCT_PRICE_ROUTE_NEGATIVE_CACHE_TTL_MS = 1000 * 20;
const productPriceRouteCache = new Map<
  string,
  { payload: ProductPricePayload; expiresAt: number }
>();
const productPriceRouteInFlight = new Map<string, Promise<ProductPricePayload>>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookupKeys = normalizeLookupKeys(url.searchParams.getAll("lookup"));

  if (lookupKeys.length === 0) {
    return NextResponse.json({ priceUah: null, hasPhoto: null }, { status: 200 });
  }

  try {
    const cacheKey = lookupKeys
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|");
    const cached = productPriceRouteCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, {
        status: 200,
        headers: {
          "cache-control": "private, max-age=30, stale-while-revalidate=120",
        },
      });
    }

    const existing = productPriceRouteInFlight.get(cacheKey);
    const payloadPromise =
      existing ??
      (async (): Promise<ProductPricePayload> => {
        const priceMapPromise = fetchPriceEuroMapByLookupKeys(lookupKeys, {
          sourceTimeoutMs: 750,
          sourceCacheTtlMs: 1000 * 30,
          timeoutMs: 900,
          retries: 0,
          retryDelayMs: 80,
          cacheTtlMs: 1000 * 60 * 5,
          includeDirectLookup: true,
          includePricesPost: true,
          directConcurrency: 3,
          maxKeys: 8,
        }).catch(() => ({} as Record<string, number>));
        const euroRatePromise = fetchEuroRate().catch(() => null);

        const lookupPrices = await priceMapPromise;
        const priceEuro = lookupKeys
          .map((lookupKey) => lookupPrices[lookupKey.trim().toLowerCase()])
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

        const euroRate =
          typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0
            ? await euroRatePromise
            : null;

        const priceUah =
          typeof priceEuro === "number" &&
          Number.isFinite(priceEuro) &&
          priceEuro > 0 &&
          euroRate != null
            ? toPriceUah(priceEuro, euroRate)
            : null;

        return {
          priceUah,
          priceEuro:
            typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0
              ? priceEuro
              : null,
          hasPhoto: null,
        };
      })();

    if (!existing) {
      productPriceRouteInFlight.set(cacheKey, payloadPromise);
      payloadPromise.finally(() => {
        productPriceRouteInFlight.delete(cacheKey);
      });
    }

    const payload = await payloadPromise;
    productPriceRouteCache.set(cacheKey, {
      payload,
      expiresAt:
        Date.now() +
        (payload.priceUah != null
          ? PRODUCT_PRICE_ROUTE_CACHE_TTL_MS
          : PRODUCT_PRICE_ROUTE_NEGATIVE_CACHE_TTL_MS),
    });

    return NextResponse.json(
      payload,
      {
        status: 200,
        headers: {
          "cache-control": "private, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        priceUah: null,
        hasPhoto: null,
        error: error instanceof Error ? error.message : "Failed to resolve product price",
      },
      { status: 200 }
    );
  }
}
