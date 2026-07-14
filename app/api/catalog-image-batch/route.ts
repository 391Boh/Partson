import { NextResponse } from "next/server";

import { materializeCatalogImageBase64 } from "app/lib/catalog-image-materializer";
import { findCatalogProductByCode } from "app/lib/catalog-server";
import { PRODUCT_IMAGE_BATCH_MAX_ITEMS } from "app/lib/product-image-constants";
import { fetchProductImageBase64BatchDetailed } from "app/lib/product-image";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";
import {
  type CatalogImageBatchResult,
  getCachedCatalogImageResult,
  writeCatalogImageResultCache,
} from "app/lib/catalog-image-result-cache";
import {
  buildPersistentCatalogRouteImageKey,
  getProductRouteImageCacheRevision,
  hasPersistentRouteImage,
  isRouteImageCacheInvalidating,
} from "app/lib/product-image-route-cache";

export const runtime = "nodejs";

const MAX_BATCH_ITEMS = PRODUCT_IMAGE_BATCH_MAX_ITEMS;
const BATCH_CONCURRENCY = 6;
const CATALOG_IMAGE_READY_CACHE_TTL_MS = 1000 * 60 * 60;
const CATALOG_IMAGE_MISSING_CACHE_TTL_MS = 1000 * 60 * 30;

const PRIMARY_LOOKUP_OPTIONS = {
  timeoutMs: 2800,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 60 * 2,
  missCacheTtlMs: 1000 * 60 * 5,
  allowUrlDownload: false,
  batchOnly: true,
  maxKeys: MAX_BATCH_ITEMS,
};
const DEEP_RECOVERY_LOOKUP_OPTIONS = {
  timeoutMs: 2500,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 20,
  missCacheTtlMs: 1000 * 60 * 5,
  allowUrlDownload: true,
  skipMissCache: true,
  batchOnly: true,
  maxKeys: MAX_BATCH_ITEMS * 4,
};
const IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS = {
  lookupLimit: 10,
  fallbackPages: 1,
  pageSize: 16,
  timeoutMs: 300,
  retries: 0,
  retryDelayMs: 80,
  cacheTtlMs: 1000 * 60 * 5,
};

