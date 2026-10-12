"use client";

// Browser cache of the UAH/EUR rate. The format (key, `{ rate, t }`, TTL)
// matches readCachedEuroRate/writeCachedEuroRate in app/components/Data.tsx,
// which writes the same entry when the catalog loads the rate — keep the two
// in sync until Data.tsx imports these helpers too.
const EURO_RATE_CACHE_KEY = "partson:v1:euro-rate";
const EURO_RATE_CACHE_TTL_MS = 1000 * 60 * 30;

export const readCachedEuroRate = (): number | null => {
  if (typeof window === "undefined") return null;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(EURO_RATE_CACHE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { rate?: unknown; t?: unknown };
      if (
        typeof parsed?.rate !== "number" ||
        !Number.isFinite(parsed.rate) ||
        parsed.rate <= 0 ||
        typeof parsed.t !== "number" ||
        Date.now() - parsed.t > EURO_RATE_CACHE_TTL_MS
      ) {
        continue;
      }
      return parsed.rate;
    } catch {
      // Storage may be unavailable (private mode); fall through.
    }
  }
  return null;
};

export const writeCachedEuroRate = (rate: number) => {
  if (typeof window === "undefined" || !Number.isFinite(rate) || rate <= 0) return;
  const payload = JSON.stringify({ rate, t: Date.now() });
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.setItem(EURO_RATE_CACHE_KEY, payload);
    } catch {
      // ignore
    }
  }
};

let inFlight: Promise<number | null> | null = null;

/** Cached rate, or one shared request to /api/proxy?endpoint=euro. */
export const loadEuroRate = (): Promise<number | null> => {
  const cached = readCachedEuroRate();
  if (cached != null) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetch("/api/proxy?endpoint=euro", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const json = (await res.json()) as { rate?: unknown };
      if (typeof json?.rate !== "number" || !Number.isFinite(json.rate) || json.rate <= 0) {
        return null;
      }
      writeCachedEuroRate(json.rate);
      return json.rate;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};
