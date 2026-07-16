import { readFile } from "node:fs/promises";

import {
  fetchPriceEuroMapByLookupKeys,
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
  parsePositiveInt(process.env.PRODUCT_SITEMAP_PAGE_SIZE, 180)
);

const PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
  6000
);

// A single slow/dropped 1C response used to abort the whole sitemap/feed
// build with zero retries — one transient timeout on page 1 meant an empty
// Google Merchant feed run. Retry a couple of times before giving up, and
// size the outer fallback window to fit every attempt plus backoff.
const PRODUCT_SITEMAP_SOURCE_RETRIES = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_RETRIES,
  2
);
const PRODUCT_SITEMAP_SOURCE_RETRY_DELAY_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_SOURCE_RETRY_DELAY_MS,
  500
);
const PRODUCT_SITEMAP_SOURCE_FALLBACK_TIMEOUT_MS =
  PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS * (PRODUCT_SITEMAP_SOURCE_RETRIES + 1) +
  PRODUCT_SITEMAP_SOURCE_RETRY_DELAY_MS * PRODUCT_SITEMAP_SOURCE_RETRIES +
  2000;

const PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE,
  40
);

const PRODUCT_SITEMAP_PRICE_LOOKUP_CONCURRENCY = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PRICE_LOOKUP_CONCURRENCY,
  2
);

const PRODUCT_SITEMAP_PRICE_LOOKUP_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_SITEMAP_PRICE_LOOKUP_TIMEOUT_MS,
  5000
);

const PRODUCT_SITEMAP_PRICE_LOOKUP_LIMIT =
  parseOptionalPositiveInt(process.env.PRODUCT_SITEMAP_PRICE_LOOKUP_LIMIT) ?? 0;

const PRODUCT_SITEMAP_BUILD_TIMEOUT_MS = parseOptionalPositiveInt(
  process.env.PRODUCT_SITEMAP_BUILD_TIMEOUT_MS
);

const PRODUCT_SITEMAP_MAX_SOURCE_PAGES = parseOptionalPositiveInt(
  process.env.PRODUCT_SITEMAP_MAX_SOURCE_PAGES
);

const PRODUCT_SITEMAP_SNAPSHOT_PATH = ".cache/product-sitemap-entries.json";
const PRODUCT_SITEMAP_PRICED_SNAPSHOT_PATH =
  ".cache/product-sitemap-priced-entries.json";

const shouldBypassProductSitemapCache = () =>
  process.env.PRODUCT_SITEMAP_DISABLE_CACHE === "1";

const shouldUseProductSitemapSnapshot = () =>
  !shouldBypassProductSitemapCache() &&
  process.env.PRODUCT_SITEMAP_USE_SNAPSHOT !== "0";

let productSitemapEntryBatchesMemory: ProductSitemapEntry[][] | null = null;
let productSitemapEntryBatchesPromise: Promise<ProductSitemapEntry[][]> | null = null;
let pricedProductSitemapEntryBatchesMemory: ProductSitemapEntry[][] | null = null;
let pricedProductSitemapEntryBatchesPromise: Promise<ProductSitemapEntry[][]> | null = null;

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
  quantity: number;
  priceEuro?: number | null;
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

const toProductSitemapEntry = (product: CatalogProduct): ProductSitemapEntry | null => {
  const code = (product.code || "").trim();

  if (!code) {
    return null;
  }
  const priceEuro =
    typeof product.priceEuro === "number" &&
    Number.isFinite(product.priceEuro) &&
    product.priceEuro > 0
      ? product.priceEuro
      : null;

  return {
    code,
    article: (product.article || "").trim() || undefined,
    name: product.name,
    producer: product.producer,
    group: product.group,
    subGroup: product.subGroup,
    category: product.category,
    hasPhoto: product.hasPhoto,
    quantity: Number.isFinite(product.quantity) ? Math.max(0, product.quantity) : 0,
    priceEuro,
  };
};

const toSnapshotProductSitemapEntry = (value: unknown): ProductSitemapEntry | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<ProductSitemapEntry>;
  const code = (record.code || "").trim();
  if (!code) return null;

  const article = (record.article || "").trim();
  const name = (record.name || "").trim();
  const producer = (record.producer || "").trim();
  const group = (record.group || "").trim();
  const subGroup = (record.subGroup || "").trim();
  const category = (record.category || "").trim();
  const quantity =
    typeof record.quantity === "number" && Number.isFinite(record.quantity)
      ? Math.max(0, record.quantity)
      : 0;
  const priceEuro =
    typeof record.priceEuro === "number" &&
    Number.isFinite(record.priceEuro) &&
    record.priceEuro > 0
      ? record.priceEuro
      : null;

  return {
    code,
    article: article || undefined,
    name: name || undefined,
    producer: producer || undefined,
    group: group || undefined,
    subGroup: subGroup || undefined,
    category: category || undefined,
    hasPhoto: record.hasPhoto,
    quantity,
    priceEuro,
  };
};

