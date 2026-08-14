import { buildProductImageBatchKey } from "app/lib/product-image-path";

export const PRODUCT_IMAGE_CLIENT_CACHE_PREFIX = "partson:v10:img-route-v2:";
export const PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
export const PRODUCT_IMAGE_CLIENT_MISSING_CACHE_PREFIX = "partson:v4:img-miss-route-v2:";
export const PRODUCT_IMAGE_CLIENT_MISSING_CACHE_TTL_MS = 1000 * 60 * 60;
const PRODUCT_IMAGE_MEMORY_CACHE_MAX_ENTRIES = 512;
const PRODUCT_IMAGE_PERSISTED_SRC_MAX_LENGTH = 4096;
let persistedImageCachePruned = false;
const pendingPersistedImageWrites = new Map<string, string>();
const pendingPersistedImageRemovals = new Set<string>();
let persistedImageFlushScheduled = false;

export type ProductImageCacheRecord = {
  src: string;
  t: number;
};

export type ProductImageMissingCacheRecord = {
  t: number;
};

const productImageMemoryCache = new Map<string, ProductImageCacheRecord>();

const pruneProductImageMemoryCache = () => {
  const now = Date.now();
  for (const [key, value] of productImageMemoryCache.entries()) {
    if (!value || now - value.t > PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS) {
      productImageMemoryCache.delete(key);
    }
  }

  while (productImageMemoryCache.size > PRODUCT_IMAGE_MEMORY_CACHE_MAX_ENTRIES) {
    const oldestKey = productImageMemoryCache.keys().next().value;
    if (!oldestKey) break;
    productImageMemoryCache.delete(oldestKey);
  }
};

const prunePersistedImageCache = (storage: Storage | null | undefined) => {
  if (!storage) return;

  try {
    const expiredKeys: string[] = [];
    const now = Date.now();

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(PRODUCT_IMAGE_CLIENT_CACHE_PREFIX)) continue;

      const raw = storage.getItem(key);
      if (!raw) {
        expiredKeys.push(key);
        continue;
      }

      try {
        const parsed = JSON.parse(raw) as ProductImageCacheRecord;
        if (
          !parsed ||
          typeof parsed.t !== "number" ||
          typeof parsed.src !== "string" ||
          now - parsed.t > PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS
        ) {
          expiredKeys.push(key);
        }
      } catch {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage access issues.
  }
};

const ensurePersistedImageCachePruned = () => {
  if (persistedImageCachePruned || typeof window === "undefined") return;
  persistedImageCachePruned = true;
  const prune = () => {
    prunePersistedImageCache(window.sessionStorage);
    prunePersistedImageCache(window.localStorage);
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prune, { timeout: 5000 });
  } else {
    window.setTimeout(prune, 500);
  }
};

const schedulePersistedImageFlush = () => {
  if (persistedImageFlushScheduled || typeof window === "undefined") return;
  persistedImageFlushScheduled = true;

  const flush = () => {
    persistedImageFlushScheduled = false;
    const writes = Array.from(pendingPersistedImageWrites.entries());
    const removals = Array.from(pendingPersistedImageRemovals);
    pendingPersistedImageWrites.clear();
    pendingPersistedImageRemovals.clear();

    for (const storage of [window.sessionStorage, window.localStorage]) {
      try {
        for (const key of removals) storage.removeItem(key);
        for (const [key, payload] of writes) storage.setItem(key, payload);
      } catch {
        prunePersistedImageCache(storage);
      }
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(flush, { timeout: 3000 });
  } else {
    window.setTimeout(flush, 250);
  }
};

export const getProductImageClientCacheKey = (
  productCode: string,
  articleHint?: string
) => {
  const batchKey = buildProductImageBatchKey(productCode, articleHint);
  return batchKey ? `${PRODUCT_IMAGE_CLIENT_CACHE_PREFIX}${batchKey}` : "";
};

export const getProductImageClientMissingCacheKey = (
  productCode: string,
  articleHint?: string
) => {
  const batchKey = buildProductImageBatchKey(productCode, articleHint);
  return batchKey ? `${PRODUCT_IMAGE_CLIENT_MISSING_CACHE_PREFIX}${batchKey}` : "";
};

export const normalizeProductImageCachedSrc = (value: string): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) return trimmed;

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.pathname === "/_next/image") {
      const sourceUrl = parsed.searchParams.get("url") || "";
      const normalizedSourceUrl: string = normalizeProductImageCachedSrc(sourceUrl);
      return normalizedSourceUrl.startsWith("/_next/image")
        ? ""
        : normalizedSourceUrl;
    }

    const normalizedSrc = `${parsed.pathname}${parsed.search}`;
    return normalizedSrc.startsWith("/product-image/") ? normalizedSrc : "";
  } catch {
    return trimmed.startsWith("/product-image/") ? trimmed : "";
  }
};

