"use client";

export type CatalogCount = { totalCount: number; exact: boolean };
const pending = new Map<string, Promise<CatalogCount | null>>();
let revision = 0;
const cache = new Map<string, { expires: number; value: CatalogCount }>();

if (typeof window !== "undefined") window.addEventListener("partson:catalog-invalidated", () => {
  revision++;
  cache.clear();
  pending.clear();
});

// The heading and pagination request the same count. Share that work without
// letting either component's cleanup abort the other consumer's request.
export function fetchCatalogCount(query: string): Promise<CatalogCount | null> {
  const params = new URLSearchParams(query);
  params.sort();
  const key = params.toString();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  const existing = pending.get(key);
  if (existing) return existing;
  const requestRevision = revision;
  const request = fetch(`/api/catalog-search-count?${key}`, {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000),
  }).then(async response => {
    if (!response.ok) return null;
    const value = await response.json();
    if (typeof value?.totalCount !== "number" || !Number.isFinite(value.totalCount) || value.totalCount < 0) return null;
    const result = { totalCount: value.totalCount, exact: value.exact !== false };
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    if (requestRevision === revision) cache.set(key, { expires: Date.now() + 15_000, value: result });
    return result;
  }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}
