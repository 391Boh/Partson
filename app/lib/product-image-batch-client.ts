"use client";

import {
  clearProductImageMissing,
  readProductImageMissing,
  readProductImageSuccess,
  writeProductImageMissing,
  writeProductImageSuccess,
} from "app/lib/product-image-client";
import { buildProductImageBatchKey } from "app/lib/product-image-path";

export type CatalogImageBatchRequestItem = {
  code: string;
  article?: string;
  hasPhoto?: boolean;
};

export type CatalogImageBatchResponseItem = {
  key: string;
  code: string;
  article?: string;
  status: "ready" | "missing";
  src?: string;
};

const CATALOG_IMAGE_BATCH_ROUTE = "/api/catalog-image-batch";
const MAX_BATCH_ITEMS = 48;
const BATCH_RESPONSE_CACHE_TTL_MS = 1000 * 8;

const batchResponseCache = new Map<
  string,
  { t: number; value: CatalogImageBatchResponseItem[] }
>();
const batchInFlight = new Map<string, Promise<CatalogImageBatchResponseItem[]>>();
const batchItemInFlight = new Map<string, Promise<CatalogImageBatchResponseItem>>();

type DeferredBatchItem = {
  promise: Promise<CatalogImageBatchResponseItem>;
  resolve: (value: CatalogImageBatchResponseItem) => void;
  reject: (reason?: unknown) => void;
};

const createDeferredBatchItem = (): DeferredBatchItem => {
  let resolve!: (value: CatalogImageBatchResponseItem) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<CatalogImageBatchResponseItem>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const buildBatchItemFlightKey = (
  item: CatalogImageBatchRequestItem,
  deep: boolean
) => `${deep ? "deep" : "fast"}::${buildProductImageBatchKey(item.code, item.article)}`;

const buildMissingBatchResult = (
  item: CatalogImageBatchRequestItem
): CatalogImageBatchResponseItem => ({
  key: buildProductImageBatchKey(item.code, item.article),
  code: item.code,
  article: item.article,
  status: "missing",
});

const persistBatchResults = (items: CatalogImageBatchResponseItem[]) => {
  for (const item of items) {
    if (item.status === "ready" && item.src) {
      clearProductImageMissing(item.code, item.article);
      writeProductImageSuccess(item.code, item.article, item.src);
      continue;
    }

    if (item.status === "missing") {
      writeProductImageMissing(item.code, item.article);
    }
  }
};

const pruneBatchResponseCache = () => {
  const now = Date.now();
  for (const [key, entry] of batchResponseCache.entries()) {
    if (!entry || now - entry.t > BATCH_RESPONSE_CACHE_TTL_MS) {
      batchResponseCache.delete(key);
    }
  }
};

const requestCatalogImageBatch = async (
  missingItems: CatalogImageBatchRequestItem[],
  options?: { deep?: boolean; signal?: AbortSignal }
) => {
  const response = await fetch(CATALOG_IMAGE_BATCH_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: missingItems,
      deep: options?.deep === true,
    }),
    cache: "no-store",
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Catalog image batch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    items?: CatalogImageBatchResponseItem[];
  };

  return Array.isArray(payload.items) ? payload.items : [];
};

const normalizeBatchItems = (items: CatalogImageBatchRequestItem[]) => {
  const seen = new Set<string>();
  const normalized: CatalogImageBatchRequestItem[] = [];

  for (const item of items) {
    const code = (item.code || "").trim();
    const article = (item.article || "").trim();
    const key = buildProductImageBatchKey(code, article);

    if (!code || !key || seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      code,
      article: article || undefined,
      hasPhoto: item.hasPhoto,
    });

    if (normalized.length >= MAX_BATCH_ITEMS) break;
  }

  return normalized;
};

