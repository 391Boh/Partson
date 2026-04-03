import { NextResponse } from "next/server";

import {
  fetchEuroRate,
  fetchPriceEuro,
  toPriceUah,
} from "app/lib/catalog-server";

const FAST_PRODUCT_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 850,
  retries: 0,
  cacheTtlMs: 1000 * 60 * 3,
};

const FAST_MODAL_PRODUCT_PRICE_LOOKUP_OPTIONS = {
  timeoutMs: 650,
  retries: 0,
  cacheTtlMs: 1000 * 60 * 3,
};

const getFirstResolvedValue = async <T,>(
  keys: string[],
  reader: (key: string) => Promise<T | null>
) => {
  const normalizedKeys = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));
  if (normalizedKeys.length === 0) return null;

  const attempts = normalizedKeys.map((key, index) =>
    Promise.resolve()
      .then(() => reader(key))
      .then((value) => ({ index, value }))
      .catch(() => ({ index, value: null as T | null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0) {
    const result = await Promise.race(Array.from(pending, (index) => attempts[index]));
    pending.delete(result.index);
    if (result.value != null) return result.value;
  }

  return null;
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
    const [priceEuro, euroRate] = await Promise.all([
      getFirstResolvedValue(lookupKeys, (key) =>
        fetchPriceEuro(
          key,
          isModalView
            ? FAST_MODAL_PRODUCT_PRICE_LOOKUP_OPTIONS
            : FAST_PRODUCT_PRICE_LOOKUP_OPTIONS
        )
      ),
      euroRatePromise,
    ]);

    return NextResponse.json(
      { priceUah: toPriceUah(priceEuro, euroRate) },
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
