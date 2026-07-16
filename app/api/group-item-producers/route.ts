import { NextResponse } from "next/server";

import {
  fetchCatalogProductsByQuery,
  type CatalogProduct,
} from "app/lib/catalog-server";
import {
  buildCatalogProducerPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { buildPlainSeoSlug } from "app/lib/seo-slug";

export const runtime = "nodejs";
export const revalidate = 1800;

const PAGE_SIZE = 220;
const MAX_PAGES = 3;
const TIMEOUT_MS = 2200;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeLookupKey = (value: string | null | undefined) =>
  normalizeValue(value).toLocaleLowerCase("uk-UA");

const buildProductDedupeKey = (item: CatalogProduct) => {
  const code = normalizeLookupKey(item.code);
  const article = normalizeLookupKey(item.article);
  const producer = normalizeLookupKey(item.producer);
  const name = normalizeLookupKey(item.name);

  if (code) return producer ? `code:${code}|producer:${producer}` : `code:${code}`;
  if (article) {
    return producer ? `article:${article}|producer:${producer}` : `article:${article}`;
  }
  if (name) return producer ? `name:${name}|producer:${producer}` : `name:${name}`;
  return "";
};

const collectProducerItems = async (group: string, subcategory: string) => {
  const producerProducts = new Map<string, { label: string; productKeys: Set<string> }>();
  let cursor = "";
  let cursorField = "";

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchCatalogProductsByQuery({
      page: cursor ? 1 : page,
      limit: PAGE_SIZE,
      group: group || null,
      subcategory,
      cursor: cursor || undefined,
      cursorField: cursorField || undefined,
      sortOrder: "none",
      includePriceEnrichment: false,
      preferLegacySource: false,
      forceAllgoodsSource: true,
      expandHierarchy: true,
      timeoutMs: TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 30,
    }).catch(() => ({
      items: [] as CatalogProduct[],
      hasMore: false,
      nextCursor: "",
      cursorField: "",
    }));

    for (const item of result.items) {
      const producerLabel = normalizeValue(item.producer);
      if (!producerLabel) continue;

      const productKey = buildProductDedupeKey(item);
      if (!productKey) continue;

      const producerKey = normalizeLookupKey(producerLabel);
      const entry =
        producerProducts.get(producerKey) ||
        {
          label: producerLabel,
          productKeys: new Set<string>(),
        };
      entry.productKeys.add(productKey);
      producerProducts.set(producerKey, entry);
    }

    const nextCursor = normalizeValue(result.nextCursor);
    if (!result.hasMore || !nextCursor || nextCursor === cursor) break;

    cursor = nextCursor;
    cursorField = normalizeValue(result.cursorField);
  }

  return Array.from(producerProducts.values())
    .map((entry) => ({
      label: entry.label,
      slug: buildPlainSeoSlug(entry.label),
      productCount: entry.productKeys.size,
      catalogPath: buildCatalogProducerPath(
        entry.label,
        group || undefined,
        subcategory,
        { expandHierarchy: true }
      ),
      manufacturerPath: buildManufacturerPath(entry.label),
    }))
    .filter((entry) => entry.productCount > 0)
    .sort((left, right) => {
      if (right.productCount !== left.productCount) {
        return right.productCount - left.productCount;
      }
      return left.label.localeCompare(right.label, "uk", { sensitivity: "base" });
    })
    .slice(0, 24);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const group = normalizeValue(searchParams.get("group"));
  const subcategory = normalizeValue(searchParams.get("subcategory"));

  if (!subcategory) {
    return NextResponse.json({ items: [] }, { status: 400 });
  }

  const items = await collectProducerItems(group, subcategory);

  return NextResponse.json(
    { items },
    {
      headers: {
        "cache-control": "public, s-maxage=1800, stale-while-revalidate=43200",
      },
    }
  );
}
