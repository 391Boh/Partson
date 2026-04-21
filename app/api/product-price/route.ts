import { NextResponse } from "next/server";

import {
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  toPriceUah,
} from "app/lib/catalog-server";

const normalizeLookupKeys = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookupKeys = normalizeLookupKeys(url.searchParams.getAll("lookup"));

  if (lookupKeys.length === 0) {
    return NextResponse.json({ priceUah: null, hasPhoto: null }, { status: 200 });
  }

  try {
    const priceMapPromise = fetchPriceEuroMapByLookupKeys(lookupKeys, {
      sourceTimeoutMs: 1300,
      sourceCacheTtlMs: 1000 * 30,
      timeoutMs: 1700,
      retries: 0,
      retryDelayMs: 120,
      cacheTtlMs: 1000 * 60 * 3,
      includeDirectLookup: true,
      includePricesPost: true,
      directConcurrency: 4,
      maxKeys: 12,
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
      typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0 && euroRate != null
        ? toPriceUah(priceEuro, euroRate)
        : null;

    return NextResponse.json(
      {
        priceUah,
        priceEuro:
          typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0
            ? priceEuro
            : null,
        hasPhoto: null,
      },
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
