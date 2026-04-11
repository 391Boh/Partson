import { NextResponse } from "next/server";

import {
  fetchPriceEuroMapByLookupKeys,
} from "app/lib/catalog-server";

export const runtime = "nodejs";

const RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 850,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 3,
};

const FAST_CATALOG_PRICE_MAP_OPTIONS = {
  timeoutMs: 450,
  cacheTtlMs: 1000 * 12,
};

const RELIABLE_CATALOG_PRICE_MAP_OPTIONS = {
  timeoutMs: 1000,
  cacheTtlMs: 1000 * 20,
};
type CatalogPriceRequestItem = {
  stateKey: string;
  lookupKeys: string[];
};

const normalizeRequestItems = (payload: unknown): CatalogPriceRequestItem[] => {
  const source = Array.isArray((payload as { items?: unknown })?.items)
    ? ((payload as { items: unknown[] }).items ?? [])
    : [];

  const items: CatalogPriceRequestItem[] = [];
  const seenStateKeys = new Set<string>();

  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const stateKey =
      typeof record.stateKey === "string" ? record.stateKey.trim() : "";
    if (!stateKey || seenStateKeys.has(stateKey)) continue;

    const lookupKeys = Array.isArray(record.lookupKeys)
      ? record.lookupKeys
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [];

    if (lookupKeys.length === 0) continue;

    seenStateKeys.add(stateKey);
    items.push({ stateKey, lookupKeys });
    if (items.length >= 48) break;
  }

  return items;
};

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("mode") === "full" ? "full" : "fast";
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ prices: {} }, { status: 200 });
  }

  const items = normalizeRequestItems(payload);
  if (items.length === 0) {
    return NextResponse.json({ prices: {} }, { status: 200 });
  }

  const prices: Record<string, number | null> = {};
  const resolvedLookupPriceMap = await fetchPriceEuroMapByLookupKeys(
    items.flatMap((item) => item.lookupKeys),
    {
      sourceTimeoutMs:
        mode === "fast"
          ? FAST_CATALOG_PRICE_MAP_OPTIONS.timeoutMs
          : RELIABLE_CATALOG_PRICE_MAP_OPTIONS.timeoutMs,
      sourceCacheTtlMs:
        mode === "fast"
          ? FAST_CATALOG_PRICE_MAP_OPTIONS.cacheTtlMs
          : RELIABLE_CATALOG_PRICE_MAP_OPTIONS.cacheTtlMs,
      includeDirectLookup: true,
      includePricesPost: false,
      timeoutMs: RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS.timeoutMs,
      retries: RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS.retries,
      retryDelayMs: RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS.retryDelayMs,
      cacheTtlMs: RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS.cacheTtlMs,
      directConcurrency: 8,
      maxKeys: 128,
    }
  ).catch(() => ({} as Record<string, number>));
  for (const item of items) {
    const matchedPrice = item.lookupKeys
      .map((key) => resolvedLookupPriceMap[key.trim().toLowerCase()] ?? null)
      .find(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value) && value > 0
      );

    if (matchedPrice != null) {
      prices[item.stateKey] = matchedPrice;
      continue;
    }

    if (mode === "fast") {
      continue;
    }
  }

  return NextResponse.json(
    { prices },
    {
      headers: {
        "cache-control":
          mode === "fast"
            ? "public, max-age=30, s-maxage=30, stale-while-revalidate=180"
            : "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
