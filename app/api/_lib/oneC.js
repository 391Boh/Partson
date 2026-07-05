import http from "node:http";
import https from "node:https";

function parsePositiveIntEnv(name, fallbackValue) {
  const numeric = Number(process.env[name]);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
}

const ONEC_MAX_SOCKETS = parsePositiveIntEnv("ONEC_MAX_SOCKETS", 12);
const ONEC_DEFAULT_CONCURRENCY = parsePositiveIntEnv("ONEC_MAX_CONCURRENT_REQUESTS", 12);

const ONEC_HTTP_AGENT = new http.Agent({
  keepAlive: true,
  maxSockets: ONEC_MAX_SOCKETS,
  keepAliveMsecs: 12_000,
});

const ONEC_HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: ONEC_MAX_SOCKETS,
  keepAliveMsecs: 12_000,
});

const endpointActiveRequests = new Map();
const endpointQueues = new Map();

function getEndpointConcurrencyLimit(endpoint) {
  const normalizedEndpoint = String(endpoint || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
  const envLimit = parsePositiveIntEnv(
    normalizedEndpoint ? `ONEC_${normalizedEndpoint}_CONCURRENCY` : "",
    0
  );
  if (envLimit > 0) return Math.min(envLimit, ONEC_DEFAULT_CONCURRENCY);

  switch (endpoint) {
    case "allgoods":
      return Math.min(4, ONEC_DEFAULT_CONCURRENCY);
    case "images":
    case "getimages":
    case "getimagesbatch":
    case "getimages_batch":
    case "getimagebatch":
    case "getphotosbatch":
    case "getphotobatch":
    case "getimagespack":
    case "ПолучитьФотоПакетом":
      return Math.min(5, ONEC_DEFAULT_CONCURRENCY);
    case "prices":
    case "pricespost":
    case "getinfo":
      return Math.min(4, ONEC_DEFAULT_CONCURRENCY);
    case "getprod":
      return Math.min(2, ONEC_DEFAULT_CONCURRENCY);
    case "getauto":
      return Math.min(3, ONEC_DEFAULT_CONCURRENCY);
    case "getdata":
      return Math.min(8, ONEC_DEFAULT_CONCURRENCY);
    default:
      return ONEC_DEFAULT_CONCURRENCY;
  }
}

function runWithEndpointConcurrency(endpoint, task) {
  const limit = getEndpointConcurrencyLimit(endpoint);
  if (!Number.isFinite(limit) || limit <= 0) {
    return Promise.resolve().then(task);
  }

  return new Promise((resolve, reject) => {
    const start = () => {
      endpointActiveRequests.set(
        endpoint,
        (endpointActiveRequests.get(endpoint) || 0) + 1
      );

      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          const active = Math.max(0, (endpointActiveRequests.get(endpoint) || 1) - 1);
          if (active > 0) {
            endpointActiveRequests.set(endpoint, active);
          } else {
            endpointActiveRequests.delete(endpoint);
          }

          const queue = endpointQueues.get(endpoint);
          const next = queue?.shift();
          if (queue && queue.length === 0) {
            endpointQueues.delete(endpoint);
          }
          if (next) next();
        });
    };

    if ((endpointActiveRequests.get(endpoint) || 0) < limit) {
      start();
      return;
    }

    const queue = endpointQueues.get(endpoint) || [];
    queue.push(start);
    endpointQueues.set(endpoint, queue);
  });
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function isValidHttpUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getOneCConfig() {
  const baseUrlRaw = normalizeBaseUrl(
    process.env.ONEC_BASE_URL || process.env.ONEC_URL
  );
  const baseUrl = isValidHttpUrl(baseUrlRaw) ? baseUrlRaw : "";

  const authHeaderFromEnv = String(process.env.ONEC_AUTH_HEADER || "").trim();
  const apiUser = String(process.env.API_USER || "").trim();
  const apiPass = String(process.env.API_PASS || "");
  const authHeaderFromUserPass = apiUser
    ? `Basic ${Buffer.from(`${apiUser}:${apiPass}`, "utf8").toString("base64")}`
    : "";
  const authHeader = authHeaderFromEnv || authHeaderFromUserPass;

  return { baseUrl, baseUrlRaw, authHeader };
}

export function getOneCConfigError() {
  const { baseUrl, baseUrlRaw, authHeader } = getOneCConfig();
  const missing = [];
  if (!baseUrlRaw) {
    missing.push("ONEC_BASE_URL");
  } else if (!baseUrl) {
    missing.push("ONEC_BASE_URL (invalid URL)");
  }
  if (!authHeader) missing.push("ONEC_AUTH_HEADER");
  return missing.length ? `Missing required server env: ${missing.join(", ")}` : "";
}

const responseCache = new Map();
const inFlightRequests = new Map();

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
  const { baseUrl } = getOneCConfig();
  return `${baseUrl}/${endpoint}`;
}