const readProductSitemapEntriesSnapshot = async () => {
  const text = await readFile(PRODUCT_SITEMAP_SNAPSHOT_PATH, "utf8").catch(() => "");
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    const rawEntries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : [];

    return rawEntries
      .map(toSnapshotProductSitemapEntry)
      .filter((entry): entry is ProductSitemapEntry => Boolean(entry));
  } catch (error) {
    logProductSitemapFailure("Failed to read product sitemap snapshot", error);
    return [];
  }
};

const readPricedProductSitemapEntriesSnapshot = async () => {
  const text = await readFile(PRODUCT_SITEMAP_PRICED_SNAPSHOT_PATH, "utf8").catch(
    () => ""
  );
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    const rawEntries = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : [];

    return rawEntries
      .map(toSnapshotProductSitemapEntry)
      .filter((entry): entry is ProductSitemapEntry =>
        Boolean(entry && isPricedProductSitemapEntry(entry))
      );
  } catch (error) {
    logProductSitemapFailure("Failed to read priced product sitemap snapshot", error);
    return [];
  }
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
        includePriceEnrichment: false,
        preferLegacySource: false,
        forceAllgoodsSource: true,
        pricedItemsOnly: false,
        timeoutMs: PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS,
        retries: PRODUCT_SITEMAP_SOURCE_RETRIES,
        retryDelayMs: PRODUCT_SITEMAP_SOURCE_RETRY_DELAY_MS,
        cacheTtlMs: 1000 * 60 * 5,
      }),
      PRODUCT_SITEMAP_SOURCE_FALLBACK_TIMEOUT_MS,
      fallbackPageResult
    );

    if (pageResult.items.length === 0 && fallbackPageResult !== pageResult) {
      // Normal empty page, continue to the shared termination logic below.
    } else if (pageResult.items.length === 0) {
      const message = `Failed to fetch product sitemap source page for state "${requestState}"`;
      const timeoutMessage = `Operation timed out after ${PRODUCT_SITEMAP_SOURCE_FALLBACK_TIMEOUT_MS}ms (${PRODUCT_SITEMAP_SOURCE_RETRIES + 1} attempts of ${PRODUCT_SITEMAP_SOURCE_TIMEOUT_MS}ms each)`;
      logProductSitemapFailure(message, timeoutMessage);

      if (batches.length === 0 && currentBatch.length === 0) {
        throw new Error(`${message}: ${timeoutMessage}`);
      }

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
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const getProductSitemapEntryBatchesSafe = async () => {
  if (shouldBypassProductSitemapCache()) {
    return buildProductSitemapEntryBatches();
  }

  if (shouldUseProductSitemapSnapshot()) {
    if (productSitemapEntryBatchesMemory) {
      return productSitemapEntryBatchesMemory;
    }

    if (productSitemapEntryBatchesPromise) {
      return productSitemapEntryBatchesPromise;
    }

    productSitemapEntryBatchesPromise = readProductSitemapEntriesSnapshot()
      .then((entries) => chunkProductSitemapEntries(entries))
      .then((batches) => {
        productSitemapEntryBatchesMemory = batches;
        return batches;
      })
      .finally(() => {
        productSitemapEntryBatchesPromise = null;
      });

    try {
      return await productSitemapEntryBatchesPromise;
    } catch (error) {
      logProductSitemapFailure("Failed to resolve product sitemap entry batches", error);
      return [] as ProductSitemapEntry[][];
    }
  }

  if (productSitemapEntryBatchesMemory) {
    return productSitemapEntryBatchesMemory;
  }

  if (productSitemapEntryBatchesPromise) {
    return productSitemapEntryBatchesPromise;
  }

  productSitemapEntryBatchesPromise = buildProductSitemapEntryBatches()
    .then((batches) => {
      productSitemapEntryBatchesMemory = batches;
      return batches;
    })
    .finally(() => {
      productSitemapEntryBatchesPromise = null;
    });

  try {
    return await productSitemapEntryBatchesPromise;
  } catch (error) {
    logProductSitemapFailure("Failed to resolve product sitemap entry batches", error);
    return [] as ProductSitemapEntry[][];
  }
};

const isPricedProductSitemapEntry = (entry: ProductSitemapEntry) =>
  typeof entry.priceEuro === "number" &&
  Number.isFinite(entry.priceEuro) &&
  entry.priceEuro > 0;

const getProductSitemapEntryLookupKeys = (entry: ProductSitemapEntry) =>
  Array.from(
    new Set(
      [entry.article, entry.code]
        .map((value) => (value || "").trim())
        .filter(Boolean)
    )
  );

const hasResolvedPrice = (
  prices: Record<string, number>,
  entry: ProductSitemapEntry
) => {
  const articleKey = (entry.article || "").trim().toLowerCase();
  const codeKey = (entry.code || "").trim().toLowerCase();
  const price = (articleKey ? prices[articleKey] : undefined) ?? prices[codeKey];

  return typeof price === "number" && Number.isFinite(price) && price > 0;
};

const lookupProductSitemapPrices = async (
  entries: ProductSitemapEntry[],
  options?: { includeDirectLookup?: boolean }
) => {
  const prices: Record<string, number> = {};
  const chunkSize = Math.max(1, PRODUCT_SITEMAP_PRICE_LOOKUP_CHUNK_SIZE);
  const chunks: ProductSitemapEntry[][] = [];

  for (let start = 0; start < entries.length; start += chunkSize) {
    chunks.push(entries.slice(start, start + chunkSize));
  }

  let nextChunkIndex = 0;
  const workerCount = Math.min(
    Math.max(1, PRODUCT_SITEMAP_PRICE_LOOKUP_CONCURRENCY),
    chunks.length
  );

  const runWorker = async () => {
    while (nextChunkIndex < chunks.length) {
      const chunkIndex = nextChunkIndex;
      nextChunkIndex += 1;
      const chunk = chunks[chunkIndex] ?? [];
      const lookupKeys = Array.from(
        new Set(chunk.flatMap(getProductSitemapEntryLookupKeys))
      );
      if (lookupKeys.length === 0) continue;

      const chunkPrices = await fetchPriceEuroMapByLookupKeys(lookupKeys, {
        sourceTimeoutMs: PRODUCT_SITEMAP_PRICE_LOOKUP_TIMEOUT_MS,
        sourceCacheTtlMs: 1000 * 60 * 5,
        timeoutMs: PRODUCT_SITEMAP_PRICE_LOOKUP_TIMEOUT_MS,
        retries: 1,
        retryDelayMs: 180,
        cacheTtlMs: 1000 * 60 * 10,
        includeDirectLookup: options?.includeDirectLookup === true,
        includePricesPost: true,
        directConcurrency: 2,
        maxKeys: lookupKeys.length,
      }).catch(() => ({} as Record<string, number>));

      for (const [key, value] of Object.entries(chunkPrices)) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        prices[key] = value;
      }
    }
  };

  await Promise.allSettled(Array.from({ length: workerCount }, runWorker));
  return prices;
};

