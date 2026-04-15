import { NextResponse } from "next/server";

import { getRelatedProducts } from "app/lib/product-related";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const article = (url.searchParams.get("article") || "").trim();
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();

  if (!article && !code) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await getRelatedProducts(article, code);

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
