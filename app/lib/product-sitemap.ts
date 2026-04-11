import { unstable_cache } from "next/cache";

import {
  fetchCatalogProductsByQuery,
  fetchPriceEuroMapByLookupKeys,
  type CatalogProduct,
} from "app/lib/catalog-server";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }

  return Math.floor(numeric);
};

const PRODUCT_SITEMAP_MAX_ITEMS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_ITEMS,
  3000
);

const PRODUCT_SITEMAP_MAX_PAGES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_PAGES,
  20
);

const PRODUCT_SITEMAP_PAGE_SIZE = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PAGE_SIZE,
  50
);

const PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
  2000
);

const PRODUCT_SITEMAP_PRICE_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PRICE_TIMEOUT_MS,
  1200
);

const PRODUCT_SITEMAP_SOURCE_PAGES_PER_CHUNK = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_PAGES_PER_CHUNK,
  1
);

const PRODUCT_SITEMAP_STOP_AFTER_EMPTY_PAGES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_STOP_AFTER_EMPTY_PAGES,
  2
);

const PRODUCT_SITEMAP_BUILD_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_BUILD_TIMEOUT_MS,
  8000
);

const PRODUCT_SITEMAP_BUILD_MAX_PAGES_PER_SITEMAP = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_BUILD_MAX_PAGES_PER_SITEMAP,
  1
);

const PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE,
  5
);

const PRODUCT_SITEMAP_EFFECTIVE_PAGES_PER_CHUNK = Math.max(
  1,
  Math.min(
    PRODUCT_SITEMAP_SOURCE_PAGES_PER_CHUNK,
    Math.max(1, Math.floor(PRODUCT_SITEMAP_MAX_ITEMS / PRODUCT_SITEMAP_PAGE_SIZE))
  )
);

