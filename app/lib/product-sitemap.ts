import { unstable_cache } from "next/cache";

import {
  fetchCatalogProductsByQuery,
  type CatalogProduct,
} from "app/lib/catalog-server";
import { getProductTreeDataset } from "app/lib/product-tree";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }

  return Math.floor(numeric);
};

const PRODUCT_SITEMAP_MAX_ITEMS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_ITEMS,
  1000
);

const PRODUCT_SITEMAP_MAX_BATCHES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_BATCHES,
  20
);

const PRODUCT_SITEMAP_QUERY_PAGE_SIZE = Math.min(
  500,
  parsePositiveInt(process.env.PRODUCT_SITEMAP_PAGE_SIZE, 500)
);

const PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
  4000
);

const PRODUCT_SITEMAP_BUILD_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_BUILD_TIMEOUT_MS,
  30000
);

const PRODUCT_SITEMAP_MAX_SOURCE_QUERIES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_SOURCE_QUERIES ||
    process.env.PRODUCT_SITEMAP_MAX_SOURCE_PAGES,
  200
);

const PRODUCT_SITEMAP_MAX_QUERY_PAGES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_QUERY_PAGES,
  8
);

export type ProductSitemapEntry = {
  code: string;
  article?: string;
  name?: string;
  producer?: string;
  group?: string;
  subGroup?: string;
  category?: string;
};

type ProductSitemapQuery = {
  key: string;
  group?: string;
  subcategory?: string;
  producer?: string;
};

const normalizeProductCodes = (codes: string[]) => {
  const seen = new Set<string>();
  const uniqueCodes: string[] = [];

  for (const rawCode of codes) {
    const code = (rawCode || "").trim();

    if (!code) {
      continue;
    }

    const dedupeKey = code.toLowerCase();

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    uniqueCodes.push(code);
  }

  return uniqueCodes;
};

const normalizeLabel = (value?: string | null) => (value || "").replace(/\s+/g, " ").trim();

const hasSitemapEligiblePrice = (product: CatalogProduct) =>
  typeof product.priceEuro === "number" && Number.isFinite(product.priceEuro) && product.priceEuro > 0;