export const fetchCatalogImageBatch = async (
  items: CatalogImageBatchRequestItem[],
  options?: { deep?: boolean; signal?: AbortSignal }
) => {
  if (typeof window === "undefined") return [];

  const normalizedItems = normalizeBatchItems(items);
  if (normalizedItems.length === 0) return [];

  const cachedResults: CatalogImageBatchResponseItem[] = [];
  const missingItems: CatalogImageBatchRequestItem[] = [];

  for (const item of normalizedItems) {
    if (item.hasPhoto === false) {
      writeProductImageMissing(item.code, item.article);
      cachedResults.push(buildMissingBatchResult(item));
      continue;
    }

    const cachedSrc = readProductImageSuccess(item.code, item.article);
    if (cachedSrc) {
      cachedResults.push({
        key: buildProductImageBatchKey(item.code, item.article),
        code: item.code,
        article: item.article,
        status: "ready",
        src: cachedSrc,
      });
      continue;
    }

    if (options?.deep !== true && readProductImageMissing(item.code, item.article)) {
      cachedResults.push({
        key: buildProductImageBatchKey(item.code, item.article),
        code: item.code,
        article: item.article,
        status: "missing",
      });
      continue;
    }

    missingItems.push(item);
  }

  if (missingItems.length === 0) {
    return cachedResults;
  }

  pruneBatchResponseCache();

  const requestCacheKey = JSON.stringify({
    deep: options?.deep === true,
    items: missingItems.map((item) => [item.code, item.article || ""]),
  });

  const cachedBatchResponse = batchResponseCache.get(requestCacheKey);
  if (cachedBatchResponse) {
    return [...cachedResults, ...cachedBatchResponse.value];
  }

  let requestPromise = batchInFlight.get(requestCacheKey);
  if (!requestPromise) {
    const deep = options?.deep === true;
    const existingItemPromises: Promise<CatalogImageBatchResponseItem>[] = [];
    const newItems: CatalogImageBatchRequestItem[] = [];
    const newItemFlightKeys: string[] = [];
    const deferredByItemKey = new Map<string, DeferredBatchItem>();

    for (const item of missingItems) {
      const itemKey = buildProductImageBatchKey(item.code, item.article);
      const flightKey = buildBatchItemFlightKey(item, deep);
      const existingItemPromise = batchItemInFlight.get(flightKey);

      if (existingItemPromise) {
        existingItemPromises.push(existingItemPromise);
        continue;
      }

      const deferred = createDeferredBatchItem();
      batchItemInFlight.set(flightKey, deferred.promise);
      newItems.push(item);
      newItemFlightKeys.push(flightKey);
      deferredByItemKey.set(itemKey, deferred);
    }

    const freshRequestPromise =
      newItems.length === 0
        ? Promise.resolve([] as CatalogImageBatchResponseItem[])
        : requestCatalogImageBatch(newItems, { deep })
            .then((results) => {
              const resultsByKey = new Map(
                results.map((result) => [result.key, result])
              );
              const normalizedResults = newItems.map((item) => {
                const key = buildProductImageBatchKey(item.code, item.article);
                return resultsByKey.get(key) ?? buildMissingBatchResult(item);
              });

              for (const result of normalizedResults) {
                deferredByItemKey.get(result.key)?.resolve(result);
              }

              return normalizedResults;
            })
            .catch((error) => {
              for (const deferred of deferredByItemKey.values()) {
                deferred.reject(error);
              }
              throw error;
            })
            .finally(() => {
              for (const flightKey of newItemFlightKeys) {
                batchItemInFlight.delete(flightKey);
              }
            });

    requestPromise = Promise.allSettled([
      freshRequestPromise,
      ...existingItemPromises,
    ]).then((settledResults) => {
      const resolvedItems: CatalogImageBatchResponseItem[] = [];
      let firstError: unknown = null;

      for (const settled of settledResults) {
        if (settled.status === "fulfilled") {
          if (Array.isArray(settled.value)) {
            resolvedItems.push(...settled.value);
          } else {
            resolvedItems.push(settled.value);
          }
          continue;
        }

        firstError ??= settled.reason;
      }

      if (resolvedItems.length === 0 && firstError) {
        throw firstError;
      }

      return resolvedItems;
    });

    batchInFlight.set(requestCacheKey, requestPromise);
  }

  const fetchedResults = await requestPromise.finally(() => {
    batchInFlight.delete(requestCacheKey);
  });

  batchResponseCache.set(requestCacheKey, {
    t: Date.now(),
    value: fetchedResults,
  });

  persistBatchResults(fetchedResults);

  return [...cachedResults, ...fetchedResults];
};

export const primeCatalogImageBatch = async (
  items: CatalogImageBatchRequestItem[],
  options?: { deep?: boolean; signal?: AbortSignal }
) => fetchCatalogImageBatch(items, options);
