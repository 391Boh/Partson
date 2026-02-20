import { cache } from "react";

import { collectCatalogProductCodes } from "app/lib/catalog-server";

const PRODUCT_SITEMAP_CHUNK_SIZE = 2000;
const PRODUCT_SITEMAP_MAX_ITEMS = 50000;

const splitIntoChunks = <T,>(items: T[], chunkSize: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const getProductCodeChunks = cache(async () => {
  const allCodes = await collectCatalogProductCodes({
    maxPages: 1000,
    maxItems: PRODUCT_SITEMAP_MAX_ITEMS,
    pageSize: 80,
  });

  const normalizedCodes = Array.from(
    new Set(allCodes.map((code) => code.trim()).filter(Boolean))
  );

  return splitIntoChunks(normalizedCodes, PRODUCT_SITEMAP_CHUNK_SIZE);
});

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