const toProductSitemapEntry = (product: CatalogProduct): ProductSitemapEntry | null => {
  const code = (product.code || "").trim();

  if (!code || !hasSitemapEligiblePrice(product)) {
    return null;
  }

  return {
    code,
    article: (product.article || "").trim() || undefined,
    name: product.name,
    producer: product.producer,
    group: product.group,
    subGroup: product.subGroup,
    category: product.category,
  };
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

const buildProductSitemapQueries = async (): Promise<ProductSitemapQuery[]> => {
  const queries: ProductSitemapQuery[] = [
    {
      key: "all-priced",
    },
  ];
  const seen = new Set<string>();

  const addQuery = (query: ProductSitemapQuery) => {
    if (seen.has(query.key)) {
      return;
    }

    seen.add(query.key);
    queries.push(query);
  };

  seen.add("all-priced");

  const dataset = await getProductTreeDataset().catch(() => null);

  if (dataset) {
    for (const group of dataset.groups) {
      const groupLabel = normalizeLabel(group.label);

      if (!groupLabel) {
        continue;
      }

      if (group.subgroups.length === 0) {
        addQuery({
          key: `group:${groupLabel.toLowerCase()}`,
          group: groupLabel,
        });
        continue;
      }

      for (const subgroup of group.subgroups) {
        const subgroupLabel = normalizeLabel(subgroup.label);

        if (!subgroupLabel) {
          continue;
        }

        addQuery({
          key: `group:${groupLabel.toLowerCase()}|sub:${subgroupLabel.toLowerCase()}`,
          group: groupLabel,
          subcategory: subgroupLabel,
        });

        for (const child of subgroup.children) {
          const childLabel = normalizeLabel(child.label);

          if (!childLabel || childLabel.toLowerCase() === subgroupLabel.toLowerCase()) {
            continue;
          }

          addQuery({
            key: `group:${groupLabel.toLowerCase()}|leaf:${childLabel.toLowerCase()}`,
            group: groupLabel,
            subcategory: childLabel,
          });
        }
      }
    }
  }

  return queries;
};

const fetchEntriesForQuery = async (
  query: ProductSitemapQuery
): Promise<ProductSitemapEntry[]> => {
  const entries: ProductSitemapEntry[] = [];
  const seenCodes = new Set<string>();
  let page = 1;
  let cursor = "";
  let cursorField: string | null = null;

  while (page <= PRODUCT_SITEMAP_MAX_QUERY_PAGES) {
    const pageResult: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>> = await withTimeout(
      fetchCatalogProductsByQuery({
        page,
        limit: PRODUCT_SITEMAP_QUERY_PAGE_SIZE,
        group: query.group,
        subcategory: query.subcategory,
        producer: query.producer,
        sortOrder: "desc",
        cursor,
        cursorField,
        timeoutMs: PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
        retries: 2,
        retryDelayMs: 180,
        cacheTtlMs: 1000 * 60,
      }),
      PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS + 1000
    );

    for (const product of pageResult.items) {
      const entry = toProductSitemapEntry(product);
      if (!entry) continue;

      const dedupeKey = entry.code.trim().toLowerCase();
      if (!dedupeKey || seenCodes.has(dedupeKey)) continue;

      seenCodes.add(dedupeKey);
      entries.push(entry);
    }

    if (!pageResult.hasMore) break;

    if (pageResult.nextCursor) {
      cursor = pageResult.nextCursor;
      cursorField = pageResult.cursorField ?? null;
    } else {
      page += 1;
    }

    if (!pageResult.nextCursor) {
      cursor = "";
      cursorField = null;
    }

    if (pageResult.nextCursor) {
      page += 1;
    }
  }

  return entries;
};

const buildProductSitemapEntryBatches = async (): Promise<ProductSitemapEntry[][]> => {
  const queries = await buildProductSitemapQueries();
  const seenCodes = new Set<string>();
  const batches: ProductSitemapEntry[][] = [];
  let currentBatch: ProductSitemapEntry[] = [];
  const startedAt = Date.now();
  let processedQueries = 0;

  for (const query of queries) {
    if (
      PRODUCT_SITEMAP_MAX_SOURCE_QUERIES != null &&
      processedQueries >= PRODUCT_SITEMAP_MAX_SOURCE_QUERIES
    ) {
      break;
    }

    if (
      PRODUCT_SITEMAP_BUILD_TIMEOUT_MS != null &&
      Date.now() - startedAt >= PRODUCT_SITEMAP_BUILD_TIMEOUT_MS
    ) {
      break;
    }

    processedQueries += 1;

    let entries: ProductSitemapEntry[] = [];

    try {
      entries = await fetchEntriesForQuery(query);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const dedupeKey = entry.code.trim().toLowerCase();

      if (!dedupeKey || seenCodes.has(dedupeKey)) {
        continue;
      }

      seenCodes.add(dedupeKey);
      currentBatch.push(entry);

      if (currentBatch.length >= PRODUCT_SITEMAP_MAX_ITEMS) {
        batches.push(currentBatch);
        if (batches.length >= PRODUCT_SITEMAP_MAX_BATCHES) {
          return batches;
        }
        currentBatch = [];
      }
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const getProductSitemapEntryBatchesWithCache = unstable_cache(
  buildProductSitemapEntryBatches,
  [
    `product-sitemap-entries-v17-${PRODUCT_SITEMAP_MAX_ITEMS}-${PRODUCT_SITEMAP_MAX_BATCHES}-${PRODUCT_SITEMAP_QUERY_PAGE_SIZE}-${PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS}-${PRODUCT_SITEMAP_BUILD_TIMEOUT_MS ?? "none"}-${PRODUCT_SITEMAP_MAX_SOURCE_QUERIES ?? "all"}-${PRODUCT_SITEMAP_MAX_QUERY_PAGES}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-sitemap"],
  }
);

export const getProductSitemapIds = async () => {
  const batches = await getProductSitemapEntryBatchesWithCache();

  return batches.map((_, index) => ({
    id: String(index),
  }));
};

export const getProductEntriesBySitemapId = async (id: string) => {
  const numericId = Number.parseInt(id, 10);

  if (!Number.isFinite(numericId) || numericId < 0) {
    return [];
  }

  return (await getProductSitemapEntryBatchesWithCache())[numericId] ?? [];
};

export const getProductCodesBySitemapId = async (id: string) => {
  const entries = await getProductEntriesBySitemapId(id);
  return normalizeProductCodes(entries.map((entry) => entry.code));
};
