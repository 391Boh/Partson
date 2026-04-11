import { NextResponse } from "next/server";

import type { CatalogProduct } from "app/lib/catalog-server";
import {
  fetchCatalogProductsByArticle,
  fetchCatalogProductsByHeaderSearchQuery,
} from "app/lib/catalog-server";
import { buildVisibleProductName } from "app/lib/product-url";

const buildRelatedIdentity = (item: CatalogProduct) =>
  [
    (item.code || "").trim().toLowerCase(),
    (item.article || "").trim().toLowerCase(),
    (item.producer || "").trim().toLowerCase(),
    buildVisibleProductName(item.name).toLowerCase(),
  ].join("::");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const article = (url.searchParams.get("article") || "").trim();
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();

  if (!article) {
    return NextResponse.json({ items: [] });
  }

  try {
    const directMatches = await fetchCatalogProductsByArticle(article, {
      limit: 12,
    });
    const fallbackMatches =
      directMatches.length < 3
        ? await fetchCatalogProductsByHeaderSearchQuery(article, {
            limit: 12,
          })
        : [];

    const seenProducts = new Set<string>();
    const items = [...directMatches, ...fallbackMatches]
      .filter((item) => {
        const itemCode = (item.code || "").trim().toLowerCase();
        const itemArticle = (item.article || "").trim().toLowerCase();
        if (itemCode && code && itemCode === code) return false;
        if (itemArticle && itemArticle === article.toLowerCase()) return false;

        const identity = buildRelatedIdentity(item);
        if (seenProducts.has(identity)) return false;
        seenProducts.add(identity);
        return true;
      })
      .slice(0, 4)
      .map((item) => ({
        code: item.code || "",
        article: item.article || "",
        name: item.name || "",
        producer: item.producer || "",
        quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
        group: item.group || "",
        subGroup: item.subGroup || "",
        category: item.category || "",
      }));

    return NextResponse.json(
      { items },
      {
        headers: {
          "cache-control": "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
