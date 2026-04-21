import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { findCatalogProductByCode } from "app/lib/catalog-server";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import {
  fetchProductImageBase64Batch,
} from "app/lib/product-image";
import { buildProductImageBatchKey } from "app/lib/product-image-path";

export const runtime = "nodejs";

const MAX_BATCH_ITEMS = 48;
const BATCH_CONCURRENCY = 10;
const OPTIMIZED_IMAGE_CACHE_TTL_MS = 1000 * 60 * 60;
const CATALOG_IMAGE_READY_CACHE_TTL_MS = 1000 * 60 * 60;
const CATALOG_IMAGE_MISSING_CACHE_TTL_MS = 1000 * 3;
const CATALOG_IMAGE_MAX_WIDTH = 320;
const CATALOG_IMAGE_MAX_HEIGHT = 320;
const CATALOG_IMAGE_QUALITY = 58;

const PRIMARY_LOOKUP_OPTIONS = {
  timeoutMs: 1200,
  retries: 1,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 60 * 2,
  missCacheTtlMs: 1000 * 12,
  allowUrlDownload: false,
  batchConcurrency: 8,
  maxKeys: MAX_BATCH_ITEMS * 2,
};
const DEEP_RECOVERY_LOOKUP_OPTIONS = {
  timeoutMs: 1350,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 20,
  missCacheTtlMs: 1000 * 18,
  allowUrlDownload: true,
  skipMissCache: true,
  batchConcurrency: 8,
  maxKeys: MAX_BATCH_ITEMS * 4,
};
const IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS = {
  lookupLimit: 16,
  fallbackPages: 1,
  pageSize: 24,
  timeoutMs: 650,
  retries: 0,
  retryDelayMs: 80,
  cacheTtlMs: 1000 * 60 * 5,
};

type CatalogImageBatchItem = {
  code: string;
  article?: string;
  hasPhoto?: boolean;
};

type CatalogImageBatchResult = {
  key: string;
  code: string;
  article?: string;
  status: "ready" | "missing";
  src?: string;
};

const optimizedCatalogDataUriCache = new Map<
  string,
  { expiresAt: number; value: string }
>();
const optimizedCatalogDataUriInFlight = new Map<string, Promise<string | null>>();
const catalogImageResultCache = new Map<
  string,
  { expiresAt: number; result: CatalogImageBatchResult }
>();
let fallbackImageHashPromise: Promise<string | null> | null = null;

const getFallbackImageHash = async () => {
  if (fallbackImageHashPromise) return fallbackImageHashPromise;

  fallbackImageHashPromise = readFile(
    path.join(process.cwd(), "public", PRODUCT_IMAGE_FALLBACK_PATH.replace(/^\//, ""))
  )
    .then((buffer) => buildBufferHash(buffer))
    .catch(() => null);

  return fallbackImageHashPromise;
};

const pruneOptimizedCatalogDataUriCache = () => {
  const now = Date.now();
  for (const [key, entry] of optimizedCatalogDataUriCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      optimizedCatalogDataUriCache.delete(key);
    }
  }

  for (const [key, entry] of catalogImageResultCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      catalogImageResultCache.delete(key);
    }
  }
};

const buildReadyResultCacheKey = (key: string) => `ready:${key}`;
const buildMissingResultCacheKey = (key: string, deep: boolean) =>
  `${deep ? "deep" : "fast"}:missing:${key}`;

const getCachedCatalogImageResult = (key: string, deep: boolean) => {
  pruneOptimizedCatalogDataUriCache();

  const readyEntry = catalogImageResultCache.get(buildReadyResultCacheKey(key));
  if (readyEntry && readyEntry.expiresAt > Date.now()) {
    return { ...readyEntry.result };
  }

  const missingEntry = catalogImageResultCache.get(
    buildMissingResultCacheKey(key, deep)
  );
  if (missingEntry && missingEntry.expiresAt > Date.now()) {
    return { ...missingEntry.result };
  }

  return null;
};

const writeCatalogImageResultCache = (
  result: CatalogImageBatchResult,
  deep: boolean
) => {
  if (!result.key) return;

  const isReady = result.status === "ready" && Boolean(result.src);
  const cacheKey = isReady
    ? buildReadyResultCacheKey(result.key)
    : buildMissingResultCacheKey(result.key, deep);

  if (isReady) {
    catalogImageResultCache.delete(buildMissingResultCacheKey(result.key, true));
    catalogImageResultCache.delete(buildMissingResultCacheKey(result.key, false));
  } else {
    catalogImageResultCache.delete(buildReadyResultCacheKey(result.key));
  }

  catalogImageResultCache.set(cacheKey, {
    expiresAt:
      Date.now() +
      (isReady ? CATALOG_IMAGE_READY_CACHE_TTL_MS : CATALOG_IMAGE_MISSING_CACHE_TTL_MS),
    result: { ...result },
  });
};

