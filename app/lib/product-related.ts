import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { CatalogProduct } from "app/lib/catalog-server";
import {
  fetchAllgoodsProductsByNameQuery,
  fetchCatalogProductsByArticle,
  fetchCatalogProductsByQuery,
  fetchCatalogProductsByHeaderSearchQuery,
  findAnalogProductsByArticleInName,
  findCatalogProductByCode,
  findSimilarProductsBySubgroup,
  searchCatalogIndex,
} from "app/lib/catalog-server";
import { normalizeSearchQuery } from "app/lib/catalog-search";
import {
  getAllProductSitemapSnapshotEntries,
  type ProductSitemapEntry,
} from "app/lib/product-sitemap";
import { buildVisibleProductName, parseAnalogCodesFromName } from "app/lib/product-url";
import { isPublicCatalogProduct } from "app/lib/public-catalog-product";

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
const MAX_RELATED_ITEMS = 12;
const MAX_SIMILAR_ITEMS = 6;
const MAX_STATIC_RECOMMENDATION_SCAN_ITEMS = 10000;
const FAST_RELATED_TIMEOUT_MS = 440;
const FALLBACK_RELATED_TIMEOUT_MS = 620;

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

const sitemapEntryToRelatedCardItem = (
  entry: ProductSitemapEntry
): RelatedProductCardItem => ({
  code: (entry.code || entry.article || "").trim(),
  article: (entry.article || "").trim(),
  name: (entry.name || entry.article || entry.code || "Товар").trim(),
  producer: (entry.producer || "").trim(),
  quantity: Number.isFinite(entry.quantity) ? Math.max(0, entry.quantity) : 0,
  priceEuro:
    typeof entry.priceEuro === "number" &&
    Number.isFinite(entry.priceEuro) &&
    entry.priceEuro > 0
      ? entry.priceEuro
      : null,
  group: (entry.group || "").trim(),
  subGroup: (entry.subGroup || "").trim(),
  category: (entry.category || "").trim(),
  hasPhoto: entry.hasPhoto,
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
  ).slice(0, 4);
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
  targetProduct: Pick<CatalogProduct, "article" | "code" | "producer">,
  options: { publicOnly?: boolean } = {}
) => {
  const publicOnly = options.publicOnly ?? true;
  const seenProducts = new Set<string>();
  const targetCode = normalizeLookupValue(targetProduct.code);
  const targetArticle = normalizeLookupValue(targetProduct.article);
  const targetProducer = normalizeLookupValue(targetProduct.producer);

  return source.filter((item) => {
    if (publicOnly && !isPublicCatalogProduct(item)) return false;
    const itemCode = normalizeLookupValue(item.code);
    const itemArticle = normalizeLookupValue(item.article);
    const itemProducer = normalizeLookupValue(item.producer);

    if (itemCode && targetCode && itemCode === targetCode) return false;
    if (
      itemArticle &&
      targetArticle &&
      itemArticle === targetArticle &&
      (!targetProducer || itemProducer === targetProducer)
    ) {
      return false;
    }
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

const collectAndFilterUniqueRelatedItems = (
  source: RelatedProductCardItem[],
  targetProduct: RelatedLookupContext
) => {
  const seenProducts = new Set<string>();
  const targetCode = normalizeLookupValue(targetProduct.code);
  const targetArticle = normalizeLookupValue(targetProduct.article);
  const targetProducer = normalizeLookupValue(targetProduct.producer);

  return source.filter((item) => {
    if (!isPublicCatalogProduct(item)) return false;
    const itemCode = normalizeLookupValue(item.code);
    const itemArticle = normalizeLookupValue(item.article);
    const itemProducer = normalizeLookupValue(item.producer);

    if (itemCode && targetCode && itemCode === targetCode) return false;
    if (
      itemArticle &&
      targetArticle &&
      itemArticle === targetArticle &&
      (!targetProducer || itemProducer === targetProducer)
    ) {
      return false;
    }

    const identity = [
      itemCode,
      itemArticle,
      itemProducer,
      normalizeLookupValue(buildVisibleProductName(item.name)),
    ].join("::");
    if (!identity || seenProducts.has(identity)) return false;
    seenProducts.add(identity);
    return true;
  });
};

const scoreStaticRecommendation = (
  item: RelatedProductCardItem,
  targetProduct: RelatedLookupContext,
  mode: "related" | "similar"
) => {
  const itemArticle = normalizeLookupValue(item.article);
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
  if (targetProducer && itemProducer === targetProducer) score += mode === "related" ? 5 : 2;
  if (targetSubGroup && itemSubGroup === targetSubGroup) score += mode === "related" ? 7 : 9;
  if (targetGroup && itemGroup === targetGroup) score += mode === "related" ? 3 : 6;
  if (targetArticle && itemName.includes(targetArticle)) score += 10;
  if (targetCode && itemName.includes(targetCode)) score += 8;
  if (targetArticle && itemArticle && itemArticle !== targetArticle && itemArticle.includes(targetArticle)) {
    score += 4;
  }

  if (targetNameTokens.length > 0) {
    const sharedTokens = targetNameTokens.reduce(
      (count, token) => (itemName.includes(token) ? count + 1 : count),
      0
    );
    score += Math.min(sharedTokens * (mode === "related" ? 3 : 2), 9);
  }

  return score;
};

const sortStaticRecommendationItems = (
  items: RelatedProductCardItem[],
  targetProduct: RelatedLookupContext,
  mode: "related" | "similar",
  limit: number
) =>
  items
    .sort((left, right) => {
      const scoreDelta =
        scoreStaticRecommendation(right, targetProduct, mode) -
        scoreStaticRecommendation(left, targetProduct, mode);
      if (scoreDelta !== 0) return scoreDelta;

      if ((left.quantity > 0) !== (right.quantity > 0)) {
        return left.quantity > 0 ? -1 : 1;
      }

      const leftPrice = typeof left.priceEuro === "number" ? left.priceEuro : 0;
      const rightPrice = typeof right.priceEuro === "number" ? right.priceEuro : 0;
      if ((leftPrice > 0) !== (rightPrice > 0)) return leftPrice > 0 ? -1 : 1;

      return right.quantity - left.quantity;
    })
    .slice(0, limit);

const filterRelevantRecommendationItems = (
  items: CatalogProduct[],
  targetProduct: RelatedLookupContext,
  minScore = 2
) => items.filter((item) => scoreRecommendation(item, targetProduct) >= minScore);

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

  const nameFieldQueries = Array.from(
    new Set(
      [
        normalizedArticle,
        buildSearchableProductName(targetProduct),
      ]
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 2);

  if (nameFieldQueries.length > 0) {
    const nameFieldResultGroups = await Promise.all(
      nameFieldQueries.map((query) =>
        resolveWithTimeout(
          fetchAllgoodsProductsByNameQuery(query, {
            limit: 24,
            timeoutMs: FAST_RELATED_TIMEOUT_MS,
            retries: 0,
            retryDelayMs: 60,
            cacheTtlMs: RELATED_CACHE_TTL_MS,
          }).catch(() => []),
          [] as CatalogProduct[],
          FAST_RELATED_TIMEOUT_MS
        )
      )
    );

    const nameFieldMatches = filterRelevantRecommendationItems(
      collectAndFilterUnique(nameFieldResultGroups.flat(), targetProduct),
      targetProduct,
      3
    );

    if (nameFieldMatches.length > 0) {
      merged = collectAndFilterUnique(
        [...nameFieldMatches, ...merged],
        targetProduct
      ).slice(0, MAX_RELATED_ITEMS * 2);
    }
  }

  const analogsByArticleInName =
    product && normalizedArticle
      ? collectAndFilterUnique(
          await resolveWithTimeout(
            findAnalogProductsByArticleInName(product, {
              limit: MAX_RELATED_ITEMS * 2,
              maxPages: 1,
              pageSize: 48,
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

  const nameMatches = filterRelevantRecommendationItems(
    collectAndFilterUnique(resultGroups.flat(), targetProduct),
    targetProduct,
    3
  );
  if (nameMatches.length > 0) {
    merged = [...merged, ...nameMatches].slice(0, MAX_RELATED_ITEMS * 2);
  }

  if (merged.length === 0) {
    for (const fallbackQuery of lookupQueries) {
      const fallbackMatches = await fetchCatalogProductsByHeaderSearchQuery(fallbackQuery, {
        limit: 18,
        timeoutMs: FALLBACK_RELATED_TIMEOUT_MS,
        retries: 0,
        retryDelayMs: 100,
        cacheTtlMs: RELATED_CACHE_TTL_MS,
        preferLookupFields:
          normalizeLookupValue(fallbackQuery) === normalizeLookupValue(normalizedArticle) ||
          normalizeLookupValue(fallbackQuery) === normalizeLookupValue(normalizedCode),
      }).catch(() => []);

      merged = filterRelevantRecommendationItems(
        collectAndFilterUnique(fallbackMatches, targetProduct),
        targetProduct,
        3
      ).slice(
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
  ["product-related:name-field-article-v11"],
  { revalidate: 60 * 10 }
);

const getSimilarProductsCached = unstable_cache(
  getSimilarProductsUncached,
  ["product-similar:subgroup-v4-fast"],
  { revalidate: 60 * 10 }
);

const getStaticProductRecommendationsUncached = async (
  article: string,
  code: string,
  name = "",
  producer = "",
  group = "",
  subGroup = "",
  category = ""
) => {
  const targetProduct = buildLookupContext(
    article,
    code,
    name,
    producer,
    group,
    subGroup,
    category
  );
  const entries = await getAllProductSitemapSnapshotEntries().catch(() => []);
  if (entries.length === 0) {
    return {
      analogs: [] as RelatedProductCardItem[],
      similar: [] as RelatedProductCardItem[],
    };
  }

  const candidates = collectAndFilterUniqueRelatedItems(
    entries
      .slice(0, MAX_STATIC_RECOMMENDATION_SCAN_ITEMS)
      .map(sitemapEntryToRelatedCardItem)
      .filter((item) => item.code || item.article),
    targetProduct
  );

  // "Аналоги" means found by cross-reference: the target's own article/code
  // number literally appears in the candidate's name (mirrors
  // findAnalogProductsByArticleInName). A same-subgroup/producer match alone
  // is NOT an analog — that's what the "similar" bucket below is for. Scoring
  // by subgroup/producer here previously let unrelated same-subgroup products
  // get mislabeled as analogs whenever live crossref search came back empty.
  const targetArticle = normalizeLookupValue(targetProduct.article);
  const targetCode = normalizeLookupValue(targetProduct.code);
  const analogCandidates = candidates.filter((item) => {
    if (!targetArticle && !targetCode) return false;
    // Cross-reference numbers in 1C names are normally stored inside the
    // trailing parentheses, e.g. "...(LIN473008/AD551514/1170600700)".
    // buildVisibleProductName intentionally removes that whole suffix for UI
    // copy, so using it here made the static analog fallback discard the very
    // identifiers it was meant to match.
    const itemName = normalizeLookupValue(item.name);
    return (
      (targetArticle.length >= 3 && itemName.includes(targetArticle)) ||
      (targetCode.length >= 3 && itemName.includes(targetCode))
    );
  });
  const analogs = sortStaticRecommendationItems(
    analogCandidates,
    targetProduct,
    "related",
    MAX_RELATED_ITEMS
  );
  const analogIdentityKeys = new Set(
    analogs.flatMap((item) => [
      normalizeLookupValue(item.code) ? `code:${normalizeLookupValue(item.code)}` : "",
      normalizeLookupValue(item.article) ? `article:${normalizeLookupValue(item.article)}` : "",
    ].filter(Boolean))
  );

  const similarCandidates = candidates.filter((item) => {
    const itemKeys = [
      normalizeLookupValue(item.code) ? `code:${normalizeLookupValue(item.code)}` : "",
      normalizeLookupValue(item.article) ? `article:${normalizeLookupValue(item.article)}` : "",
    ].filter(Boolean);
    if (itemKeys.some((key) => analogIdentityKeys.has(key))) return false;
    return scoreStaticRecommendation(item, targetProduct, "similar") >= 6;
  });

  return {
    analogs,
    similar: sortStaticRecommendationItems(
      similarCandidates,
      targetProduct,
      "similar",
      MAX_SIMILAR_ITEMS
    ),
  };
};

const getStaticProductRecommendationsCached = unstable_cache(
  getStaticProductRecommendationsUncached,
  ["product-recommendations:static-sitemap-v2"],
  { revalidate: 60 * 60 }
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

export const getStaticProductRecommendations = cache(
  async (
    article: string,
    code: string,
    name = "",
    producer = "",
    group = "",
    subGroup = "",
    category = ""
  ) =>
    getStaticProductRecommendationsCached(
      article,
      code,
      name,
      producer,
      group,
      subGroup,
      category
    )
);

// Аналоги — found with the exact same search the header search box runs
// (/api/catalog-page → searchCatalogIndex over name/article/code/producer,
// live fetchCatalogProductsByQuery when the snapshot is cold), fired for the
// product's own article AND every cross-reference number stored in its 1C
// name ("...(LIN473008/AD551514)" — the "Аналогові номери" chips on the
// product page). Each hit is then verified as a whole-code match (not just a
// substring of some longer number) before it's shown as an analog.
const MAX_ANALOG_ITEMS = 6;
const MAX_ANALOG_QUERIES = 8;
const ANALOG_SEARCH_RESULT_LIMIT = 60;
const ANALOG_LIVE_SEARCH_TIMEOUT_MS = 3200;
const MIN_CROSS_CODE_LENGTH = 4;

const CODE_SEPARATOR_PATTERN = /[\s\-_.\\/]+/g;
const compactLookupCode = (value: string | null | undefined) =>
  normalizeLookupValue(value).replace(CODE_SEPARATOR_PATTERN, "");

// Whole-code match inside free text: separators between characters are
// optional ("AD 551514" == "AD551514" == "AD-551514"), but the code must not
// be glued to further letters/digits, so "1234" never matches "A12345".
const buildCodeTokenPattern = (code: string) => {
  const chars = Array.from(compactLookupCode(code)).map(escapeRegExp);
  if (chars.length === 0) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${chars.join("[\\s\\-_.\\\\/]*")}(?![\\p{L}\\p{N}])`,
    "iu"
  );
};

const searchCatalogLikeHeader = async (query: string): Promise<CatalogProduct[]> => {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return [];

  const indexResult = await searchCatalogIndex(normalizedQuery, {
    filter: "all",
    limit: ANALOG_SEARCH_RESULT_LIMIT,
  }).catch(() => null);
  // A typo-corrected result is a different code — never an analog.
  if (indexResult && !indexResult.correctedQuery) return indexResult.items;
  if (indexResult) return [];

  const liveResult = await resolveWithTimeout(
    fetchCatalogProductsByQuery({
      page: 1,
      limit: ANALOG_SEARCH_RESULT_LIMIT,
      searchQuery: normalizedQuery,
      searchFilter: "all",
      sortOrder: "none",
      timeoutMs: ANALOG_LIVE_SEARCH_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 80,
      cacheTtlMs: RELATED_CACHE_TTL_MS,
      includePriceEnrichment: false,
      preferLegacySource: false,
      forceAllgoodsSource: true,
    }).catch(() => null),
    null,
    ANALOG_LIVE_SEARCH_TIMEOUT_MS
  );
  if (!liveResult || liveResult.correctedQuery) return [];
  return liveResult.items;
};

type AnalogQuery = { code: string; compact: string; pattern: RegExp; isOwnArticle: boolean };

const buildAnalogQuery = (code: string, isOwnArticle: boolean): AnalogQuery | null => {
  const compact = compactLookupCode(code);
  const pattern = buildCodeTokenPattern(code);
  if (!pattern || compact.length < (isOwnArticle ? 3 : MIN_CROSS_CODE_LENGTH)) return null;
  return { code: code.trim(), compact, pattern, isOwnArticle };
};

// 0 = the hit only contained the query as a fragment of some other number.
// Cross-reference lists are compared as parsed codes, not raw text: in
// "(OP574/2/OC404)" the code is "OP574/2", which must not count as "OP574".
const scoreAnalogQueryMatch = (item: CatalogProduct, query: AnalogQuery) => {
  if (compactLookupCode(item.article) === query.compact) return 12;
  if (compactLookupCode(item.code) === query.compact) return 10;
  const itemName = item.name || "";
  if (parseAnalogCodesFromName(itemName).some((code) => compactLookupCode(code) === query.compact)) {
    return 8;
  }
  if (query.pattern.test(itemName.replace(/\([^)]*\)/g, " "))) return 7;
  return 0;
};

const getAnalogProductsUncached = async (
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
  const targetCompactArticle = compactLookupCode(targetProduct.article);
  const targetCompactCode = compactLookupCode(code);

  const crossCodesFromName = (productName: string) =>
    parseAnalogCodesFromName(productName).filter((crossCode) => {
      const compact = compactLookupCode(crossCode);
      return compact !== targetCompactArticle && compact !== targetCompactCode;
    });

  const ownArticleQuery = targetProduct.article
    ? buildAnalogQuery(targetProduct.article, true)
    : null;
  const queries: AnalogQuery[] = ownArticleQuery ? [ownArticleQuery] : [];
  const addCrossCodeQueries = (crossCodes: string[]) => {
    for (const crossCode of crossCodes) {
      if (queries.length >= MAX_ANALOG_QUERIES) break;
      const query = buildAnalogQuery(crossCode, false);
      if (query && !queries.some((existing) => existing.compact === query.compact)) {
        queries.push(query);
      }
    }
  };
  addCrossCodeQueries(crossCodesFromName(name));
  if (queries.length === 0) return [] as RelatedProductCardItem[];

  const resultsByQuery = new Map<AnalogQuery, CatalogProduct[]>();
  const runQueries = async (pending: AnalogQuery[]) => {
    const groups = await Promise.all(pending.map((query) => searchCatalogLikeHeader(query.code)));
    pending.forEach((query, index) => resultsByQuery.set(query, groups[index]));
  };
  await runQueries(queries);

  // The client may only know the display name (cross codes stripped). The
  // article search usually returns the product itself — read its full 1C name
  // from there and run a second wave for its cross-reference numbers.
  if (queries.length === 1 && ownArticleQuery) {
    const self = (resultsByQuery.get(ownArticleQuery) || []).find(
      (item) =>
        (targetCompactCode && compactLookupCode(item.code) === targetCompactCode) ||
        (compactLookupCode(item.article) === targetCompactArticle &&
          normalizeLookupValue(item.producer) === normalizeLookupValue(targetProduct.producer))
    );
    if (self) {
      addCrossCodeQueries(crossCodesFromName(self.name));
      const pending = queries.filter((query) => !resultsByQuery.has(query));
      if (pending.length > 0) await runQueries(pending);
    }
  }

  const targetSubGroup = normalizeLookupValue(targetProduct.subGroup);
  const targetGroup = normalizeLookupValue(targetProduct.group || targetProduct.category);
  const scored = new Map<string, { item: CatalogProduct; score: number }>();

  for (const [query, items] of resultsByQuery) {
    for (const item of items) {
      const matchScore = scoreAnalogQueryMatch(item, query) + (query.isOwnArticle ? 4 : 0);
      if (matchScore === (query.isOwnArticle ? 4 : 0)) continue;
      const identity = buildRecommendationIdentity(item);
      const previous = scored.get(identity);
      // Each additional cross-reference number the item matches is extra
      // evidence it's the same part, so it adds on top of the best match.
      scored.set(identity, {
        item,
        score: previous ? Math.max(previous.score, matchScore) + 3 : matchScore,
      });
    }
  }

  const scoreByItem = new Map(Array.from(scored.values(), (entry) => [entry.item, entry.score]));
  // Same visibility as the header search: an in-catalog analog without a
  // price/photo yet is still a real cross-reference the buyer can ask about.
  const ranked = collectAndFilterUnique(Array.from(scoreByItem.keys()), targetProduct, {
    publicOnly: false,
  }).map((item) => {
    let score = scoreByItem.get(item) || 0;
    if (targetSubGroup && normalizeLookupValue(item.subGroup) === targetSubGroup) score += 3;
    if (targetGroup && normalizeLookupValue(item.group || item.category) === targetGroup) score += 1;
    if (item.quantity > 0) score += 2;
    if (typeof item.priceEuro === "number" && item.priceEuro > 0) score += 1;
    return { item, score };
  });

  return ranked
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.item.quantity > 0) - Number(left.item.quantity > 0) ||
        right.item.quantity - left.item.quantity
    )
    .slice(0, MAX_ANALOG_ITEMS)
    .map(({ item }) => toRelatedCardItem(item));
};

const getAnalogProductsCached = unstable_cache(
  getAnalogProductsUncached,
  ["product-analogs:header-search-v4"],
  { revalidate: 60 * 10 }
);

export const getAnalogProducts = cache(
  async (
    article: string,
    code: string,
    name = "",
    producer = "",
    group = "",
    subGroup = "",
    category = ""
  ) =>
    getAnalogProductsCached(
      article,
      code,
      name,
      producer,
      group,
      subGroup,
      category
    )
);
