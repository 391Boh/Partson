import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type RouteImageValue = { buffer: Buffer; contentType: string };

const PERSISTENT_ROUTE_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const PERSISTENT_ROUTE_CACHE_EXPIRY_GRACE_MS = 1000 * 60 * 5;
const PERSISTENT_ROUTE_CACHE_MAX_ENTRIES = 5000;
const PERSISTENT_ROUTE_CACHE_PRUNE_INTERVAL_MS = 1000 * 60 * 60;
const PERSISTENT_ROUTE_CACHE_DIR = path.join(
  process.cwd(),
  ".cache",
  "product-images",
  "routes"
);
let persistentRouteCacheReady: Promise<void> | null = null;
let lastPersistentRouteCachePruneAt = 0;
let persistentRouteCachePruneInFlight: Promise<void> | null = null;
const invalidatingProductKeys = new Map<string, number>();
const productRouteImageCacheRevisions = new Map<string, number>();
const persistentRouteWrites = new Map<string, Promise<void>>();

const ensurePersistentRouteCacheDir = () => {
  if (!persistentRouteCacheReady) {
    persistentRouteCacheReady = mkdir(PERSISTENT_ROUTE_CACHE_DIR, {
      recursive: true,
    }).then(() => undefined);
  }
  return persistentRouteCacheReady;
};

const getPersistentRouteCachePaths = (cacheKey: string) => {
  const hash = createHash("sha1").update(cacheKey).digest("hex");
  return {
    bufferPath: path.join(PERSISTENT_ROUTE_CACHE_DIR, `${hash}.bin`),
    metaPath: path.join(PERSISTENT_ROUTE_CACHE_DIR, `${hash}.json`),
  };
};

const normalizeProductCacheKeys = (code: string, article?: string) =>
  Array.from(
    new Set(
      [(code || "").trim().toLowerCase(), (article || "").trim().toLowerCase()].filter(
        Boolean
      )
    )
  );

export const buildPersistentCatalogRouteImageKey = (
  code: string,
  article?: string
) => {
  const normalizedCode = (code || "").trim().toLowerCase();
  const normalizedArticle = (article || "").trim().toLowerCase();
  const routeArticle =
    normalizedArticle && normalizedArticle !== normalizedCode
      ? normalizedArticle
      : "";

  return [
    "normal",
    "catalog",
    "redirect",
    0,
    normalizedCode,
    routeArticle,
    "webp",
  ].join("::");
};

const removePersistentRouteCacheFiles = async (
  bufferPath: string,
  metaPath: string
) => {
  await Promise.allSettled([unlink(bufferPath), unlink(metaPath)]);
};

type PersistentRouteCacheMeta = {
  cacheKey?: string;
  contentType?: string;
  expiresAt?: number;
  bufferSize?: number;
  bufferHash?: string;
};