export const readProductImageSuccessFromStorage = (
  storage: Storage,
  cacheKey: string
) => {
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ProductImageCacheRecord;
    if (!parsed || typeof parsed.t !== "number" || typeof parsed.src !== "string") {
      storage.removeItem(cacheKey);
      return null;
    }

    if (Date.now() - parsed.t > PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS) {
      storage.removeItem(cacheKey);
      return null;
    }

    const normalizedSrc = normalizeProductImageCachedSrc(parsed.src);
    if (!normalizedSrc) {
      storage.removeItem(cacheKey);
      return null;
    }

    return normalizedSrc;
  } catch {
    return null;
  }
};

export const readProductImageSuccess = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return null;

  const cacheKey = getProductImageClientCacheKey(productCode, articleHint);
  if (!cacheKey) return null;

  pruneProductImageMemoryCache();
  ensurePersistedImageCachePruned();
  const memoryHit = productImageMemoryCache.get(cacheKey);
  if (memoryHit?.src && Date.now() - memoryHit.t <= PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS) {
    return normalizeProductImageCachedSrc(memoryHit.src);
  }

  const persistedHit =
    readProductImageSuccessFromStorage(window.sessionStorage, cacheKey) ??
    readProductImageSuccessFromStorage(window.localStorage, cacheKey);

  if (persistedHit) {
    productImageMemoryCache.set(cacheKey, {
      src: persistedHit,
      t: Date.now(),
    });
  }

  return persistedHit;
};

const readProductImageMissingFromStorage = (
  storage: Storage,
  cacheKey: string
) => {
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as ProductImageMissingCacheRecord;
    if (!parsed || typeof parsed.t !== "number") {
      storage.removeItem(cacheKey);
      return false;
    }

    if (Date.now() - parsed.t > PRODUCT_IMAGE_CLIENT_MISSING_CACHE_TTL_MS) {
      storage.removeItem(cacheKey);
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export const readProductImageMissing = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return false;

  const cacheKey = getProductImageClientMissingCacheKey(productCode, articleHint);
  if (!cacheKey) return false;
  if (pendingPersistedImageRemovals.has(cacheKey)) return false;

  return (
    readProductImageMissingFromStorage(window.sessionStorage, cacheKey) ||
    readProductImageMissingFromStorage(window.localStorage, cacheKey)
  );
};

export const writeProductImageSuccess = (
  productCode: string,
  articleHint: string | undefined,
  src: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientCacheKey(productCode, articleHint);
  const normalizedSrc = normalizeProductImageCachedSrc(src);
  if (!cacheKey || !normalizedSrc) return;

  ensurePersistedImageCachePruned();
  clearProductImageMissing(productCode, articleHint);

  pruneProductImageMemoryCache();
  productImageMemoryCache.set(cacheKey, {
    src: normalizedSrc,
    t: Date.now(),
  });

  if (
    normalizedSrc.startsWith("data:image/") ||
    normalizedSrc.length > PRODUCT_IMAGE_PERSISTED_SRC_MAX_LENGTH
  ) {
    return;
  }

  const payload = JSON.stringify({
    src: normalizedSrc,
    t: Date.now(),
  } satisfies ProductImageCacheRecord);
  const missingCacheKey = getProductImageClientMissingCacheKey(
    productCode,
    articleHint
  );
  pendingPersistedImageWrites.set(cacheKey, payload);
  if (missingCacheKey) pendingPersistedImageRemovals.add(missingCacheKey);
  schedulePersistedImageFlush();
};

export const writeProductImageMissing = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientMissingCacheKey(productCode, articleHint);
  if (!cacheKey) return;

  clearProductImageSuccess(productCode, articleHint);

  const payload = JSON.stringify({
    t: Date.now(),
  } satisfies ProductImageMissingCacheRecord);

  try {
    window.sessionStorage.setItem(cacheKey, payload);
  } catch {
    // Ignore storage quota issues.
  }

  try {
    window.localStorage.setItem(cacheKey, payload);
  } catch {
    // Ignore storage quota issues.
  }
};

export const clearProductImageSuccess = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientCacheKey(productCode, articleHint);
  if (!cacheKey) return;

  productImageMemoryCache.delete(cacheKey);

  try {
    window.sessionStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors.
  }

  try {
    window.localStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors.
  }
};

export const clearProductImageMissing = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientMissingCacheKey(productCode, articleHint);
  if (!cacheKey) return;
  pendingPersistedImageRemovals.add(cacheKey);
  schedulePersistedImageFlush();
};
