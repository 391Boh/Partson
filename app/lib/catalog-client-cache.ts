export const CATALOG_PRODUCTS_CACHE_KEY = "partson:getprod";
export const CATALOG_PRODUCTS_CACHE_TTL_MS = 1000 * 60 * 5;
export const CATALOG_PRODUCTS_STALE_TTL_MS = 1000 * 60 * 60 * 24;

type ParsedCatalogCacheRecord = {
  t: number;
  v: unknown;
  h: string | null;
};

export type CatalogBrowserCacheSnapshot<T> = {
  items: T[];
  fresh: boolean;
  usable: boolean;
  hash: string | null;
  timestamp: number;
};

const CATALOG_VERSION_CLIENT_TTL_MS = 1000 * 15;

let catalogVersionPromise: Promise<string | null> | null = null;
let catalogVersionHash: string | null = null;
let catalogVersionFetchedAt = 0;

const emptySnapshot = <T>(): CatalogBrowserCacheSnapshot<T> => ({
  items: [],
  fresh: false,
  usable: false,
  hash: null,
  timestamp: 0,
});

const normalizeHash = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getAvailableStorages = () => {
  if (typeof window === "undefined") return [] as Storage[];

  const storages: Storage[] = [];
  try {
    storages.push(window.localStorage);
  } catch {}
  try {
    storages.push(window.sessionStorage);
  } catch {}
  return storages;
};

const parseCatalogCacheRecord = (value: unknown): ParsedCatalogCacheRecord => {
  if (value && typeof value === "object" && !Array.isArray(value) && "v" in value) {
    const record = value as Record<string, unknown>;
    const timestamp = typeof record.t === "number" ? record.t : 0;
    return {
      t: timestamp,
      v: record.v ?? null,
      h: normalizeHash(record.h),
    };
  }

  return {
    t: 0,
    v: value,
    h: null,
  };
};

export const readCatalogBrowserCache = <T>(
  deserialize: (value: unknown) => T[]
): CatalogBrowserCacheSnapshot<T> => {
  const storages = getAvailableStorages();
  if (storages.length === 0) return emptySnapshot<T>();

  let bestSnapshot = emptySnapshot<T>();

  for (const storage of storages) {
    try {
      const raw = storage.getItem(CATALOG_PRODUCTS_CACHE_KEY);
      if (!raw) continue;

      const parsed = parseCatalogCacheRecord(JSON.parse(raw) as unknown);
      const items = deserialize(parsed.v);
      if (items.length === 0) continue;

      const age = Date.now() - parsed.t;
      const usable = age <= CATALOG_PRODUCTS_STALE_TTL_MS;
      if (!usable) continue;

      const snapshot: CatalogBrowserCacheSnapshot<T> = {
        items,
        fresh: age <= CATALOG_PRODUCTS_CACHE_TTL_MS,
        usable,
        hash: parsed.h,
        timestamp: parsed.t,
      };

      if (snapshot.timestamp >= bestSnapshot.timestamp) {
        bestSnapshot = snapshot;
      }
    } catch {
      continue;
    }
  }

  return bestSnapshot;
};

export const writeCatalogBrowserCache = (value: unknown, hash?: string | null) => {
  const storages = getAvailableStorages();
  if (storages.length === 0) return;

  const payload = JSON.stringify({
    t: Date.now(),
    v: value,
    h: normalizeHash(hash),
  });

  for (const storage of storages) {
    try {
      storage.setItem(CATALOG_PRODUCTS_CACHE_KEY, payload);
    } catch {}
  }
};

export const clearCatalogBrowserCache = () => {
  const storages = getAvailableStorages();
  for (const storage of storages) {
    try {
      storage.removeItem(CATALOG_PRODUCTS_CACHE_KEY);
    } catch {}
  }
};

export const fetchCatalogVersionHash = async (options?: { force?: boolean }) => {
  if (typeof window === "undefined") return null;

  const force = options?.force === true;
  const now = Date.now();
  if (
    !force &&
    catalogVersionHash &&
    now - catalogVersionFetchedAt < CATALOG_VERSION_CLIENT_TTL_MS
  ) {
    return catalogVersionHash;
  }

  if (catalogVersionPromise) {
    return catalogVersionPromise;
  }

  catalogVersionPromise = fetch("/api/catalog-version", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) return catalogVersionHash;

      const payload = (await response.json()) as { hash?: unknown };
      const nextHash = normalizeHash(payload?.hash);
      if (nextHash) {
        catalogVersionHash = nextHash;
        catalogVersionFetchedAt = Date.now();
      }

      return nextHash ?? catalogVersionHash;
    })
    .catch(() => catalogVersionHash)
    .finally(() => {
      catalogVersionPromise = null;
    });

  return catalogVersionPromise;
};
