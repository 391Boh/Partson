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

  // Look up every candidate key (article, code, ...) concurrently rather than
  // one at a time — sequential lookups compounded with the internal per-key
  // parallel lookup in fetchProductDescription, routinely pushing total
  // latency past what the client is willing to wait for.
  //
  // cacheTtlMs was previously 0 (no caching at all) — every single card flip,
  // for every user, re-hit 1C from scratch, measured live at 1.9-3.7s per
  // call even for the exact same product back-to-back. The client's own
  // 2.6s per-attempt timeout meant most requests were racing (and often
  // losing to) that latency, triggering a retry that paid the same cost
  // again. A short server-side cache makes repeat views of the same product
  // (very common — popular parts, re-flipping a card) return instantly,
  // while staying fresh enough after an admin edits a description.
  const results = await Promise.all(
    lookupKeys.map((lookupKey) =>
      fetchProductDescription(lookupKey, {
        timeoutMs: 1800,
        retries: 0,
        retryDelayMs: 150,
        cacheTtlMs: 1000 * 60 * 5,
      }).catch(() => null)
    )
  );
  const description = results.find((value) => Boolean(value)) ?? null;

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

  return NextResponse.json(
    { description: null },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
