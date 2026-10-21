"use client";

import {
  prefetchCatalogListing,
  type CatalogPrefetchOptions,
} from "app/lib/catalog-page-prefetch";

/** Fired the moment a filter URL is applied, before React has rendered the new
 *  filter (Next applies the URL inside a transition), so the results can show
 *  at once that they are being replaced. */
export const CATALOG_FILTER_PENDING_EVENT = "partson:catalog-filter-pending";
export const CATALOG_FILTER_SELECTION_FINAL_EVENT = "partson:catalog-filter-selection-final";

type CatalogRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * Applies a catalog filter URL so the results react at once.
 *
 * router.replace alone first waits for the server render of /katalog (~0.5-1s)
 * before useSearchParams changes and Data starts loading. Here page 1 of the
 * new filter starts loading immediately (Data picks that request up), the
 * native history update reaches useSearchParams in the same tick, and
 * router.replace still runs to refresh the server-rendered parts of the page
 * (SEO copy below the grid) in the background.
 */
export const replaceCatalogUrl = (
  router: CatalogRouter,
  href: string,
  { scroll = false, ...prefetch }: CatalogPrefetchOptions & { scroll?: boolean } = {}
) => {
  if (typeof window === "undefined") {
    router.replace(href, { scroll });
    return;
  }
  if (href === `${window.location.pathname}${window.location.search}`) return;
  void prefetchCatalogListing(href, prefetch);
  window.dispatchEvent(new Event(CATALOG_FILTER_PENDING_EVENT));
  window.history.replaceState(null, "", href);
  router.replace(href, { scroll });
};
