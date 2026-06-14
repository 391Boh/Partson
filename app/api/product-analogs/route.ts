import { NextResponse } from "next/server";

import { getAnalogProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_ANALOGS_API_TIMEOUT_MS = 2200;
const PRODUCT_ANALOGS_LIMIT = 6;
const PRODUCT_ANALOGS_CACHE_CONTROL =
  "public, max-age=900, s-maxage=900, stale-while-revalidate=7200";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const article = (url.searchParams.get("article") || "").trim();
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();
  const name = (url.searchParams.get("name") || "").trim();
  const producer = (url.searchParams.get("producer") || "").trim();
  const group = (url.searchParams.get("group") || "").trim();
  const subGroup = (url.searchParams.get("subGroup") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();

  if (!article) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await resolveWithTimeout(
      () =>
        getAnalogProducts(
          article,
          code,
          name,
          producer,
          group,
          subGroup,
          category
        ),
      [],
      PRODUCT_ANALOGS_API_TIMEOUT_MS
    );

    return NextResponse.json(
      { items: items.slice(0, PRODUCT_ANALOGS_LIMIT) },
      {
        headers: {
          "cache-control": PRODUCT_ANALOGS_CACHE_CONTROL,
        },
      }
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