type CatalogImageBatchItem = {
  code: string;
  article?: string;
  hasPhoto?: boolean;
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
    if (hasPhoto !== true) continue;
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

const buildLookupKeys = (item: CatalogImageBatchItem) =>
  Array.from(
    new Set([(item.code || "").trim(), (item.article || "").trim()].filter(Boolean))
  );

const buildPrimaryLookupKeys = (item: CatalogImageBatchItem) => {
  const code = (item.code || "").trim();
  return code ? [code] : [];
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
  const routeCacheRevisionsAtStart = new Map(
    items.map((item) => [
      buildProductImageBatchKey(item.code, item.article),
      getProductRouteImageCacheRevision(item.code, item.article),
    ])
  );

  const results = new Array<CatalogImageBatchResult | null>(items.length).fill(null);
  let workEntries: Array<{
    item: CatalogImageBatchItem;
    index: number;
    key: string;
  }> = [];

  for (const [index, item] of items.entries()) {
    const key = buildProductImageBatchKey(item.code, item.article);

    const cached = getCachedCatalogImageResult(key, deep);
    if (cached) {
      results[index] = cached;
      continue;
    }

    workEntries.push({ item, index, key });
  }

  if (workEntries.length > 0) {
    const persistentHits = await Promise.all(
      workEntries.map(async (entry) => ({
        entry,
        hasImage: await hasPersistentRouteImage(
          buildPersistentCatalogRouteImageKey(
            entry.item.code,
            entry.item.article
          )
        ),
      }))
    );
    const unresolvedEntries: typeof workEntries = [];

    for (const { entry, hasImage } of persistentHits) {
      if (!hasImage) {
        unresolvedEntries.push(entry);
        continue;
      }

      const result: CatalogImageBatchResult = {
        key: entry.key,
        code: entry.item.code,
        article: entry.item.article,
        status: "ready",
        src: buildProductImagePath(entry.item.code, entry.item.article, {
          catalog: true,
        }),
      };
      writeCatalogImageResultCache(result, deep, {
        ready: CATALOG_IMAGE_READY_CACHE_TTL_MS,
        missing: CATALOG_IMAGE_MISSING_CACHE_TTL_MS,
      });
      results[entry.index] = result;
    }

    workEntries = unresolvedEntries;
  }

  if (workEntries.length === 0) {
    return NextResponse.json(
      { items: results.filter((item): item is CatalogImageBatchResult => Boolean(item)) },
      {
        headers: {
          "cache-control": "private, max-age=300, stale-while-revalidate=3600",
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

  const primaryOutcome = await fetchProductImageBase64BatchDetailed(
    Array.from(allLookupKeys),
    PRIMARY_LOOKUP_OPTIONS
  ).catch(() => ({
    resolved: {} as Record<string, string>,
    handledKeys: new Set<string>(),
    endpointAvailable: false,
  }));
  const primaryResolvedMap = primaryOutcome.resolved;

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

    const lookupKey = (product.code || "").trim();
    if (lookupKey) recoveryLookupKeys.add(lookupKey);
  }

  const recoveryOutcome =
    recoveryLookupKeys.size > 0
      ? await fetchProductImageBase64BatchDetailed(
          Array.from(recoveryLookupKeys),
          DEEP_RECOVERY_LOOKUP_OPTIONS
        ).catch(() => ({
          resolved: {} as Record<string, string>,
          handledKeys: new Set<string>(),
          endpointAvailable: false,
        }))
      : {
          resolved: {} as Record<string, string>,
          handledKeys: new Set<string>(),
          endpointAvailable: true,
        };
  const recoveryResolvedMap = recoveryOutcome.resolved;

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
          const lookupKey = (product.code || "").trim();
          imageBase64 = lookupKey
            ? pickResolvedBase64([lookupKey], recoveryResolvedMap)
            : null;
        }
      }

      if (!imageBase64) {
        const product = recoveryProducts.get(key);
        const recoveryLookupKey = (product?.code || "").trim().toLowerCase();
        const lookupWasHandled =
          directLookupKeys.some((lookupKey) =>
            primaryOutcome.handledKeys.has(lookupKey.toLowerCase())
          ) ||
          Boolean(
            recoveryLookupKey &&
              recoveryOutcome.handledKeys.has(recoveryLookupKey)
          );
        const result: CatalogImageBatchResult = {
          key,
          code: item.code,
          article: item.article,
          status: "missing",
          transient: !lookupWasHandled,
        };
        if (!result.transient) {
          writeCatalogImageResultCache(result, deep, {
            ready: CATALOG_IMAGE_READY_CACHE_TTL_MS,
            missing: CATALOG_IMAGE_MISSING_CACHE_TTL_MS,
          });
        }
        results[index] = result;
        continue;
      }

      const cacheRevision = routeCacheRevisionsAtStart.get(key) ?? "";
      const src = await materializeCatalogImageBase64(item, imageBase64, {
        cacheRevision,
      });
      if (!src) {
        const invalidatedWhileLoading =
          cacheRevision !==
            getProductRouteImageCacheRevision(item.code, item.article) ||
          isRouteImageCacheInvalidating(item.code, item.article);
        const result: CatalogImageBatchResult = {
          key,
          code: item.code,
          article: item.article,
          status: "missing",
          transient: invalidatedWhileLoading,
        };
        if (!result.transient) {
          writeCatalogImageResultCache(result, deep, {
            ready: CATALOG_IMAGE_READY_CACHE_TTL_MS,
            missing: CATALOG_IMAGE_MISSING_CACHE_TTL_MS,
          });
        }
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
      writeCatalogImageResultCache(result, deep, {
        ready: CATALOG_IMAGE_READY_CACHE_TTL_MS,
        missing: CATALOG_IMAGE_MISSING_CACHE_TTL_MS,
      });
      results[index] = result;
    }
  });

  await Promise.allSettled(workers);

  return NextResponse.json(
    { items: results.filter((item): item is CatalogImageBatchResult => Boolean(item)) },
    {
      headers: {
        "cache-control": "private, max-age=300, stale-while-revalidate=3600",
      },
    }
  );
}
