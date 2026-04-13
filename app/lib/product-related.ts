import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { CatalogProduct } from "app/lib/catalog-server";
import {
  fetchCatalogProductsByArticle,
  fetchCatalogProductsByHeaderSearchQuery,
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

const getRelatedProductsUncached = async (article: string, code: string) => {
  const normalizedArticle = (article || "").trim();
  const normalizedCode = (code || "").trim();
  const lookupValue = normalizedArticle || normalizedCode;

  if (!lookupValue) return [] as RelatedProductCardItem[];

  const directMatches = normalizedArticle
    ? await fetchCatalogProductsByArticle(normalizedArticle, { limit: 8 }).catch(() => [])
    : await fetchCatalogProductsByHeaderSearchQuery(normalizedCode, { limit: 8 }).catch(
        () => []
      );

  const fallbackMatches =
    directMatches.length >= 4
      ? []
      : await fetchCatalogProductsByHeaderSearchQuery(lookupValue, { limit: 8 }).catch(
          () => []
        );

  const targetCode = normalizeLookupValue(normalizedCode);
  const targetArticle = normalizeLookupValue(normalizedArticle);
  const seenProducts = new Set<string>();

  return [...directMatches, ...fallbackMatches]
    .filter((item) => {
      const itemCode = normalizeLookupValue(item.code);
      const itemArticle = normalizeLookupValue(item.article);

      if (itemCode && targetCode && itemCode === targetCode) return false;
      if (itemArticle && targetArticle && itemArticle === targetArticle) return false;

      const identity = buildRelatedIdentity(item);
      if (seenProducts.has(identity)) return false;
      seenProducts.add(identity);
      return true;
    })
    .slice(0, 4)
    .map(toRelatedCardItem);
};

const getRelatedProductsCached = unstable_cache(
  getRelatedProductsUncached,
  ["product-related:cards"],
  { revalidate: 60 * 10 }
);

export const getRelatedProducts = cache(async (article: string, code: string) =>
  getRelatedProductsCached(article, code)
);