const PRODUCT_SITEMAP_ID_COUNT = Math.min(
  5,
  Math.max(
    1,
    Math.ceil(PRODUCT_SITEMAP_MAX_PAGES / PRODUCT_SITEMAP_EFFECTIVE_PAGES_PER_CHUNK)
  )
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

const getLookupKeys = (product: Pick<CatalogProduct, "code" | "article">) =>
  Array.from(
    new Set([(product.article || "").trim(), (product.code || "").trim()].filter(Boolean))
  );

const hasInlinePrice = (product: Pick<CatalogProduct, "priceEuro">) =>
  typeof product.priceEuro === "number" &&
  Number.isFinite(product.priceEuro) &&
  product.priceEuro > 0;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
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

const resolveEntriesForCatalogPage = async (
  products: CatalogProduct[]
): Promise<ProductSitemapEntry[]> => {
  const validProducts = products.filter((product) => Boolean((product.code || "").trim()));

  if (validProducts.length === 0) {
    return [];
  }

  const withoutInlinePrice = validProducts.filter((product) => !hasInlinePrice(product));

  const priceLookupKeys = normalizeProductCodes(
    withoutInlinePrice.flatMap((product) => getLookupKeys(product))
  );

  const priceMap: Record<string, number> = {};

  if (priceLookupKeys.length > 0) {
    const keyChunks = chunkArray(
      priceLookupKeys,
      Math.max(1, PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE)
    );

    for (const keys of keyChunks) {
      try {
        const partialMap = await withTimeout(
          fetchPriceEuroMapByLookupKeys(keys, {
            sourceTimeoutMs: PRODUCT_SITEMAP_PRICE_TIMEOUT_MS,
            sourceCacheTtlMs: 1000 * 60 * 10,
            includeDirectLookup: true,
            includePricesPost: false,
            timeoutMs: PRODUCT_SITEMAP_PRICE_TIMEOUT_MS,
            retries: 1,
            retryDelayMs: 150,
            cacheTtlMs: 1000 * 60 * 15,
            directConcurrency: 8,
            maxKeys: 64,
          }),
          PRODUCT_SITEMAP_PRICE_TIMEOUT_MS + 1000
        );

        Object.assign(priceMap, partialMap);
      } catch {
        // Пропускаємо тільки цей батч lookup-ключів
      }
    }
  }

  return validProducts.flatMap((product) => {
    const normalizedCode = (product.code || "").trim();

    if (!normalizedCode) {
      return [];
    }

    const hasResolvedPrice =
      hasInlinePrice(product) ||
      getLookupKeys(product).some((key) => {
        const value = priceMap[key.trim().toLowerCase()];

        return typeof value === "number" && Number.isFinite(value) && value > 0;
      });

    if (!hasResolvedPrice) {
      return [];
    }

    return [
      {
        code: normalizedCode,
        article: (product.article || "").trim() || undefined,
        name: product.name,
        producer: product.producer,
        group: product.group,
        subGroup: product.subGroup,
        category: product.category,
      },
    ];
  });
};

export const getProductSitemapIds = async () => {
  return Array.from({ length: PRODUCT_SITEMAP_ID_COUNT }, (_, index) => ({
    id: String(index),
  }));
};

const buildProductEntriesForSitemapId = async (
  id: string
): Promise<ProductSitemapEntry[]> => {
  const numericId = Number.parseInt(id, 10);

  if (!Number.isFinite(numericId) || numericId < 0 || numericId >= PRODUCT_SITEMAP_ID_COUNT) {
    return [];
  }

  const startPage = numericId * PRODUCT_SITEMAP_EFFECTIVE_PAGES_PER_CHUNK + 1;

  if (startPage > PRODUCT_SITEMAP_MAX_PAGES) {
    return [];
  }

  const rawEndPage = Math.min(
    PRODUCT_SITEMAP_MAX_PAGES,
    startPage + PRODUCT_SITEMAP_EFFECTIVE_PAGES_PER_CHUNK - 1
  );

  const endPage = Math.min(
    rawEndPage,
    startPage + Math.max(1, PRODUCT_SITEMAP_BUILD_MAX_PAGES_PER_SITEMAP) - 1
  );

  const seenCodes = new Set<string>();
  const entries: ProductSitemapEntry[] = [];

  const startedAt = Date.now();
  let consecutiveEmptyPages = 0;
  let pageCursor = 1;
  let cursor = "";

  while (pageCursor <= endPage && entries.length < PRODUCT_SITEMAP_MAX_ITEMS) {
    if (Date.now() - startedAt >= PRODUCT_SITEMAP_BUILD_TIMEOUT_MS) {
      return entries;
    }

    let pageResult:
      | {
          items: CatalogProduct[];
          hasMore: boolean;
          nextCursor: string;
        }
      | null = null;

    try {
      pageResult = await withTimeout(
        fetchCatalogProductsByQuery({
          page: 1,
          limit: PRODUCT_SITEMAP_PAGE_SIZE,
          cursor,
          timeoutMs: PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
          retries: 1,
          retryDelayMs: 150,
          cacheTtlMs: 1000 * 60,
        }),
        PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS + 1000
      );
    } catch {
      return entries;
    }

    const batch = pageResult?.items ?? [];

    if (batch.length === 0) {
      consecutiveEmptyPages += 1;
    } else {
      consecutiveEmptyPages = 0;
    }

    if (pageCursor >= startPage && batch.length > 0) {
      try {
        const remainingTime = PRODUCT_SITEMAP_BUILD_TIMEOUT_MS - (Date.now() - startedAt);

        if (remainingTime <= 0) {
          return entries;
        }

        const pageEntries = await withTimeout(
          resolveEntriesForCatalogPage(batch),
          Math.max(1000, remainingTime)
        );

        for (const entry of pageEntries) {
          const dedupeKey = entry.code.trim().toLowerCase();

          if (!dedupeKey || seenCodes.has(dedupeKey)) {
            continue;
          }

          seenCodes.add(dedupeKey);
          entries.push(entry);

          if (entries.length >= PRODUCT_SITEMAP_MAX_ITEMS) {
            return entries;
          }
        }
      } catch {
        return entries;
      }
    }

    if (consecutiveEmptyPages >= PRODUCT_SITEMAP_STOP_AFTER_EMPTY_PAGES) {
      return entries;
    }

    if (!pageResult?.hasMore || !pageResult?.nextCursor) {
      return entries;
    }

    cursor = pageResult.nextCursor;
    pageCursor += 1;
  }

  return entries;
};

const getProductEntriesBySitemapIdWithCache = unstable_cache(
  buildProductEntriesForSitemapId,
  [
    `product-sitemap-entries-v12-${PRODUCT_SITEMAP_MAX_ITEMS}-${PRODUCT_SITEMAP_MAX_PAGES}-${PRODUCT_SITEMAP_PAGE_SIZE}-${PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS}-${PRODUCT_SITEMAP_PRICE_TIMEOUT_MS}-${PRODUCT_SITEMAP_SOURCE_PAGES_PER_CHUNK}-${PRODUCT_SITEMAP_EFFECTIVE_PAGES_PER_CHUNK}-${PRODUCT_SITEMAP_STOP_AFTER_EMPTY_PAGES}-${PRODUCT_SITEMAP_BUILD_TIMEOUT_MS}-${PRODUCT_SITEMAP_BUILD_MAX_PAGES_PER_SITEMAP}-${PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE}-${PRODUCT_SITEMAP_ID_COUNT}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-sitemap"],
  }
);

export const getProductEntriesBySitemapId = async (id: string) =>
  getProductEntriesBySitemapIdWithCache(id);

export const getProductCodesBySitemapId = async (id: string) => {
  const entries = await getProductEntriesBySitemapId(id);
  return normalizeProductCodes(entries.map((entry) => entry.code));
};