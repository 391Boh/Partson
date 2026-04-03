import { NextResponse } from "next/server";

import { fetchPriceEuro, findCatalogProductByCode } from "app/lib/catalog-server";

export const runtime = "nodejs";

const FAST_CATALOG_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 500,
  retries: 0,
  cacheTtlMs: 1000 * 60 * 3,
};

const RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 1100,
  retries: 1,
  retryDelayMs: 180,
  cacheTtlMs: 1000 * 60 * 3,
};

type CatalogPriceRequestItem = {
  stateKey: string;
  lookupKeys: string[];
};

const getFirstResolvedValue = async <T,>(
  keys: string[],
  reader: (key: string) => Promise<T | null>
) => {
  const normalizedKeys = Array.from(
    new Set(keys.map((key) => key.trim()).filter(Boolean))
  ).slice(0, 4);

  if (normalizedKeys.length === 0) return null;

  const attempts = normalizedKeys.map((key, index) =>
    Promise.resolve()
      .then(() => reader(key))
      .then((value) => ({ index, value }))
      .catch(() => ({ index, value: null as T | null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0) {
    const result = await Promise.race(
      Array.from(pending, (index) => attempts[index])
    );
    pending.delete(result.index);
    if (result.value != null) return result.value;
  }

  return null;
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
    if (items.length >= 24) break;
  }

  return items;
};

const fetchCatalogPriceEuro = async (
  lookupKeys: string[],
  mode: "fast" | "full"
) => {
  const fastPrice = await getFirstResolvedValue(lookupKeys, (key) =>
    fetchPriceEuro(key, FAST_CATALOG_PRICE_LOOKUP_OPTIONS)
  ).catch(() => null);
  if (fastPrice != null) return fastPrice;

  if (mode === "fast") return null;

  const reliablePrice = await getFirstResolvedValue(lookupKeys, (key) =>
    fetchPriceEuro(key, RELIABLE_CATALOG_PRICE_LOOKUP_OPTIONS)
  ).catch(() => null);
  if (reliablePrice != null) return reliablePrice;

  for (const key of lookupKeys) {
    try {
      const fallbackProduct = await findCatalogProductByCode(key, {
        lookupLimit: 12,
        fallbackPages: 1,
        pageSize: 24,
        timeoutMs: 1400,
        retries: 0,
        retryDelayMs: 120,
        cacheTtlMs: 1000 * 60,
      });
      const priceEuro = fallbackProduct?.priceEuro;
      if (
        typeof priceEuro === "number" &&
        Number.isFinite(priceEuro) &&
        priceEuro > 0
      ) {
        return priceEuro;
      }
    } catch {
      continue;
    }
  }

  return null;
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
  let cursor = 0;
  const workerCount = Math.min(mode === "fast" ? 12 : 6, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;

      const item = items[currentIndex];
      const price = await fetchCatalogPriceEuro(item.lookupKeys, mode).catch(() => null);

      prices[item.stateKey] = price;
    }
  });

  await Promise.all(workers);

  return NextResponse.json(
    { prices },
    {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
