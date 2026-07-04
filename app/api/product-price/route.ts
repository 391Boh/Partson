import { NextResponse } from "next/server";

import {
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  toPriceUah,
} from "app/lib/catalog-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const normalizeLookupKeys = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

type ProductPricePayload = {
  priceUah: number | null;
  priceEuro: number | null;
  hasPhoto: null;
};

const productPriceRouteInFlight = new Map<string, Promise<ProductPricePayload>>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookupKeys = normalizeLookupKeys(url.searchParams.getAll("lookup"));

  if (lookupKeys.length === 0) {
    return NextResponse.json(
      { priceUah: null, hasPhoto: null },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const cacheKey = lookupKeys
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|");
    const existing = productPriceRouteInFlight.get(cacheKey);
    const payloadPromise =
      existing ??
      (async (): Promise<ProductPricePayload> => {
        const priceMapPromise = fetchPriceEuroMapByLookupKeys(lookupKeys, {
          sourceTimeoutMs: 750,
          sourceCacheTtlMs: 0,
          timeoutMs: 900,
          retries: 0,
          retryDelayMs: 80,
          cacheTtlMs: 0,
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

    return NextResponse.json(
      payload,
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
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
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
}
