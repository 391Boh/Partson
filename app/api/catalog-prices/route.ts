import { NextResponse } from "next/server";

import { fetchPriceEuroMapByLookupKeys } from "app/lib/catalog-server";

export const runtime = "nodejs";

type PriceBatchItem = {
  stateKey?: unknown;
  lookupKeys?: unknown;
};

const normalizeLookupKeys = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const normalizeStateKey = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  try {
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

    const allLookupKeys = Array.from(
      new Set(normalizedItems.flatMap((item) => item.lookupKeys))
    );

    const lookupPrices = await fetchPriceEuroMapByLookupKeys(allLookupKeys, {
      sourceTimeoutMs: 1800,
      sourceCacheTtlMs: 1000 * 20,
      timeoutMs: 2200,
      retries: 0,
      retryDelayMs: 120,
      cacheTtlMs: 1000 * 60 * 5,
      includeDirectLookup: true,
      includePricesPost: true,
      directConcurrency: 6,
      maxKeys: 120,
    }).catch(() => ({} as Record<string, number>));

    const prices: Record<string, number | null> = {};
    for (const item of normalizedItems) {
      const matched = item.lookupKeys
        .map((lookupKey) => lookupPrices[lookupKey.trim().toLowerCase()])
        .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

      prices[item.stateKey] =
        typeof matched === "number" && Number.isFinite(matched) && matched > 0
          ? matched
          : null;
    }

    return NextResponse.json(
      { prices },
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