const schedulePersistentRouteCachePrune = () => {
  const now = Date.now();
  if (persistentRouteCachePruneInFlight) return;
  if (now - lastPersistentRouteCachePruneAt < PERSISTENT_ROUTE_CACHE_PRUNE_INTERVAL_MS) {
    return;
  }

  lastPersistentRouteCachePruneAt = now;
  persistentRouteCachePruneInFlight = (async () => {
    const entries = await readdir(PERSISTENT_ROUTE_CACHE_DIR).catch(() => []);
    const metadataFiles = entries.filter((entry) => entry.endsWith(".json"));
    const validEntries: Array<{
      expiresAt: number;
      bufferPath: string;
      metaPath: string;
    }> = [];

    for (let index = 0; index < metadataFiles.length; index += 32) {
      const chunk = metadataFiles.slice(index, index + 32);
      const resolvedChunk = await Promise.all(
        chunk.map(async (entry) => {
          const metaPath = path.join(PERSISTENT_ROUTE_CACHE_DIR, entry);
          const bufferPath = path.join(
            PERSISTENT_ROUTE_CACHE_DIR,
            `${entry.slice(0, -".json".length)}.bin`
          );
          const metaRaw = await readFile(metaPath, "utf8").catch(() => null);
          if (!metaRaw) return null;

          try {
            const meta = JSON.parse(metaRaw) as PersistentRouteCacheMeta;
            const now = Date.now();
            if (
              typeof meta.expiresAt !== "number" ||
              meta.expiresAt <= now ||
              meta.expiresAt >
                now +
                  PERSISTENT_ROUTE_CACHE_TTL_MS +
                  PERSISTENT_ROUTE_CACHE_EXPIRY_GRACE_MS
            ) {
              await removePersistentRouteCacheFiles(bufferPath, metaPath);
              return null;
            }
            return { expiresAt: meta.expiresAt, bufferPath, metaPath };
          } catch {
            await removePersistentRouteCacheFiles(bufferPath, metaPath);
            return null;
          }
        })
      );

      for (const entry of resolvedChunk) {
        if (entry) validEntries.push(entry);
      }
    }

    if (validEntries.length > PERSISTENT_ROUTE_CACHE_MAX_ENTRIES) {
      validEntries.sort((left, right) => left.expiresAt - right.expiresAt);
      const overflow = validEntries.slice(
        0,
        validEntries.length - PERSISTENT_ROUTE_CACHE_MAX_ENTRIES
      );
      for (let index = 0; index < overflow.length; index += 32) {
        await Promise.all(
          overflow
            .slice(index, index + 32)
            .map((entry) =>
              removePersistentRouteCacheFiles(entry.bufferPath, entry.metaPath)
            )
        );
      }
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      persistentRouteCachePruneInFlight = null;
    });
};

const readPersistentRouteCacheMeta = async (cacheKey: string) => {
  await ensurePersistentRouteCacheDir();
  schedulePersistentRouteCachePrune();
  const writeBeforeRead = persistentRouteWrites.get(cacheKey);
  await writeBeforeRead?.catch(() => undefined);
  const paths = getPersistentRouteCachePaths(cacheKey);
  const [metaRaw, bufferStat] = await Promise.all([
    readFile(paths.metaPath, "utf8").catch(() => null),
    stat(paths.bufferPath).catch(() => null),
  ]);

  // A writer may have registered after the initial check but before both files
  // were read. Wait for that pair to settle and retry instead of treating a
  // temporary bin/meta mismatch as corruption and deleting a valid entry.
  const writeAfterRead = persistentRouteWrites.get(cacheKey);
  if (writeAfterRead && writeAfterRead !== writeBeforeRead) {
    await writeAfterRead.catch(() => undefined);
    return readPersistentRouteCacheMeta(cacheKey);
  }
  if (!metaRaw || !bufferStat?.isFile()) return null;

  try {
    const meta = JSON.parse(metaRaw) as PersistentRouteCacheMeta;
    const isValid =
      meta.cacheKey === cacheKey &&
      typeof meta.contentType === "string" &&
      meta.contentType.startsWith("image/") &&
      typeof meta.expiresAt === "number" &&
      meta.expiresAt > Date.now() &&
      meta.expiresAt <=
        Date.now() +
          PERSISTENT_ROUTE_CACHE_TTL_MS +
          PERSISTENT_ROUTE_CACHE_EXPIRY_GRACE_MS &&
      typeof meta.bufferSize === "number" &&
      meta.bufferSize > 0 &&
      bufferStat.size === meta.bufferSize &&
      typeof meta.bufferHash === "string" &&
      meta.bufferHash.length > 0;

    if (!isValid) {
      void removePersistentRouteCacheFiles(paths.bufferPath, paths.metaPath);
      return null;
    }

    return { meta, ...paths };
  } catch {
    void removePersistentRouteCacheFiles(paths.bufferPath, paths.metaPath);
    return null;
  }
};

export const hasPersistentRouteImage = async (cacheKey: string) =>
  Boolean(await readPersistentRouteCacheMeta(cacheKey));

export const readPersistentRouteImage = async (
  cacheKey: string
): Promise<RouteImageValue | null> => {
  try {
    const cachedMeta = await readPersistentRouteCacheMeta(cacheKey);
    if (!cachedMeta) return null;

    const buffer = await readFile(cachedMeta.bufferPath).catch(() => null);
    if (!buffer) return null;
    const bufferHash = createHash("sha1").update(buffer).digest("hex");
    if (
      buffer.length !== cachedMeta.meta.bufferSize ||
      bufferHash !== cachedMeta.meta.bufferHash
    ) {
      void removePersistentRouteCacheFiles(
        cachedMeta.bufferPath,
        cachedMeta.metaPath
      );
      return null;
    }

    return { buffer, contentType: cachedMeta.meta.contentType as string };
  } catch {
    return null;
  }
};

export const writePersistentRouteImage = (
  cacheKey: string,
  value: RouteImageValue
): Promise<void> => {
  if (!cacheKey || !value.buffer.length || !value.contentType.startsWith("image/")) {
    return Promise.resolve();
  }

  const previousOperation = persistentRouteWrites.get(cacheKey);
  const operation = (previousOperation?.catch(() => undefined) ?? Promise.resolve()).then(async () => {
    let temporaryBufferPath = "";
    let temporaryMetaPath = "";
    try {
      await ensurePersistentRouteCacheDir();
      schedulePersistentRouteCachePrune();
      const { bufferPath, metaPath } = getPersistentRouteCachePaths(cacheKey);
      const temporarySuffix = `.${process.pid}.${randomUUID()}.tmp`;
      temporaryBufferPath = `${bufferPath}${temporarySuffix}`;
      temporaryMetaPath = `${metaPath}${temporarySuffix}`;
      const bufferHash = createHash("sha1").update(value.buffer).digest("hex");
      const meta: PersistentRouteCacheMeta = {
        cacheKey,
        contentType: value.contentType,
        expiresAt: Date.now() + PERSISTENT_ROUTE_CACHE_TTL_MS,
        bufferSize: value.buffer.length,
        bufferHash,
      };

      await Promise.all([
        writeFile(temporaryBufferPath, value.buffer),
        writeFile(temporaryMetaPath, JSON.stringify(meta)),
      ]);
      await rename(temporaryBufferPath, bufferPath);
      temporaryBufferPath = "";
      await rename(temporaryMetaPath, metaPath);
      temporaryMetaPath = "";
    } catch {
      // A disk cache failure must never block the image response.
    } finally {
      await Promise.allSettled([
        temporaryBufferPath ? unlink(temporaryBufferPath) : Promise.resolve(),
        temporaryMetaPath ? unlink(temporaryMetaPath) : Promise.resolve(),
      ]);
    }
  });

  persistentRouteWrites.set(cacheKey, operation);
  return operation.finally(() => {
    if (persistentRouteWrites.get(cacheKey) === operation) {
      persistentRouteWrites.delete(cacheKey);
    }
  });
};

export const removePersistentRouteImage = async (cacheKey: string) => {
  if (!cacheKey) return;
  await persistentRouteWrites.get(cacheKey)?.catch(() => undefined);
  const { bufferPath, metaPath } = getPersistentRouteCachePaths(cacheKey);
  await removePersistentRouteCacheFiles(bufferPath, metaPath);
};

export const getProductRouteImageCacheRevision = (
  code: string,
  article?: string
) =>
  normalizeProductCacheKeys(code, article)
    .map(
      (key) => `${key}:${productRouteImageCacheRevisions.get(key) || 0}`
    )
    .join("|");

export const isRouteImageCacheInvalidating = (code: string, article?: string) =>
  normalizeProductCacheKeys(code, article).some((key) =>
    (invalidatingProductKeys.get(key) || 0) > 0
  );

// Module-level caches for /product-image/[code]/route.ts, pulled out to a
// separate file because a route.ts should only export HTTP method handlers
// — Next.js's route type-checker rejects other named exports (verified the
// hard way once already this session on a page.tsx equivalent). Keeping the
// Map instances here lets both the route and the admin-update endpoints
// (product-update, product-upload-image) that need to invalidate them share
// the same objects, matching the existing pattern for
// clearProductImageCacheForProduct (app/lib/product-image.ts) and
// clearCatalogImageResultCacheForProduct (app/lib/catalog-image-result-cache.ts).

export const routeMissCache = new Map<string, number>();

export const routeImageHitCache = new Map<
  string,
  { expiresAt: number; value: RouteImageValue }
>();
const ROUTE_IMAGE_HIT_CACHE_MAX_ENTRIES = 512;

export const routeImageInFlight = new Map<
  string,
  Promise<RouteImageValue | null>
>();

export const pruneRouteMissCache = () => {
  const now = Date.now();
  for (const [key, expiresAt] of routeMissCache.entries()) {
    if (expiresAt <= now) {
      routeMissCache.delete(key);
    }
  }
};

export const pruneRouteImageHitCache = () => {
  const now = Date.now();
  for (const [key, entry] of routeImageHitCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      routeImageHitCache.delete(key);
    }
  }
  while (routeImageHitCache.size > ROUTE_IMAGE_HIT_CACHE_MAX_ENTRIES) {
    const oldestKey = routeImageHitCache.keys().next().value;
    if (!oldestKey) break;
    routeImageHitCache.delete(oldestKey);
  }
};

