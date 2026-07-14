export type CatalogImageBatchResult = {
  key: string;
  code: string;
  article?: string;
  status: "ready" | "missing";
  src?: string;
  transient?: boolean;
};

const catalogImageResultCache = new Map<
  string,
  { expiresAt: number; result: CatalogImageBatchResult }
>();

const buildReadyResultCacheKey = (key: string) => `ready:${key}`;
const buildMissingResultCacheKey = (key: string, deep: boolean) =>
  `${deep ? "deep" : "fast"}:missing:${key}`;

const pruneCatalogImageResultCache = () => {
  const now = Date.now();
  for (const [key, entry] of catalogImageResultCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      catalogImageResultCache.delete(key);
    }
  }
};

export const clearCatalogImageResultCacheForProduct = (code: string, article?: string) => {
  const normalized = (code || "").trim().toLowerCase();
  if (!normalized) return;

  for (const key of catalogImageResultCache.keys()) {
    if (key.includes(normalized)) catalogImageResultCache.delete(key);
  }

  if (article) {
    const normalizedArticle = article.trim().toLowerCase();
    for (const key of catalogImageResultCache.keys()) {
      if (key.includes(normalizedArticle)) catalogImageResultCache.delete(key);
    }
  }
};

export const getCachedCatalogImageResult = (key: string, deep: boolean) => {
  pruneCatalogImageResultCache();

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

export const writeCatalogImageResultCache = (
  result: CatalogImageBatchResult,
  deep: boolean,
  ttlMs: { ready: number; missing: number }
) => {
  if (!result.key || result.transient === true) return;

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
    expiresAt: Date.now() + (isReady ? ttlMs.ready : ttlMs.missing),
    result: { ...result },
  });
};
