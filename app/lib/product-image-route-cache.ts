import "server-only";

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
  { expiresAt: number; value: { buffer: Buffer; contentType: string } }
>();

export const routeImageInFlight = new Map<
  string,
  Promise<{ buffer: Buffer; contentType: string } | null>
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
};

// routeMissCacheKey/routeHitCacheKey (built in route.ts) are "::"-joined
// tuples that always include the lowercased product code and article as
// standalone segments — match on that rather than a prefix/substring check,
// since code/article sit in the middle of the key, not at the start.
export const clearRouteImageCacheForProduct = (code: string, article?: string) => {
  const normalizedCode = (code || "").trim().toLowerCase();
  const normalizedArticle = (article || "").trim().toLowerCase();
  if (!normalizedCode && !normalizedArticle) return;

  const matchesTarget = (key: string) => {
    const segments = key.split("::");
    return segments.some(
      (segment) =>
        (normalizedCode && segment === normalizedCode) ||
        (normalizedArticle && segment === normalizedArticle)
    );
  };

  for (const key of routeMissCache.keys()) {
    if (matchesTarget(key)) routeMissCache.delete(key);
  }
  for (const key of routeImageHitCache.keys()) {
    if (matchesTarget(key)) routeImageHitCache.delete(key);
  }
  for (const key of routeImageInFlight.keys()) {
    if (matchesTarget(key)) routeImageInFlight.delete(key);
  }
};
