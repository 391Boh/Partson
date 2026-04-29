import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { CatalogProduct } from "app/lib/catalog-server";
import {
  fetchCatalogProductsByArticle,
  fetchCatalogProductsByHeaderSearchQuery,
  findAnalogProductsByArticleInName,
  findCatalogProductByCode,
  findSimilarProductsBySubgroup,
} from "app/lib/catalog-server";
import { buildVisibleProductName } from "app/lib/product-url";

export type RelatedProductCardItem = {
  code: string;
  article: string;
  name: string;
  producer: string;
  quantity: number;
  priceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
};

type RelatedLookupContext = Pick<
  CatalogProduct,
  "article" | "code" | "name" | "producer" | "group" | "subGroup" | "category"
>;

const RELATED_CACHE_TTL_MS = 1000 * 60 * 10;
const MAX_RELATED_ITEMS = 18;
const MAX_SIMILAR_ITEMS = 8;
const FAST_RELATED_TIMEOUT_MS = 700;
const FALLBACK_RELATED_TIMEOUT_MS = 1050;

const normalizeLookupValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenizeLookupValue = (value: string | null | undefined) =>
  normalizeLookupValue(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const buildSearchableProductName = (product: RelatedLookupContext) => {
  const baseName = buildVisibleProductName(product.name || "");
  if (!baseName) return "";

  let cleaned = baseName
    .replace(/^купити\s+/iu, "")
    .replace(/\s+у\s+категорі[їи]\s+.+$/iu, "")
    .replace(/\s+[—-]\s*(артикул|код|виробник)\b.*$/iu, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const tokensToStrip = Array.from(
    new Set(
      [
        product.article,
        product.code,
        product.producer,
        product.subGroup,
        product.group,
        product.category,
      ]
        .map((value) => (value || "").trim())
        .filter(Boolean)
    )
  ).sort((left, right) => right.length - left.length);

  for (const token of tokensToStrip) {
    cleaned = cleaned
      .replace(new RegExp(escapeRegExp(token), "giu"), " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return cleaned || baseName;
};

const buildLookupContext = (
  article: string,
  code: string,
  name = "",
  producer = "",
  group = "",
  subGroup = "",
  category = ""
): RelatedLookupContext => ({
  article: (article || "").trim(),
  code: (code || "").trim(),
  name: (name || "").trim(),
  producer: (producer || "").trim(),
  group: (group || "").trim(),
  subGroup: (subGroup || "").trim(),
  category: (category || "").trim(),
});

const buildSyntheticProduct = (
  article: string,
  code: string,
  name = "",
  producer = "",
  group = "",
  subGroup = "",
  category = ""
): CatalogProduct => ({
  article: (article || "").trim(),
  code: (code || "").trim() || (article || "").trim(),
  name: (name || "").trim() || (article || "").trim() || (code || "").trim() || "Товар",
  producer: (producer || "").trim(),
  quantity: 0,
  group: (group || "").trim(),
  subGroup: (subGroup || "").trim(),
  category: (category || "").trim(),
});

const buildRecommendationIdentity = (item: CatalogProduct) =>
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
  priceEuro:
    typeof item.priceEuro === "number" &&
    Number.isFinite(item.priceEuro) &&
    item.priceEuro > 0
      ? item.priceEuro
      : null,
  group: item.group || "",
  subGroup: item.subGroup || "",
  category: item.category || "",
  hasPhoto: item.hasPhoto,
});

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

const buildRelatedSearchQueries = (product: RelatedLookupContext) => {
  const article = (product.article || "").trim();
  const code = (product.code || "").trim();
  const producer = (product.producer || "").trim();
  const groupLabel = (product.subGroup || product.group || product.category || "").trim();
  const cleanName = buildSearchableProductName(product);
  const cleanNameTokens = tokenizeLookupValue(cleanName);
  const shortenedName =
    cleanNameTokens.length > 0
      ? cleanNameTokens.slice(0, Math.min(5, cleanNameTokens.length)).join(" ")
      : cleanName;
  const articleAndNameQuery =
    cleanName && article && !normalizeLookupValue(cleanName).includes(normalizeLookupValue(article))
      ? `${cleanName} ${article}`
      : "";
  const producerAndNameQuery =
    cleanName &&
    producer &&
    !normalizeLookupValue(cleanName).includes(normalizeLookupValue(producer))
      ? `${cleanName} ${producer}`
      : "";
  const groupedNameQuery =
    cleanName &&
    groupLabel &&
    !normalizeLookupValue(cleanName).includes(normalizeLookupValue(groupLabel))
      ? `${cleanName} ${groupLabel}`
      : "";

  return Array.from(
    new Set(
      [
        article,
        code,
        articleAndNameQuery,
        cleanName,
        shortenedName,
        producerAndNameQuery,
        groupedNameQuery,
      ]
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 6);
};

const scoreRecommendation = (item: CatalogProduct, targetProduct: RelatedLookupContext) => {
  const itemArticle = normalizeLookupValue(item.article);
  const itemCode = normalizeLookupValue(item.code);
  const itemName = normalizeLookupValue(buildVisibleProductName(item.name));
  const itemProducer = normalizeLookupValue(item.producer);
  const itemGroup = normalizeLookupValue(item.group || item.category);
  const itemSubGroup = normalizeLookupValue(item.subGroup);

  const targetArticle = normalizeLookupValue(targetProduct.article);
  const targetCode = normalizeLookupValue(targetProduct.code);
  const targetProducer = normalizeLookupValue(targetProduct.producer);
  const targetGroup = normalizeLookupValue(targetProduct.group || targetProduct.category);
  const targetSubGroup = normalizeLookupValue(targetProduct.subGroup);
  const targetNameTokens = tokenizeLookupValue(buildSearchableProductName(targetProduct));

  let score = 0;

  if (item.quantity > 0) score += 4;
  if (targetArticle && itemArticle === targetArticle) score += 10;
  if (targetCode && itemCode === targetCode) score += 8;
  if (targetArticle && itemName.includes(targetArticle)) score += 7;
  if (targetSubGroup && itemSubGroup === targetSubGroup) score += 6;
  if (targetGroup && itemGroup === targetGroup) score += 3;
  if (targetProducer && itemProducer === targetProducer) score += 3;

  if (targetNameTokens.length > 0) {
    const sharedTokens = targetNameTokens.reduce(
      (count, token) => (itemName.includes(token) ? count + 1 : count),
      0
    );
    score += Math.min(sharedTokens * 2, 8);
  }

  return score;
};

const collectAndFilterUnique = (
  source: CatalogProduct[],
  targetProduct: Pick<CatalogProduct, "article" | "code" | "producer">
) => {
  const seenProducts = new Set<string>();
  const targetCode = normalizeLookupValue(targetProduct.code);
  const targetArticle = normalizeLookupValue(targetProduct.article);
  const targetProducer = normalizeLookupValue(targetProduct.producer);

  return source.filter((item) => {
    const itemCode = normalizeLookupValue(item.code);
    const itemArticle = normalizeLookupValue(item.article);
    const itemProducer = normalizeLookupValue(item.producer);

    if (itemCode && targetCode && itemCode === targetCode) return false;
    if (
      !itemCode &&
      itemArticle &&
      targetArticle &&
      itemArticle === targetArticle &&
      (!targetProducer || itemProducer === targetProducer)
    ) {
      return false;
    }

    const identity = buildRecommendationIdentity(item);
    if (!identity || seenProducts.has(identity)) return false;
    seenProducts.add(identity);
    return true;
  });
};

const sortRecommendationItems = (
  items: CatalogProduct[],
  targetProduct: RelatedLookupContext,
  limit: number
) =>
  items
    .sort((left, right) => {
      const scoreDelta =
        scoreRecommendation(right, targetProduct) - scoreRecommendation(left, targetProduct);
      if (scoreDelta !== 0) return scoreDelta;

      if ((left.quantity > 0) !== (right.quantity > 0)) {
        return left.quantity > 0 ? -1 : 1;
      }

      return right.quantity - left.quantity;
    })
    .slice(0, limit);

const getRelatedProductsUncached = async (
  article: string,
  code: string,
  name = "",
  producer = "",
  group = "",
  subGroup = "",
  category = ""
) => {
  const normalizedArticle = (article || "").trim();
  const normalizedCode = (code || "").trim();
  const lookupContext = buildLookupContext(
    normalizedArticle,
    normalizedCode,
    name,
    producer,
    group,
    subGroup,
    category
  );

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
          limit: Math.min(MAX_RELATED_ITEMS, 10),
          timeoutMs: 480,
          retries: 0,
          retryDelayMs: 60,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          exactOnly: true,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const product =
    productByCode ||
    exactArticleMatches[0] ||
    (lookupContext.name || lookupContext.group || lookupContext.subGroup
      ? buildSyntheticProduct(
          normalizedArticle,
          normalizedCode,
          lookupContext.name,
          lookupContext.producer,
          lookupContext.group,
          lookupContext.subGroup,
          lookupContext.category
        )
      : null);
  const targetProduct = buildLookupContext(
    normalizedArticle,
    normalizedCode,
    (product?.name || lookupContext.name || "").trim(),
    (product?.producer || lookupContext.producer || "").trim(),
    (product?.group || lookupContext.group || lookupContext.category || "").trim(),
    (product?.subGroup || lookupContext.subGroup || "").trim(),
    (product?.category || lookupContext.category || "").trim()
  );

  const lookupQueries = buildRelatedSearchQueries(targetProduct);
  if (lookupQueries.length === 0) return [] as RelatedProductCardItem[];

  let merged = collectAndFilterUnique(
    [...exactArticleMatches, ...exactCodeMatches],
    targetProduct
  ).slice(0, MAX_RELATED_ITEMS);

  if (merged.length >= 4) {
    return sortRecommendationItems(merged, targetProduct, MAX_RELATED_ITEMS).map(
      toRelatedCardItem
    );
  }

  const analogsByArticleInName =
    product && normalizedArticle
      ? collectAndFilterUnique(
          await resolveWithTimeout(
            findAnalogProductsByArticleInName(product, {
              limit: MAX_RELATED_ITEMS * 2,
              maxPages: 1,
              pageSize: 72,
            }).catch(() => []),
            [] as CatalogProduct[],
            FAST_RELATED_TIMEOUT_MS
          ),
          targetProduct
        ).slice(0, MAX_RELATED_ITEMS)
      : [];

  if (analogsByArticleInName.length > 0) {
    merged = [...merged, ...analogsByArticleInName].slice(0, MAX_RELATED_ITEMS * 2);
  }

  if (merged.length >= 4) {
    return sortRecommendationItems(merged, targetProduct, MAX_RELATED_ITEMS).map(
      toRelatedCardItem
    );
  }

  const resultGroups = await Promise.all(
    lookupQueries.map((query) =>
      resolveWithTimeout(
        fetchCatalogProductsByHeaderSearchQuery(query, {
          limit: 24,
          timeoutMs: FAST_RELATED_TIMEOUT_MS,
          retries: 0,
          retryDelayMs: 60,
          cacheTtlMs: RELATED_CACHE_TTL_MS,
          preferLookupFields:
            normalizeLookupValue(query) === normalizeLookupValue(normalizedArticle) ||
            normalizeLookupValue(query) === normalizeLookupValue(normalizedCode),
        }).catch(() => []),
        [] as CatalogProduct[],
        FAST_RELATED_TIMEOUT_MS
      )
    )
  );

  const nameMatches = collectAndFilterUnique(resultGroups.flat(), targetProduct);
  if (nameMatches.length > 0) {
    merged = [...merged, ...nameMatches].slice(0, MAX_RELATED_ITEMS * 2);
  }

  if (merged.length === 0) {
    for (const fallbackQuery of lookupQueries) {
      const fallbackMatches = await fetchCatalogProductsByHeaderSearchQuery(fallbackQuery, {
        limit: 30,
        timeoutMs: FALLBACK_RELATED_TIMEOUT_MS,
        retries: 0,
        retryDelayMs: 100,
        cacheTtlMs: RELATED_CACHE_TTL_MS,
        preferLookupFields:
          normalizeLookupValue(fallbackQuery) === normalizeLookupValue(normalizedArticle) ||
          normalizeLookupValue(fallbackQuery) === normalizeLookupValue(normalizedCode),
      }).catch(() => []);

      merged = collectAndFilterUnique(fallbackMatches, targetProduct).slice(
        0,
        MAX_RELATED_ITEMS
      );
      if (merged.length > 0) break;
    }
  }

  return sortRecommendationItems(merged, targetProduct, MAX_RELATED_ITEMS).map(
    toRelatedCardItem
  );
};

const getSimilarProductsUncached = async (
  article: string,
  code: string,
  name = "",
  producer = "",
  group = "",
  subGroup = "",
  category = ""
) => {
  const targetProduct = buildSyntheticProduct(
    article,
    code,
    name,
    producer,
    group,
    subGroup,
    category
  );

  const items = await findSimilarProductsBySubgroup(targetProduct, {
    limit: MAX_SIMILAR_ITEMS,
    maxPages: 2,
    pageSize: 96,
  }).catch(() => []);

  return sortRecommendationItems(
    collectAndFilterUnique(items, targetProduct),
    targetProduct,
    MAX_SIMILAR_ITEMS
  ).map(toRelatedCardItem);
};

const getRelatedProductsCached = unstable_cache(
  getRelatedProductsUncached,
  ["product-related:header-search-v9-price"],
  { revalidate: 60 * 10 }
);

const getSimilarProductsCached = unstable_cache(
  getSimilarProductsUncached,
  ["product-similar:subgroup-v3-price"],
  { revalidate: 60 * 10 }
);

export const getRelatedProducts = cache(
  async (
    article: string,
    code: string,
    name = "",
    producer = "",
    group = "",
    subGroup = "",
    category = ""
  ) =>
    getRelatedProductsCached(
      article,
      code,
      name,
      producer,
      group,
      subGroup,
      category
    )
);

export const getSimilarProducts = cache(
  async (
    article: string,
    code: string,
    name = "",
    producer = "",
    group = "",
    subGroup = "",
    category = ""
  ) =>
    getSimilarProductsCached(
      article,
      code,
      name,
      producer,
      group,
      subGroup,
      category
    )
);