export function getOneCAuthHeader() {
  const { authHeader } = getOneCConfig();
  return authHeader;
}

export function getOneCTimeoutMs(endpoint) {
  switch (endpoint) {
    case "getdata":
      return 25000;
    case "prices":
    case "images":
    case "getimages":
    case "getimagesbatch":
    case "getimages_batch":
    case "getimagebatch":
    case "getphotosbatch":
    case "getphotobatch":
    case "getimagespack":
    case "ПолучитьФотоПакетом":
      return 18000;
    case "getprod":
    case "getauto":
      return 30000;
    case "getinfo":
      return 20000;
    case "pricespost":
    case "allgoods":
      return 30000;
    case "setdescription":
      return 10000;
    default:
      return 12000;
  }
}

/**
 * Evicts all in-memory cache entries whose key contains the given catalog
 * number string. Call this after a successful description/price update so
 * subsequent reads don't serve the stale 1C response.
 */
export function clearOneCCacheForProduct(catalogNumber) {
  const normalized = String(catalogNumber || "").trim();
  if (!normalized) return 0;
  let cleared = 0;
  for (const key of responseCache.keys()) {
    if (key.includes(normalized)) {
      responseCache.delete(key);
      cleared++;
    }
  }
  return cleared;
}

/**
 * Evicts ALL in-memory cache entries. Use after admin product edits to ensure
 * catalog query responses (whose keys don't contain the product code) are also
 * cleared — so router.refresh() on catalog/product pages returns fresh 1C data.
 */
export function clearAllOneCCache() {
  const size = responseCache.size;
  responseCache.clear();
  return size;
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
    retryOn5xx = true,
  } = options;

  pruneCache();

  const configError = getOneCConfigError();
  if (configError) {
    return {
      status: 500,
      text: JSON.stringify({
        error: "1C service misconfigured",
        details: configError,
      }),
      contentType: "application/json",
    };
  }

  const resolvedCacheKey =
    cacheKey ?? `${method}:${endpoint}:${stableStringify(body)}`;
  if (cacheTtlMs > 0) {
    const cached = getCached(resolvedCacheKey);
    if (cached) return cached;
  }

  const inFlight = inFlightRequests.get(resolvedCacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = runWithEndpointConcurrency(endpoint, async () => {
    const url = getOneCUrl(endpoint);
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const agent = parsedUrl.protocol === "https:" ? ONEC_HTTPS_AGENT : ONEC_HTTP_AGENT;
    const headers = {
      Authorization: getOneCAuthHeader(),
    };

    let payload;
    if (method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = "application/json";
      payload = stableStringify(body || {});
    }

    let attempt = 0;
    while (true) {
      try {
        const result = await new Promise((resolve, reject) => {
          const req = transport.request(
            {
              protocol: parsedUrl.protocol,
              hostname: parsedUrl.hostname,
              port: parsedUrl.port,
              path: `${parsedUrl.pathname}${parsedUrl.search}`,
              method,
              agent,
              headers: {
                ...headers,
                ...(payload
                  ? {
                      "Content-Length": Buffer.byteLength(payload),
                    }
                  : {}),
              },
            },
            (res) => {
              let text = "";
              res.setEncoding("utf8");
              res.on("data", (chunk) => {
                text += chunk;
              });
              res.on("end", () => {
                resolve({
                  status: res.statusCode || 500,
                  text,
                  contentType: res.headers["content-type"] || "",
                });
              });
            }
          );

          req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
          });

          req.on("error", (err) => {
            reject(err);
          });

          if (payload) {
            req.write(payload);
          }

          req.end();
        });

        const shouldRetryStatus =
          retryOn5xx &&
          result.status >= 500 &&
          result.status < 600 &&
          attempt < retries;

        if (shouldRetryStatus) {
          attempt += 1;
          const delay = Math.min(1000, retryDelayMs * Math.pow(2, attempt - 1));
          await sleep(delay);
          continue;
        }

        if (cacheTtlMs > 0 && result.status >= 200 && result.status < 300) {
          setCached(resolvedCacheKey, result, cacheTtlMs);
        }

        return result;
      } catch (err) {
        attempt += 1;
        const details =
          err?.name === "AbortError"
            ? `Request timeout after ${timeoutMs}ms`
            : err?.message || String(err);
        if (attempt > retries) {
          return {
            status: 500,
            text: JSON.stringify({
              error: "1C Service unreachable",
              details,
              endpoint,
              url,
            }),
            contentType: "application/json",
          };
        }

        const delay = Math.min(1000, retryDelayMs * Math.pow(2, attempt - 1));
        await sleep(delay);
      }
    }
  }).finally(() => {
    inFlightRequests.delete(resolvedCacheKey);
  });

  inFlightRequests.set(resolvedCacheKey, requestPromise);
  return requestPromise;
}
