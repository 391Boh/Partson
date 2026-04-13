import http from "node:http";
import https from "node:https";

const ONEC_HTTP_AGENT = new http.Agent({
  keepAlive: true,
  maxSockets: 24,
  keepAliveMsecs: 12_000,
});

const ONEC_HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 24,
  keepAliveMsecs: 12_000,
});

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
    case "getimages":
      return 18000;
    case "getprod":
    case "getauto":
      return 30000;
    case "getinfo":
      return 20000;
    case "pricespost":
    case "allgoods":
      return 30000;
    default:
      return 12000;
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

  const requestPromise = (async () => {
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
  })().finally(() => {
    inFlightRequests.delete(resolvedCacheKey);
  });

  inFlightRequests.set(resolvedCacheKey, requestPromise);
  return requestPromise;
}