// routeMissCacheKey/routeHitCacheKey (built in route.ts) are "::"-joined
// tuples that always include the lowercased product code and article as
// standalone segments — match on that rather than a prefix/substring check,
// since code/article sit in the middle of the key, not at the start.
const buildProductCacheMatcher = (code: string, article?: string) => {
  const normalizedCode = (code || "").trim().toLowerCase();
  const normalizedArticle = (article || "").trim().toLowerCase();

  return (key: string) => {
    const segments = key.split("::");
    return segments.some(
      (segment) =>
        (normalizedCode && segment === normalizedCode) ||
        (normalizedArticle && segment === normalizedArticle)
    );
  };
};

const clearPersistentRouteImageCacheForProduct = async (
  code: string,
  article?: string
) => {
  try {
    await ensurePersistentRouteCacheDir();
    const candidateKeys = new Set([
      buildPersistentCatalogRouteImageKey(code, article),
      buildPersistentCatalogRouteImageKey(code),
      ...(article ? [buildPersistentCatalogRouteImageKey(article)] : []),
    ]);
    await Promise.allSettled(
      Array.from(candidateKeys)
        .map((cacheKey) => persistentRouteWrites.get(cacheKey))
        .filter((operation): operation is Promise<void> => Boolean(operation))
    );
    await Promise.all(
      Array.from(candidateKeys).map((cacheKey) => {
        const { bufferPath, metaPath } = getPersistentRouteCachePaths(cacheKey);
        return removePersistentRouteCacheFiles(bufferPath, metaPath);
      })
    );
  } catch {
    // Cache invalidation is best-effort; in-memory caches are still cleared.
  }
};

