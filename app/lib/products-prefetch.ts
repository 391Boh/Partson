"use client";

import { writeCatalogBrowserCache, readCatalogBrowserCache } from "./catalog-client-cache";

let prefetchStarted = false;

const noop = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

// Starts the /api/proxy?endpoint=getprod fetch as early as possible so that
// katkomp finds warm data in localStorage when it eventually mounts.
export function scheduleCatalogPrefetch(): void {
  if (prefetchStarted || typeof window === "undefined") return;
  prefetchStarted = true;

  // Check if cache is already fresh — no need to re-fetch
  const snapshot = readCatalogBrowserCache(noop);
  if (snapshot.fresh && snapshot.items.length > 0) return;

  // Fire-and-forget after a short yield so critical-path work goes first
  setTimeout(() => {
    void fetch("/api/proxy?endpoint=getprod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const raw = await res.json();
        writeCatalogBrowserCache(raw, null);
      })
      .catch(() => {});
  }, 60);
}
