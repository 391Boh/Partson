import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { CatalogProduct } from "app/lib/catalog-server";
import {
  fetchCatalogProductsByArticle,
  fetchCatalogProductsByHeaderSearchQuery,
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
const MAX_RELATED_ITEMS = 18;
const HEADER_SEARCH_TIMEOUT_MS = 900;

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
  const [productByCode, productsByArticle, exactArticleMatches] = await Promise.all([
    normalizedCode
      ? findCatalogProductByCode(normalizedCode, {
          lookupLimit: 1,
          timeoutMs: 600,
          retries: 0,
          retryDelayMs: 80,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
        }).catch(() => null)
      : Promise.resolve(null),
    normalizedArticle
      ? fetchCatalogProductsByArticle(normalizedArticle, {
          limit: 2,
          timeoutMs: 600,
          retries: 0,
          retryDelayMs: 80,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          exactOnly: true,
        }).catch(() => [])
      : Promise.resolve([]),
    normalizedArticle
      ? fetchCatalogProductsByArticle(normalizedArticle, {
          limit: MAX_RELATED_ITEMS,
          timeoutMs: 550,
          retries: 0,
          retryDelayMs: 70,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          exactOnly: true,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const product = productByCode || productsByArticle[0] || null;
  const productName = (product?.name || "").trim();

  // 2. Будуємо набір запитів: назва + артикул + код (без дублів).
  // Це прибирає випадки, коли аналоги зникають через занадто вузький пошук лише по назві.
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

  const fastExact = collectUnique(exactArticleMatches).slice(0, MAX_RELATED_ITEMS);
  if (fastExact.length >= 4) {
    return fastExact
      .sort((left, right) => {
        if ((left.quantity > 0) !== (right.quantity > 0)) {
          return left.quantity > 0 ? -1 : 1;
        }
        return right.quantity - left.quantity;
      })
      .slice(0, MAX_RELATED_ITEMS)
      .map(toRelatedCardItem);
  }

  // 3. Шукаємо аналоги по найрелевантніших запитах з коротким timeout.
  const prioritizedLookupQueries = lookupQueries.slice(0, 2);
  const resultGroups = await Promise.all(
    prioritizedLookupQueries.map((query) =>
      resolveWithTimeout(
        fetchCatalogProductsByHeaderSearchQuery(query, {
          limit: 20,
          timeoutMs: 600,
          retries: 0,
          retryDelayMs: 70,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
        }).catch(() => []),
        [] as CatalogProduct[],
        HEADER_SEARCH_TIMEOUT_MS
      )
    )
  );

  const nameMatches = resultGroups.flat();
  let merged = [...fastExact, ...collectUnique(nameMatches)].slice(0, MAX_RELATED_ITEMS);

  // Надійний fallback: якщо швидкий пошук нічого не дав, робимо один додатковий запит
  // з м'якшим timeout по артикулу/коду, щоб блок аналогів не був порожнім.
  if (merged.length === 0) {
    const fallbackQuery = (normalizedArticle || normalizedCode || "").trim();
    if (fallbackQuery) {
      const fallbackMatches = await fetchCatalogProductsByHeaderSearchQuery(
        fallbackQuery,
        {
          limit: 28,
          timeoutMs: 1200,
          retries: 0,
          retryDelayMs: 100,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
        }
      ).catch(() => []);

      merged = collectUnique(fallbackMatches).slice(0, MAX_RELATED_ITEMS);
    }
  }

  return merged
    .sort((left, right) => {
      if ((left.quantity > 0) !== (right.quantity > 0)) {
        return left.quantity > 0 ? -1 : 1;
      }

      return right.quantity - left.quantity;
    })
    .slice(0, MAX_RELATED_ITEMS)
    .map(toRelatedCardItem);
};

const getRelatedProductsCached = unstable_cache(
  getRelatedProductsUncached,
  ["product-related:header-search-v6"],
  { revalidate: 60 * 10 }
);

export const getRelatedProducts = cache(async (article: string, code: string) =>
  getRelatedProductsCached(article, code)
);
