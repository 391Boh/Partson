import { cache } from "react";
import { unstable_cache } from "next/cache";

import { collectCatalogProductCodes } from "app/lib/catalog-server";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const PRODUCT_SITEMAP_CHUNK_SIZE = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_CHUNK_SIZE,
  2000
);
const PRODUCT_SITEMAP_MAX_ITEMS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_ITEMS,
  50000
);
const PRODUCT_SITEMAP_MAX_PAGES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_PAGES,
  1000
);
const PRODUCT_SITEMAP_PAGE_SIZE = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PAGE_SIZE,
  80
);

const splitIntoChunks = <T,>(items: T[], chunkSize: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const normalizeProductCodes = (codes: string[]) => {
  const seen = new Set<string>();
  const uniqueCodes: string[] = [];

  for (const rawCode of codes) {
    const code = (rawCode || "").trim();
    if (!code) continue;

    const dedupeKey = code.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    uniqueCodes.push(code);
  }

  return uniqueCodes;
};

const buildProductCodeChunks = async () => {
  const allCodes = await collectCatalogProductCodes({
    maxPages: PRODUCT_SITEMAP_MAX_PAGES,
    maxItems: PRODUCT_SITEMAP_MAX_ITEMS,
    pageSize: PRODUCT_SITEMAP_PAGE_SIZE,
  });

  const normalizedCodes = normalizeProductCodes(allCodes);
  return splitIntoChunks(normalizedCodes, PRODUCT_SITEMAP_CHUNK_SIZE);
};

const collectProductCodeChunksWithCache = unstable_cache(
  buildProductCodeChunks,
  [
    `product-sitemap-codes-v2-${PRODUCT_SITEMAP_CHUNK_SIZE}-${PRODUCT_SITEMAP_MAX_ITEMS}-${PRODUCT_SITEMAP_MAX_PAGES}-${PRODUCT_SITEMAP_PAGE_SIZE}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-sitemap"],
  }
);

const getProductCodeChunks = cache(async () => collectProductCodeChunksWithCache());

export const getProductSitemapIds = async () => {
  const chunks = await getProductCodeChunks();
  return chunks.map((_, index) => ({ id: String(index) }));
};

export const getProductCodesBySitemapId = async (id: string) => {
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId) || numericId < 0) return [];

  const chunks = await getProductCodeChunks();
  return chunks[numericId] || [];
};
