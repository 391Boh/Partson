import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { CatalogProduct } from "app/lib/catalog-server";
import {
  fetchCatalogProductsByArticle,
  fetchCatalogProductsByHeaderSearchQuery,
  findAnalogProductsByArticleInName,
  findCatalogProductByCode,
} from "app/lib/catalog-server";
import { buildVisibleProductName } from "app/lib/product-url";

export type RelatedProductCardItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  group?: string;
  subGroup?: string;
  category?: string;
};

const normalizeLookupValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const buildRelatedIdentity = (item: CatalogProduct) =>
  [
    normalizeLookupValue(item.code),
    normalizeLookupValue(item.article),
    normalizeLookupValue(item.producer),
    buildVisibleProductName(item.name).trim().toLowerCase(),
  ].join("::");

const toRelatedCardItem = (item: CatalogProduct): RelatedProductCardItem => ({
  code: item.code || "",
  article: item.article || "",
  name: item.name || "",
  producer: item.producer || "",
  quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
  group: item.group || "",
  subGroup: item.subGroup || "",
  category: item.category || "",
});

const RELATED_CACHE_TTL_MS = 1000 * 60 * 10;
const MAX_RELATED_ITEMS = 12;
const FAST_RELATED_TIMEOUT_MS = 650;
const FALLBACK_RELATED_TIMEOUT_MS = 900;

const resolveWithTimeout = async <T,>(
  task: Promise<T>,
  fallback: T,
  timeoutMs: number
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
    });
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getRelatedProductsUncached = async (
  article: string,
  code: string
) => {
  const normalizedArticle = (article || "").trim();
  const normalizedCode = (code || "").trim();
  const [productByCode, exactArticleMatches, exactCodeMatches] = await Promise.all([
    normalizedCode
      ? findCatalogProductByCode(normalizedCode, {
          lookupLimit: 1,
          timeoutMs: 480,
          retries: 0,
          retryDelayMs: 60,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
        }).catch(() => null)
      : Promise.resolve(null),
    normalizedArticle
      ? fetchCatalogProductsByArticle(normalizedArticle, {
          limit: MAX_RELATED_ITEMS,
          timeoutMs: 520,
          retries: 0,
          retryDelayMs: 60,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          exactOnly: true,
        }).catch(() => [])
      : Promise.resolve([]),
    normalizedCode && normalizedCode.toLowerCase() !== normalizedArticle.toLowerCase()
      ? fetchCatalogProductsByArticle(normalizedCode, {
          limit: Math.min(MAX_RELATED_ITEMS, 8),
          timeoutMs: 480,
          retries: 0,
          retryDelayMs: 60,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          exactOnly: true,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const product = productByCode || exactArticleMatches[0] || null;
  const productName = (product?.name || "").trim();

  const lookupQueries = Array.from(
    new Set([productName, normalizedArticle, normalizedCode].map((v) => v.trim()).filter(Boolean))
  );
  if (lookupQueries.length === 0) return [] as RelatedProductCardItem[];

  const targetCode = normalizeLookupValue(normalizedCode);
  const seenProducts = new Set<string>();

  const collectUnique = (source: CatalogProduct[]) =>
    source.filter((item) => {
      const itemCode = normalizeLookupValue(item.code);
      if (itemCode && targetCode && itemCode === targetCode) return false;

      const identity = buildRelatedIdentity(item);
      if (!identity || seenProducts.has(identity)) return false;
      seenProducts.add(identity);
      return true;
    });

  const sortRelated = (items: CatalogProduct[]) =>
    items
      .sort((left, right) => {
        if ((left.quantity > 0) !== (right.quantity > 0)) {
          return left.quantity > 0 ? -1 : 1;
        }
        return right.quantity - left.quantity;
      })
      .slice(0, MAX_RELATED_ITEMS);

  let merged = collectUnique([...exactArticleMatches, ...exactCodeMatches]).slice(
    0,
    MAX_RELATED_ITEMS
  );
  if (merged.length >= 4) {
    return sortRelated(merged).map(toRelatedCardItem);
  }

  const analogsByArticleInName =
    product && normalizedArticle
      ? collectUnique(
          await resolveWithTimeout(
            findAnalogProductsByArticleInName(product, {
              limit: MAX_RELATED_ITEMS,
              maxPages: 0,
              pageSize: 72,
            }).catch(() => []),
            [] as CatalogProduct[],
            FAST_RELATED_TIMEOUT_MS
          )
        ).slice(0, MAX_RELATED_ITEMS)
      : [];

  if (analogsByArticleInName.length > 0) {
    merged = [...merged, ...analogsByArticleInName].slice(0, MAX_RELATED_ITEMS);
  }

  if (merged.length >= 4) {
    return sortRelated(merged).map(toRelatedCardItem);
  }

  const prioritizedLookupQueries = Array.from(
    new Set([normalizedArticle, normalizedCode, productName].map((v) => v.trim()).filter(Boolean))
  ).slice(0, 3);
  const resultGroups = await Promise.all(
    prioritizedLookupQueries.map((query) =>
      resolveWithTimeout(
        fetchCatalogProductsByHeaderSearchQuery(query, {
          limit: 16,
          timeoutMs: FAST_RELATED_TIMEOUT_MS,
          retries: 0,
          retryDelayMs: 60,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          preferLookupFields:
            query.toLowerCase() === normalizedArticle.toLowerCase() ||
            query.toLowerCase() === normalizedCode.toLowerCase(),
        }).catch(() => []),
        [] as CatalogProduct[],
        FAST_RELATED_TIMEOUT_MS
      )
    )
  );

  const nameMatches = resultGroups.flat();
  merged = [...merged, ...collectUnique(nameMatches)].slice(
    0,
    MAX_RELATED_ITEMS
  );

  if (merged.length === 0) {
    const fallbackQuery = (normalizedArticle || normalizedCode || "").trim();
    if (fallbackQuery) {
      const fallbackMatches = await fetchCatalogProductsByHeaderSearchQuery(
        fallbackQuery,
        {
          limit: 18,
          timeoutMs: FALLBACK_RELATED_TIMEOUT_MS,
          retries: 0,
          retryDelayMs: 100,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          preferLookupFields: true,
        }
      ).catch(() => []);

      merged = collectUnique(fallbackMatches).slice(0, MAX_RELATED_ITEMS);
    }
  }

  return sortRelated(merged).map(toRelatedCardItem);
};

const getRelatedProductsCached = unstable_cache(
  getRelatedProductsUncached,
  ["product-related:header-search-v7-fast"],
  { revalidate: 60 * 10 }
);

export const getRelatedProducts = cache(async (article: string, code: string) =>
  getRelatedProductsCached(article, code)
);
