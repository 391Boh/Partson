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
};

export type CatalogImageBatchResponseItem = {
  key: string;
  code: string;
  article?: string;
  status: "ready" | "missing";
  src?: string;
};

const CATALOG_IMAGE_BATCH_ROUTE = "/api/catalog-image-batch";
const MAX_BATCH_ITEMS = 20;

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

    if (readProductImageMissing(item.code, item.article)) {
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
  const fetchedResults = Array.isArray(payload.items) ? payload.items : [];

  for (const item of fetchedResults) {
    if (item.status === "ready" && item.src) {
      clearProductImageMissing(item.code, item.article);
      writeProductImageSuccess(item.code, item.article, item.src);
      continue;
    }

    if (item.status === "missing") {
      writeProductImageMissing(item.code, item.article);
    }
  }

  return [...cachedResults, ...fetchedResults];
};

export const primeCatalogImageBatch = async (
  items: CatalogImageBatchRequestItem[],
  options?: { deep?: boolean; signal?: AbortSignal }
) => fetchCatalogImageBatch(items, options);