const buildBufferHash = (buffer: Buffer) =>
  createHash("sha1").update(buffer).digest("hex");

const detectImageContentType = (buffer: Buffer) => {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  return "";
};

const readKnownBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "1", "yes", "y", "так", "да", "истина", "істина"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "ні", "нет", "ложь", "хибність"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const normalizeBatchItems = (payload: unknown) => {
  const source = Array.isArray((payload as { items?: unknown })?.items)
    ? ((payload as { items: unknown[] }).items ?? [])
    : [];

  const items: CatalogImageBatchItem[] = [];
  const seen = new Set<string>();

  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const article = typeof record.article === "string" ? record.article.trim() : "";
    const hasPhoto = readKnownBoolean(
      record.hasPhoto ?? record.HasPhoto ?? record.has_photo
    );
    const key = buildProductImageBatchKey(code, article);

    if (!code || !key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      code,
      article: article || undefined,
      hasPhoto,
    });

    if (items.length >= MAX_BATCH_ITEMS) break;
  }

  return items;
};

const optimizeCatalogImageToDataUri = async (imageBase64: string) => {
  if (!imageBase64) return null;

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    if (!imageBuffer.length) return null;

    const fallbackHash = await getFallbackImageHash();
    const imageHash = buildBufferHash(imageBuffer);
    if (fallbackHash && imageHash === fallbackHash) {
      return null;
    }

    const originalContentType = detectImageContentType(imageBuffer);
    if (!originalContentType.startsWith("image/")) return null;

    pruneOptimizedCatalogDataUriCache();
    const cacheKey = buildBufferHash(imageBuffer);
    const cached = optimizedCatalogDataUriCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && cached.value) {
      return cached.value;
    }

    const inFlight = optimizedCatalogDataUriInFlight.get(cacheKey);
    if (inFlight) {
      return await inFlight;
    }

    const optimizationPromise = (async () => {
      const originalDataUri = `data:${originalContentType};base64,${imageBuffer.toString("base64")}`;

      let optimizedDataUri = originalDataUri;
      try {
        const transformed = await sharp(imageBuffer, {
          failOn: "none",
          animated: false,
        })
          .rotate()
          .resize({
            width: CATALOG_IMAGE_MAX_WIDTH,
            height: CATALOG_IMAGE_MAX_HEIGHT,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({
            quality: CATALOG_IMAGE_QUALITY,
            effort: 2,
          })
          .toBuffer();

        if (transformed.length > 0 && transformed.length < imageBuffer.length) {
          optimizedDataUri = `data:image/webp;base64,${transformed.toString("base64")}`;
        }
      } catch {
        optimizedDataUri = originalDataUri;
      }

      optimizedCatalogDataUriCache.set(cacheKey, {
        expiresAt: Date.now() + OPTIMIZED_IMAGE_CACHE_TTL_MS,
        value: optimizedDataUri,
      });
      return optimizedDataUri;
    })().finally(() => {
      optimizedCatalogDataUriInFlight.delete(cacheKey);
    });

    optimizedCatalogDataUriInFlight.set(cacheKey, optimizationPromise);
    return await optimizationPromise;
  } catch {
    return null;
  }
};

const buildLookupKeys = (item: CatalogImageBatchItem) =>
  Array.from(
    new Set([(item.code || "").trim(), (item.article || "").trim()].filter(Boolean))
  );

const buildPrimaryLookupKeys = (item: CatalogImageBatchItem) => {
  const article = (item.article || "").trim();
  const code = (item.code || "").trim();
  return Array.from(new Set([code, article].filter(Boolean)));
};

const pickResolvedBase64 = (
  lookupKeys: string[],
  resolvedMap: Record<string, string>
) => {
  for (const lookupKey of lookupKeys) {
    const resolved = resolvedMap[lookupKey.toLowerCase()];
    if (resolved) return resolved;
  }
  return null;
};

