import { NextResponse } from "next/server";

import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const buildInlinePrices = (
  items: Array<{ code?: string; article?: string; priceEuro?: number | null }>
) => {
  const prices: Record<string, number> = {};

  for (const item of items) {
    const price = item?.priceEuro;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const code = typeof item.code === "string" ? item.code.trim() : "";
    const article = typeof item.article === "string" ? item.article.trim() : "";

    if (code && prices[code] === undefined) {
      prices[code] = price;
    }
    if (article && prices[article] === undefined) {
      prices[article] = price;
    }
  }

  return prices;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await fetchCatalogProductsByQuery({
      page: toPositiveInt(body.page, 1),
      limit: toPositiveInt(body.limit, 10),
      cursor: toTrimmedString(body.cursor),
      selectedCars: toStringArray(body.selectedCars),
      selectedCategories: toStringArray(body.selectedCategories),
      searchQuery: toTrimmedString(body.searchQuery),
      searchFilter:
        body.searchFilter === "article" ||
        body.searchFilter === "name" ||
        body.searchFilter === "code" ||
        body.searchFilter === "producer"
          ? body.searchFilter
          : "all",
      group: toTrimmedString(body.group),
      subcategory: toTrimmedString(body.subcategory),
      producer: toTrimmedString(body.producer),
      sortOrder:
        body.sortOrder === "asc" || body.sortOrder === "desc"
          ? body.sortOrder
          : "none",
      retries: 1,
      retryDelayMs: 200,
      cacheTtlMs: 1000 * 20,
    });

    return NextResponse.json({
      items: result.items,
      prices: buildInlinePrices(result.items),
      images: {},
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        prices: {},
        images: {},
        hasMore: false,
        nextCursor: "",
        serviceUnavailable: true,
        message: error instanceof Error ? error.message : "Каталог тимчасово недоступний.",
      },
      { status: 503 }
    );
  }
}