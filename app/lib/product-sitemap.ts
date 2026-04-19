import { unstable_cache } from "next/cache";

import {
  fetchCatalogProductsByQuery,
  type CatalogProduct,
} from "app/lib/catalog-server";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }

  return Math.floor(numeric);
};

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.floor(numeric);
};

const PRODUCT_SITEMAP_MAX_ITEMS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_ITEMS,
  1000
);

const PRODUCT_SITEMAP_MAX_BATCHES = parseOptionalPositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_BATCHES
);

const PRODUCT_SITEMAP_QUERY_PAGE_SIZE = Math.min(
  500,
  parsePositiveInt(process.env.PRODUCT_SITEMAP_PAGE_SIZE, 500)
);

const PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
  8000
);

const PRODUCT_SITEMAP_BUILD_TIMEOUT_MS = parseOptionalPositiveInt(
  process.env.PRODUCT_SITEMAP_BUILD_TIMEOUT_MS
);

const PRODUCT_SITEMAP_MAX_SOURCE_PAGES = parseOptionalPositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_SOURCE_PAGES
);

const formatLoggedError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message.trim();
  }

  if (typeof error === "string") {
    return error.trim();
  }

  return "";
};

const logProductSitemapFailure = (message: string, error: unknown) => {
  const formattedError = formatLoggedError(error);
  console.warn(formattedError ? `${message}: ${formattedError}` : message);
};

export type ProductSitemapEntry = {
  code: string;
  article?: string;
  name?: string;
  producer?: string;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
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
    hasPhoto: product.hasPhoto,
  };
};

async function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

const buildProductSitemapEntryBatches = async (): Promise<ProductSitemapEntry[][]> => {
  const seenCodes = new Set<string>();
  const seenRequestStates = new Set<string>();
  const batches: ProductSitemapEntry[][] = [];
  let currentBatch: ProductSitemapEntry[] = [];
  const startedAt = Date.now();
  let cursor = "";
  let page = 1;
  let sourcePageCount = 0;

  while (true) {
    if (
      PRODUCT_SITEMAP_MAX_SOURCE_PAGES != null &&
      sourcePageCount >= PRODUCT_SITEMAP_MAX_SOURCE_PAGES
    ) {
      break;
    }

    if (
      PRODUCT_SITEMAP_BUILD_TIMEOUT_MS != null &&
      Date.now() - startedAt >= PRODUCT_SITEMAP_BUILD_TIMEOUT_MS
    ) {
      break;
    }

    const requestState = cursor ? `cursor:${cursor}` : `page:${page}`;
    if (seenRequestStates.has(requestState)) {
      break;
    }
    seenRequestStates.add(requestState);
    sourcePageCount += 1;

    const fallbackPageResult: Awaited<ReturnType<typeof fetchCatalogProductsByQuery>> = {
      items: [],
      hasMore: false,
      nextCursor: "",
      cursorField: null,
    };

    const pageResult = await withTimeoutFallback(
      fetchCatalogProductsByQuery({
        page,
        limit: PRODUCT_SITEMAP_QUERY_PAGE_SIZE,
        cursor,
        timeoutMs: PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
        retries: 2,
        retryDelayMs: 180,
        cacheTtlMs: 1000 * 60,
      }),
      PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS + 1000,
      fallbackPageResult
    );

    if (pageResult.items.length === 0 && fallbackPageResult !== pageResult) {
      // Normal empty page, continue to the shared termination logic below.
    } else if (pageResult.items.length === 0) {
      logProductSitemapFailure(
        `Failed to fetch product sitemap source page for state "${requestState}"`,
        `Operation timed out after ${PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS + 1000}ms`
      );
      break;
    }

    for (const product of pageResult.items) {
      const entry = toProductSitemapEntry(product);
      if (!entry) {
        continue;
      }

      const dedupeKey = entry.code.trim().toLowerCase();
      if (!dedupeKey || seenCodes.has(dedupeKey)) {
        continue;
      }

      seenCodes.add(dedupeKey);
      currentBatch.push(entry);

      if (currentBatch.length >= PRODUCT_SITEMAP_MAX_ITEMS) {
        batches.push(currentBatch);
        if (
          PRODUCT_SITEMAP_MAX_BATCHES != null &&
          batches.length >= PRODUCT_SITEMAP_MAX_BATCHES
        ) {
          return batches;
        }
        currentBatch = [];
      }
    }

    if (!pageResult.hasMore) {
      break;
    }

    const nextCursor = (pageResult.nextCursor || "").trim();
    if (nextCursor) {
      cursor = nextCursor;
      continue;
    }

    cursor = "";
    page += 1;

    if (pageResult.items.length < PRODUCT_SITEMAP_QUERY_PAGE_SIZE) {
      break;
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
    `product-sitemap-entries-v19-priced-canonical-images-${PRODUCT_SITEMAP_MAX_ITEMS}-${PRODUCT_SITEMAP_MAX_BATCHES ?? "all"}-${PRODUCT_SITEMAP_QUERY_PAGE_SIZE}-${PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS}-${PRODUCT_SITEMAP_BUILD_TIMEOUT_MS ?? "none"}-${PRODUCT_SITEMAP_MAX_SOURCE_PAGES ?? "all"}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-sitemap"],
  }
);

const getProductSitemapEntryBatchesSafe = async () => {
  try {
    return await getProductSitemapEntryBatchesWithCache();
  } catch (error) {
    logProductSitemapFailure("Failed to resolve cached product sitemap entry batches", error);
    return [] as ProductSitemapEntry[][];
  }
};

export const getProductSitemapIds = async () => {
  const batches = await getProductSitemapEntryBatchesSafe();

  return batches.map((_, index) => ({
    id: String(index),
  }));
};

export const getProductEntriesBySitemapId = async (id: string) => {
  const numericId = Number.parseInt(id, 10);

  if (!Number.isFinite(numericId) || numericId < 0) {
    return [];
  }

  return (await getProductSitemapEntryBatchesSafe())[numericId] ?? [];
};

export const getAllProductSitemapEntries = async () => {
  const batches = await getProductSitemapEntryBatchesSafe();
  return batches.flat();
};

export const getProductCodesBySitemapId = async (id: string) => {
  const entries = await getProductEntriesBySitemapId(id);
  return normalizeProductCodes(entries.map((entry) => entry.code));
};
