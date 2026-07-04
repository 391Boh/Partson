import { NextResponse } from "next/server";

import { fetchProductDescription } from "app/lib/catalog-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DESCRIPTION_LOOKUP_LIMIT = 4;

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
    return NextResponse.json(
      { description: null },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  for (const lookupKey of lookupKeys) {
    const description = await fetchProductDescription(lookupKey, {
      timeoutMs: 1800,
      retries: 0,
      retryDelayMs: 150,
      cacheTtlMs: 0,
    }).catch(() => null);

    if (description) {
      return NextResponse.json(
        { description },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }
  }

  return NextResponse.json(
    { description: null },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