const enrichProductSitemapEntriesWithPrices = async (
  entries: ProductSitemapEntry[]
) => {
  const missingPriceEntries = entries
    .filter((entry) => !isPricedProductSitemapEntry(entry))
    .slice(0, PRODUCT_SITEMAP_PRICE_LOOKUP_LIMIT);

  if (missingPriceEntries.length === 0) {
    return entries;
  }

  const sourcePrices = await lookupProductSitemapPrices(missingPriceEntries, {
    includeDirectLookup: false,
  });
  const directLookupEntries = missingPriceEntries.filter(
    (entry) => !hasResolvedPrice(sourcePrices, entry)
  );
  const directPrices =
    directLookupEntries.length > 0
      ? await lookupProductSitemapPrices(directLookupEntries, {
          includeDirectLookup: true,
        })
      : {};
  const prices = {
    ...sourcePrices,
    ...directPrices,
  };

  if (Object.keys(prices).length === 0) {
    return entries;
  }

  return entries.map((entry) => {
    if (isPricedProductSitemapEntry(entry)) {
      return entry;
    }

    const articleKey = (entry.article || "").trim().toLowerCase();
    const codeKey = (entry.code || "").trim().toLowerCase();
    const priceEuro = (articleKey ? prices[articleKey] : undefined) ?? prices[codeKey];

    if (
      typeof priceEuro !== "number" ||
      !Number.isFinite(priceEuro) ||
      priceEuro <= 0
    ) {
      return entry;
    }

    return {
      ...entry,
      priceEuro,
    };
  });
};

