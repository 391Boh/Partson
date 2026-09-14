import "server-only";

import { readFile, stat } from "node:fs/promises";

import type { CatalogSeoFacets } from "app/lib/catalog-seo";

const SEO_COUNTS_SNAPSHOT_PATH = ".cache/seo-counts.json";

let cachedSnapshot: { signature: string; data: CatalogSeoFacets } | null = null;
let snapshotReadPromise: Promise<CatalogSeoFacets | null> | null = null;

const readSnapshot = async (): Promise<CatalogSeoFacets | null> => {
  try {
    const file = await stat(SEO_COUNTS_SNAPSHOT_PATH);
    const signature = `${file.ino}:${file.mtimeMs}:${file.ctimeMs}:${file.size}`;
    if (cachedSnapshot?.signature === signature) return cachedSnapshot.data;

    const parsed: unknown = JSON.parse(await readFile(SEO_COUNTS_SNAPSHOT_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Partial<CatalogSeoFacets>;
    if (
      !Array.isArray(data.groups) ||
      !Array.isArray(data.producers) ||
      typeof data.totalProductCount !== "number"
    ) {
      return null;
    }

    cachedSnapshot = { signature, data: data as CatalogSeoFacets };
    return cachedSnapshot.data;
  } catch {
    // Missing or partially regenerated snapshots remain retryable.
    return null;
  }
};

export const readCatalogSeoFacetsSnapshot = () => {
  // Share the parsed public directory across requests, while a cheap stat
  // detects regenerated snapshots immediately. Concurrent readers share I/O.
  if (!snapshotReadPromise) {
    snapshotReadPromise = readSnapshot().finally(() => {
      snapshotReadPromise = null;
    });
  }
  return snapshotReadPromise;
};
