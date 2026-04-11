import { NextResponse } from "next/server";

import {
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  toPriceUah,
} from "app/lib/catalog-server";

const FAST_PRODUCT_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 700,
  retries: 0,
  cacheTtlMs: 1000 * 60 * 3,
};

const FAST_MODAL_PRODUCT_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 500,
  retries: 0,
  cacheTtlMs: 1000 * 60 * 3,
};

const FAST_PRODUCT_PRICE_MAP_OPTIONS = {
  timeoutMs: 900,
  cacheTtlMs: 1000 * 20,
};

const FAST_MODAL_PRODUCT_PRICE_MAP_OPTIONS = {
  timeoutMs: 700,
  cacheTtlMs: 1000 * 20,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lookupKeys = searchParams
    .getAll("lookup")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 4);
  const isModalView = (searchParams.get("view") || "").trim().toLowerCase() === "modal";

  if (lookupKeys.length === 0) {
    return NextResponse.json({ priceUah: null });
  }

  try {
    const euroRatePromise = fetchEuroRate();
    const priceMapPromise = fetchPriceEuroMapByLookupKeys(
      lookupKeys,
      {
        sourceTimeoutMs: isModalView
          ? FAST_MODAL_PRODUCT_PRICE_MAP_OPTIONS.timeoutMs
          : FAST_PRODUCT_PRICE_MAP_OPTIONS.timeoutMs,
        sourceCacheTtlMs: isModalView
          ? FAST_MODAL_PRODUCT_PRICE_MAP_OPTIONS.cacheTtlMs
          : FAST_PRODUCT_PRICE_MAP_OPTIONS.cacheTtlMs,
        includeDirectLookup: true,
        includePricesPost: false,
        timeoutMs: isModalView
          ? FAST_MODAL_PRODUCT_PRICE_LOOKUP_OPTIONS.timeoutMs
          : FAST_PRODUCT_PRICE_LOOKUP_OPTIONS.timeoutMs,
        retries: isModalView
          ? FAST_MODAL_PRODUCT_PRICE_LOOKUP_OPTIONS.retries
          : FAST_PRODUCT_PRICE_LOOKUP_OPTIONS.retries,
        cacheTtlMs: isModalView
          ? FAST_MODAL_PRODUCT_PRICE_LOOKUP_OPTIONS.cacheTtlMs
          : FAST_PRODUCT_PRICE_LOOKUP_OPTIONS.cacheTtlMs,
        directConcurrency: Math.min(lookupKeys.length, 4),
        maxKeys: 8,
      }
    ).catch(() => ({} as Record<string, number>));
    const [priceMap, euroRate] = await Promise.all([priceMapPromise, euroRatePromise]);
    const resolvedPriceEuro =
      lookupKeys
        .map((key) => priceMap[(key || "").trim().toLowerCase()] ?? null)
        .find(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value) && value > 0
        ) ?? null;

    return NextResponse.json(
      { priceUah: toPriceUah(resolvedPriceEuro, euroRate) },
      {
        headers: {
          "cache-control": "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ priceUah: null }, { status: 200 });
  }
}
