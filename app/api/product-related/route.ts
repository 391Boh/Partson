import { NextResponse } from "next/server";

import { getRelatedProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_RELATED_API_TIMEOUT_MS = 1900;
const PRODUCT_RELATED_CACHE_CONTROL =
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

  if (!article && !code && !name) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await resolveWithTimeout(
      () =>
        getRelatedProducts(
          article,
          code,
          name,
          producer,
          group,
          subGroup,
          category
        ),
      [],
      PRODUCT_RELATED_API_TIMEOUT_MS
    );

    return NextResponse.json(
      { items },
      {
        headers: {
          "cache-control": PRODUCT_RELATED_CACHE_CONTROL,
        },
      }
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
