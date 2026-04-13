import { NextResponse } from "next/server";

import {
  fetchEuroRate,
  fetchPriceEuro,
  toPriceUah,
} from "app/lib/catalog-server";

const normalizeLookupKeys = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookupKeys = normalizeLookupKeys(url.searchParams.getAll("lookup"));

  if (lookupKeys.length === 0) {
    return NextResponse.json({ priceUah: null }, { status: 200 });
  }

  try {
    const [euroRate, priceCandidates] = await Promise.all([
      fetchEuroRate(),
      Promise.all(
        lookupKeys.map((lookupKey) =>
          fetchPriceEuro(lookupKey, {
            timeoutMs: 1800,
            retries: 0,
            retryDelayMs: 120,
            cacheTtlMs: 1000 * 30,
          }).catch(() => null)
        )
      ),
    ]);

    const priceEuro = priceCandidates.find(
      (value) => typeof value === "number" && Number.isFinite(value) && value > 0
    );

    const priceUah =
      typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0
        ? toPriceUah(priceEuro, euroRate)
        : null;

    return NextResponse.json(
      { priceUah },
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
        error: error instanceof Error ? error.message : "Failed to resolve product price",
      },
      { status: 200 }
    );
  }
}