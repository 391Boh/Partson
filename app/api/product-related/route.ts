import { NextResponse } from "next/server";

import { getRelatedProducts } from "app/lib/product-related";

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
    const items = await getRelatedProducts(
      article,
      code,
      name,
      producer,
      group,
      subGroup,
      category
    );

    return NextResponse.json(
      { items },
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
