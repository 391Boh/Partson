import { NextResponse } from "next/server";

import { getSimilarProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_SIMILAR_API_TIMEOUT_MS = 2600;
const PRODUCT_SIMILAR_LIMIT = 4;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const article = (url.searchParams.get("article") || "").trim();
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();
  const name = (url.searchParams.get("name") || "").trim();
  const producer = (url.searchParams.get("producer") || "").trim();
  const group = (url.searchParams.get("group") || "").trim();
  const subGroup = (url.searchParams.get("subGroup") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();

  if (!article && !code && !name && !group && !subGroup && !category) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await resolveWithTimeout(
      () =>
        getSimilarProducts(
          article,
          code,
          name,
          producer,
          group,
          subGroup,
          category
        ),
      [],
      PRODUCT_SIMILAR_API_TIMEOUT_MS
    );

    return NextResponse.json(
      { items: items.slice(0, PRODUCT_SIMILAR_LIMIT) },
      {
        headers: {
          "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
        },
      }
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