const resolveRecoveryProducts = async (items: CatalogImageBatchItem[]) => {
  const resolved = new Map<string, Awaited<ReturnType<typeof findCatalogProductByCode>>>();
  let cursor = 0;
  const workerCount = Math.min(BATCH_CONCURRENCY, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;

      const item = items[currentIndex];
      const candidates = buildLookupKeys(item);
      let product = null;

      for (const candidate of candidates) {
        product = await findCatalogProductByCode(candidate, {
          ...IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS,
        }).catch(() => null);
        if (product) break;
      }

      resolved.set(buildProductImageBatchKey(item.code, item.article), product);
    }
  });

  await Promise.allSettled(workers);
  return resolved;
};

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const items = normalizeBatchItems(payload);
  if (items.length === 0) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const deep = Boolean(
    payload &&
      typeof payload === "object" &&
      (payload as { deep?: unknown }).deep === true
  );

  const results = new Array<CatalogImageBatchResult | null>(items.length).fill(null);
  const workEntries: Array<{
    item: CatalogImageBatchItem;
    index: number;
    key: string;
  }> = [];

  for (const [index, item] of items.entries()) {
    const key = buildProductImageBatchKey(item.code, item.article);
    if (item.hasPhoto === false) {
      const result: CatalogImageBatchResult = {
        key,
        code: item.code,
        article: item.article,
        status: "missing",
      };
      writeCatalogImageResultCache(result, deep);
      results[index] = result;
      continue;
    }

    const cached = getCachedCatalogImageResult(key, deep);
    if (cached) {
      results[index] = cached;
      continue;
    }

    workEntries.push({ item, index, key });
  }

  if (workEntries.length === 0) {
    return NextResponse.json(
      { items: results.filter((item): item is CatalogImageBatchResult => Boolean(item)) },
      {
        headers: {
          "cache-control": "private, no-store",
        },
      }
    );
  }

  const primaryLookupKeysByItemKey = new Map<string, string[]>();
  const allLookupKeys = new Set<string>();
  for (const { item, key: itemKey } of workEntries) {
    const lookupKeys = buildPrimaryLookupKeys(item);
    primaryLookupKeysByItemKey.set(itemKey, lookupKeys);
    for (const lookupKey of lookupKeys) {
      allLookupKeys.add(lookupKey);
    }
  }

  const primaryResolvedMap = await fetchProductImageBase64Batch(
    Array.from(allLookupKeys),
    PRIMARY_LOOKUP_OPTIONS
  ).catch(() => ({} as Record<string, string>));

  const unresolvedEntries = workEntries.filter(({ key }) => {
    const lookupKeys = primaryLookupKeysByItemKey.get(key) ?? [];
    return !pickResolvedBase64(lookupKeys, primaryResolvedMap);
  });

  const recoveryCandidates = deep
    ? unresolvedEntries.map(({ item }) => item)
    : [];
  const recoveryProducts =
    recoveryCandidates.length > 0
      ? await resolveRecoveryProducts(recoveryCandidates)
      : new Map();

  const recoveryLookupKeys = new Set<string>();
  for (const { key } of unresolvedEntries) {
    const product = recoveryProducts.get(key);
    if (!product) continue;

    for (const lookupKey of [(product.article || "").trim(), (product.code || "").trim()]) {
      if (!lookupKey) continue;
      recoveryLookupKeys.add(lookupKey);
    }
  }

  const recoveryResolvedMap =
    recoveryLookupKeys.size > 0
      ? await fetchProductImageBase64Batch(
          Array.from(recoveryLookupKeys),
          DEEP_RECOVERY_LOOKUP_OPTIONS
        ).catch(() => ({} as Record<string, string>))
      : ({} as Record<string, string>);

  let cursor = 0;
  const workerCount = Math.min(BATCH_CONCURRENCY, workEntries.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < workEntries.length) {
      const currentIndex = cursor;
      cursor += 1;

      const { item, index, key } = workEntries[currentIndex];
      const directLookupKeys = primaryLookupKeysByItemKey.get(key) ?? [];

      let imageBase64 = pickResolvedBase64(directLookupKeys, primaryResolvedMap);
      if (!imageBase64) {
        const product = recoveryProducts.get(key);
        if (product) {
          imageBase64 = pickResolvedBase64(
            Array.from(
              new Set([(product.article || "").trim(), (product.code || "").trim()].filter(Boolean))
            ),
            recoveryResolvedMap
          );
        }
      }

      if (!imageBase64) {
        const result: CatalogImageBatchResult = {
          key,
          code: item.code,
          article: item.article,
          status: "missing",
        };
        writeCatalogImageResultCache(result, deep);
        results[index] = result;
        continue;
      }

      const src = await optimizeCatalogImageToDataUri(imageBase64);
      if (!src) {
        const result: CatalogImageBatchResult = {
          key,
          code: item.code,
          article: item.article,
          status: "missing",
        };
        writeCatalogImageResultCache(result, deep);
        results[index] = result;
        continue;
      }

      const result: CatalogImageBatchResult = {
        key,
        code: item.code,
        article: item.article,
        status: "ready",
        src,
      };
      writeCatalogImageResultCache(result, deep);
      results[index] = result;
    }
  });

  await Promise.allSettled(workers);

  return NextResponse.json(
    { items: results.filter((item): item is CatalogImageBatchResult => Boolean(item)) },
    {
      headers: {
        "cache-control": "private, no-store",
      },
    }
  );
}