const chunkProductSitemapEntries = (entries: ProductSitemapEntry[]) => {
  const batches: ProductSitemapEntry[][] = [];

  for (let index = 0; index < entries.length; index += PRODUCT_SITEMAP_MAX_ITEMS) {
    batches.push(entries.slice(index, index + PRODUCT_SITEMAP_MAX_ITEMS));
  }

  return batches;
};

const getPricedProductSitemapEntryBatchesSafe = async () => {
  if (shouldBypassProductSitemapCache()) {
    const allEntries = (await buildProductSitemapEntryBatches()).flat();
    const enrichedEntries = await enrichProductSitemapEntriesWithPrices(allEntries);
    return chunkProductSitemapEntries(
      enrichedEntries.filter(isPricedProductSitemapEntry)
    );
  }

  if (shouldUseProductSitemapSnapshot()) {
    if (pricedProductSitemapEntryBatchesMemory) {
      return pricedProductSitemapEntryBatchesMemory;
    }

    if (pricedProductSitemapEntryBatchesPromise) {
      return pricedProductSitemapEntryBatchesPromise;
    }

    pricedProductSitemapEntryBatchesPromise =
      readPricedProductSitemapEntriesSnapshot()
        .then(async (entries) => {
          if (entries.length > 0) {
            return entries;
          }

          const allSnapshotEntries = await readProductSitemapEntriesSnapshot();
          return allSnapshotEntries.filter(isPricedProductSitemapEntry);
        })
        .then((entries) => chunkProductSitemapEntries(entries))
        .then((batches) => {
          pricedProductSitemapEntryBatchesMemory = batches;
          return batches;
        })
        .finally(() => {
          pricedProductSitemapEntryBatchesPromise = null;
        });

    try {
      return await pricedProductSitemapEntryBatchesPromise;
    } catch (error) {
      logProductSitemapFailure("Failed to resolve priced product sitemap batches", error);
      return [] as ProductSitemapEntry[][];
    }
  }

  if (pricedProductSitemapEntryBatchesMemory) {
    return pricedProductSitemapEntryBatchesMemory;
  }

  if (pricedProductSitemapEntryBatchesPromise) {
    return pricedProductSitemapEntryBatchesPromise;
  }

  pricedProductSitemapEntryBatchesPromise = getProductSitemapEntryBatchesSafe()
    .then((batches) =>
      enrichProductSitemapEntriesWithPrices(batches.flat())
    )
    .then((entries) =>
      chunkProductSitemapEntries(entries.filter(isPricedProductSitemapEntry))
    )
    .then((batches) => {
      pricedProductSitemapEntryBatchesMemory = batches;
      return batches;
    })
    .finally(() => {
      pricedProductSitemapEntryBatchesPromise = null;
    });

  try {
    return await pricedProductSitemapEntryBatchesPromise;
  } catch (error) {
    logProductSitemapFailure("Failed to resolve priced product sitemap batches", error);
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

export const getAllPricedProductSitemapEntries = async () => {
  const batches = await getPricedProductSitemapEntryBatchesSafe();
  return batches.flat();
};

export const getAllProductSitemapSnapshotEntries = async () =>
  readProductSitemapEntriesSnapshot();

export const getAllPricedProductSitemapSnapshotEntries = async () => {
  const pricedEntries = await readPricedProductSitemapEntriesSnapshot();
  if (pricedEntries.length > 0) return pricedEntries;

  const allEntries = await readProductSitemapEntriesSnapshot();
  return allEntries.filter(isPricedProductSitemapEntry);
};

export const getProductCodesBySitemapId = async (id: string) => {
  const entries = await getProductEntriesBySitemapId(id);
  return normalizeProductCodes(entries.map((entry) => entry.code));
};

export const getPricedProductSitemapIds = async () => {
  const batches = await getPricedProductSitemapEntryBatchesSafe();

  return batches.map((_, index) => ({
    id: String(index),
  }));
};

export const getPricedProductEntriesBySitemapId = async (id: string) => {
  const numericId = Number.parseInt(id, 10);

  if (!Number.isFinite(numericId) || numericId < 0) {
    return [];
  }

  return (await getPricedProductSitemapEntryBatchesSafe())[numericId] ?? [];
};
