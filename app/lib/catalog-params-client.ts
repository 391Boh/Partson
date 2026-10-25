"use client";

import type { ProductParamsQuery } from "app/components/ProductParamsFilter";
import type { ProductParamFacet } from "./product-params";

export type ParamFacetsPayload = {
  facets: ProductParamFacet[];
  totalCount: number;
  withParamsCount: number;
  matchCount: number;
  complete?: boolean;
  needsCategory?: boolean;
  error?: string;
};
const TTL = 5 * 60_000;
const PREFIX = "partson:params:v2:";
const cache = new Map<string, { at: number; data: ParamFacetsPayload }>();
const pending = new Map<string, Promise<ParamFacetsPayload>>();
export const productParamsKey = (query: ProductParamsQuery, filters = "") => JSON.stringify([
  query.group, query.subcategory, query.producer,
  [...query.selectedCars].sort(), [...query.selectedCategories].sort(),
  query.searchQuery, query.searchFilter, query.expandHierarchy, filters, query.vehicle || "",
]);
export function readParamFacets(key: string): ParamFacetsPayload | null {
  let entry = cache.get(key);
  if (!entry && typeof window !== "undefined") {
    try { entry = JSON.parse(sessionStorage.getItem(PREFIX + key) || "null"); } catch {}
  }
  if (!entry || !Number.isFinite(entry.at) || Date.now() - entry.at > TTL || !Array.isArray(entry.data?.facets)) return null;
  return entry.data;
}
export function loadParamFacets(query: ProductParamsQuery, filters = "", force = false): Promise<ParamFacetsPayload> {
  const key = productParamsKey(query, filters);
  const cached = !force && readParamFacets(key);
  if (cached) return Promise.resolve(cached);
  const flight = pending.get(key);
  if (flight) return flight;
  // Subscribers can change category/unmount without cancelling each other's
  // request. Each component independently ignores results for an older key.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  const request = fetch("/api/catalog-params", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...query, paramFilters: filters }),
    signal: controller.signal,
  }).then(async (response) => {
    const data = await response.json() as ParamFacetsPayload;
    if (!response.ok || !Array.isArray(data?.facets)) throw new Error(data?.error || "params-failed");
    if (data.complete !== false && (data.totalCount > 0 || data.needsCategory)) {
      const entry = { at: Date.now(), data };
      cache.set(key, entry);
      while (cache.size > 48) cache.delete(cache.keys().next().value!);
      try {
        // Persist only category defaults; selection permutations stay in memory.
        if (!filters) {
          const oldKeys = Object.keys(sessionStorage).filter((item) => item.startsWith(PREFIX));
          if (oldKeys.length >= 20) sessionStorage.removeItem(oldKeys[0]);
          sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
        }
      } catch {}
    }
    return data;
  }).finally(() => { window.clearTimeout(timeout); pending.delete(key); });
  pending.set(key, request);
  return request;
}
