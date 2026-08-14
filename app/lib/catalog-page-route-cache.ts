import "server-only";

import type { CatalogProduct } from "app/lib/catalog-server";

export type CatalogPageApiPayload = {
  items: CatalogProduct[];
  prices: Record<string, number | null>;
  images: Record<string, string>;
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string;
  totalCount?: number | null;
  serviceUnavailable?: boolean;
  message?: string;
  stale?: boolean;
};

export type RouteSuccessCacheEntry = {
  freshUntil: number;
  staleUntil: number;
  value: CatalogPageApiPayload;
};

// Shared with app/api/catalog-page/route.ts (its fresh/stale response cache,
// keyed by filter+search+page) so admin mutation routes can bust it too —
// a route.ts file can only export HTTP method handlers, not arbitrary
// functions, hence living here instead. Without this, an edited product's
// new image/article/producer/price kept showing on /katalog listings for up
// to the fresh window (10 min) — or the stale window (4h) if a live refetch
// failed — after clearAllOneCCache() had already cleared the 1C layer.
export const routeSuccessCache = new Map<string, RouteSuccessCacheEntry>();

export const clearCatalogPageRouteCache = () => {
  const size = routeSuccessCache.size;
  routeSuccessCache.clear();
  return size;
};
