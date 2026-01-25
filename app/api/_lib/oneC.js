const DEFAULT_BASE_URL =
  "http://192.168.0.103:8080/RetailShopAuto1/hs/serv";

const BASE_URL = process.env.ONEC_BASE_URL || DEFAULT_BASE_URL;
const AUTH_HEADER =
  process.env.ONEC_AUTH_HEADER ||
  "Basic " + Buffer.from("admin:").toString("base64");

const responseCache = new Map();

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableStringify(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pruneCache() {
  const now = nowMs();
  for (const [key, entry] of responseCache.entries()) {
    if (!entry || entry.expiresAt <= now) responseCache.delete(key);
  }
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  responseCache.set(key, { expiresAt: nowMs() + ttlMs, value });
}

export function getOneCUrl(endpoint) {
  return `${BASE_URL}/${endpoint}`;
}

export function getOneCAuthHeader() {
  return AUTH_HEADER;
}

export function getOneCTimeoutMs(endpoint) {
  // First hit on 1C endpoints can be slow (cache warm-up / heavy queries),
  // so give "catalog" endpoints more time to avoid unnecessary retries.
  switch (endpoint) {
    case "getdata":
      return 20000;
    case "prices":
    case "getimages":
      return 15000;
    case "getprod":
    case "getauto":
      return 12000;
    case "pricespost":
      return 25000;
    default:
      return 7000;
  }
}

export async function oneCRequest(endpoint, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs = getOneCTimeoutMs(endpoint),
    retries = 1,
    retryDelayMs = 200,
    cacheTtlMs = 0,
    cacheKey,
  } = options;

  pruneCache();

  const resolvedCacheKey =
    cacheKey ?? `${method}:${endpoint}:${stableStringify(body)}`;
  if (cacheTtlMs > 0) {
    const cached = getCached(resolvedCacheKey);
    if (cached) return cached;
  }

  const url = getOneCUrl(endpoint);
  const headers = {
    Authorization: AUTH_HEADER,
  };

  let payload;
  if (method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    payload = stableStringify(body || {});
  }

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await res.text();
      const result = {
        status: res.status,
        text,
        contentType: res.headers.get("content-type") || "",
      };

      if (cacheTtlMs > 0 && res.ok) {
        setCached(resolvedCacheKey, result, cacheTtlMs);
      }

      return result;
    } catch (err) {
      attempt += 1;
      if (attempt > retries) {
        return {
          status: 500,
          text: JSON.stringify({
            error: "1C Service unreachable",
            details: err?.message || String(err),
            endpoint,
          }),
          contentType: "application/json",
        };
      }

      const delay = Math.min(1000, retryDelayMs * Math.pow(2, attempt - 1));
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
}