export const clearRouteImageCacheForProduct = async (
  code: string,
  article?: string
) => {
  const normalizedCode = (code || "").trim().toLowerCase();
  const normalizedArticle = (article || "").trim().toLowerCase();
  if (!normalizedCode && !normalizedArticle) return;

  const invalidationKeys = normalizeProductCacheKeys(code, article);
  for (const key of invalidationKeys) {
    productRouteImageCacheRevisions.set(
      key,
      (productRouteImageCacheRevisions.get(key) || 0) + 1
    );
    invalidatingProductKeys.set(key, (invalidatingProductKeys.get(key) || 0) + 1);
  }

  const matchesTarget = buildProductCacheMatcher(code, article);

  for (const key of routeMissCache.keys()) {
    if (matchesTarget(key)) routeMissCache.delete(key);
  }
  for (const key of routeImageHitCache.keys()) {
    if (matchesTarget(key)) routeImageHitCache.delete(key);
  }
  for (const key of routeImageInFlight.keys()) {
    if (matchesTarget(key)) routeImageInFlight.delete(key);
  }

  try {
    await clearPersistentRouteImageCacheForProduct(code, article);
  } finally {
    for (const key of invalidationKeys) {
      const nextCount = (invalidatingProductKeys.get(key) || 1) - 1;
      if (nextCount > 0) invalidatingProductKeys.set(key, nextCount);
      else invalidatingProductKeys.delete(key);
    }
  }
};
