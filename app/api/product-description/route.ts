import { NextResponse } from "next/server";

import { fetchProductDescription } from "app/lib/catalog-server";

export const revalidate = 1800;

const DESCRIPTION_LOOKUP_LIMIT = 6;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lookupKeys = Array.from(
    new Set(
      searchParams
        .getAll("lookup")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, DESCRIPTION_LOOKUP_LIMIT);

  if (lookupKeys.length === 0) {
    return NextResponse.json({ description: null }, { status: 400 });
  }

  for (const lookupKey of lookupKeys) {
    const description = await fetchProductDescription(lookupKey, {
      timeoutMs: 4500,
      retries: 0,
      retryDelayMs: 150,
      cacheTtlMs: 1000 * 60 * 30,
    }).catch(() => null);

    if (description) {
      return NextResponse.json(
        { description },
        {
          headers: {
            "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=43200",
          },
        }
      );
    }
  }

  return NextResponse.json(
    { description: null },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    }
  );
}