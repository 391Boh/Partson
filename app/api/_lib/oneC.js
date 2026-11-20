import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readBuildSnapshot, recordBuildSnapshot, missingBuildSnapshot } from "./oneC-build-snapshots.js";

// --- Development-only disk cache -------------------------------------------
// In `next dev`, the in-memory response cache below is wiped whenever a server
// module is hot-reloaded or the dev server restarts, so a cold hit for the
// full category tree / car list costs a multi-second 1C round trip before the
// page can hydrate. Only those two endpoints are mirrored to `.cache/onec-dev/`
// — they are big, slow, and keyed stably. Everything else (catalog pages,
// image lookups, …) is left to the in-memory cache: it has thousands of
// distinct keys and a sync write per response would stall the dev server.
// Never active in production; disable with ONEC_DEV_DISK_CACHE=0.
const DEV_DISK_CACHE =
  process.env.NODE_ENV === "development" &&
  process.env.ONEC_DEV_DISK_CACHE !== "0";
const DEV_DISK_CACHE_ENDPOINTS = new Set(["getprod", "getauto"]);
const DEV_DISK_CACHE_DIR = path.join(process.cwd(), ".cache", "onec-dev");
const DEV_DISK_CACHE_TTL_MS = parsePositiveIntEnv(
  "ONEC_DEV_DISK_CACHE_TTL_MS",
  1000 * 60 * 60 * 24
);

function devDiskCachePath(key) {
  const hash = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(DEV_DISK_CACHE_DIR, `${hash}.json`);
}

function readDevDiskCache(endpoint, key) {
  if (!DEV_DISK_CACHE || !DEV_DISK_CACHE_ENDPOINTS.has(endpoint)) return null;
  try {
    const file = devDiskCachePath(key);
    const stat = fs.statSync(file);
    if (nowMs() - stat.mtimeMs > DEV_DISK_CACHE_TTL_MS) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed.text === "string") return parsed;
  } catch {
    // missing / unreadable / corrupt — treat as a miss
  }
  return null;
}

function writeDevDiskCache(endpoint, key, value) {
  if (!DEV_DISK_CACHE || !DEV_DISK_CACHE_ENDPOINTS.has(endpoint)) return;
  const payload = JSON.stringify({
    status: value.status,
    text: value.text,
    contentType: value.contentType || "",
  });
  // fire-and-forget so the disk write never sits on the request path
  fs.promises
    .mkdir(DEV_DISK_CACHE_DIR, { recursive: true })
    .then(() => fs.promises.writeFile(devDiskCachePath(key), payload))
    .catch(() => {});
}

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
      return Math.min(8, ONEC_DEFAULT_CONCURRENCY);
    case "getdata":
      return Math.min(8, ONEC_DEFAULT_CONCURRENCY);
    default:
      return ONEC_DEFAULT_CONCURRENCY;
  }
}

// --- One gate for every 1C request in this process ---------------------------
// Apache serves the 1C publication with mpm_prefork MaxRequestWorkers 4, so 1C
// answers at most 4 requests at a time. The per-endpoint limits above add up to
// ~12, and Next.js loads this module more than once (pages and route handlers
// get separate copies), so the site used to open far more connections than
// that: the surplus queued inside Apache, timed out here, and 1C still did the
// work for requests nobody was waiting for any more (hundreds of allgoods/
// getimages timeouts a day on 2026-11-20). Waiting here instead costs 1C
// nothing, and a request whose budget runs out in this queue is never sent.
// Anchored on globalThis so every module copy shares the one gate.
const ONEC_GLOBAL_CONCURRENCY = parsePositiveIntEnv("ONEC_GLOBAL_CONCURRENCY", 4);
const globalOneCGate =
  globalThis.__partsonOneCGate ??
  (globalThis.__partsonOneCGate = { active: 0, queue: [] });

class OneCBusyError extends Error {}

function releaseGlobalOneCSlot() {
  globalOneCGate.active = Math.max(0, globalOneCGate.active - 1);
  while (globalOneCGate.queue.length > 0 && globalOneCGate.active < ONEC_GLOBAL_CONCURRENCY) {
    const next = globalOneCGate.queue.shift();
    if (next.settled) continue;
    next.settled = true;
    clearTimeout(next.timer);
    globalOneCGate.active += 1;
    next.resolve();
  }
}

// Resolves once a slot is held (the caller must release it), or rejects with
// OneCBusyError after waitMs without one.
function acquireGlobalOneCSlot(waitMs) {
  if (globalOneCGate.active < ONEC_GLOBAL_CONCURRENCY) {
    globalOneCGate.active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const entry = { settled: false, resolve, timer: null };
    entry.timer = setTimeout(() => {
      if (entry.settled) return;
      entry.settled = true;
      const index = globalOneCGate.queue.indexOf(entry);
      if (index !== -1) globalOneCGate.queue.splice(index, 1);
      reject(new OneCBusyError(`Timed out after ${waitMs}ms waiting for a free 1C slot`));
    }, Math.max(1, waitMs));
    globalOneCGate.queue.push(entry);
  });
}

// --- Circuit breaker for a broken 1C -------------------------------------------
// On 2026-11-20 1C answered HTTP 500 to ~92% of requests for 50 minutes (its
// file infobase after the disk filled). Every page, retry and background scan
// kept sending requests anyway. When almost everything recent came back 5xx,
// requests fail at once for a short while instead, and one probe at a time
// checks whether 1C is back; the first good answer closes the breaker.
// Timeouts are not counted: under load they come from short page budgets,
// not from a broken 1C. Stock movements (orders) are never held back.
const BREAKER_WINDOW_MS = 20_000;
const BREAKER_MIN_RESULTS = 15;
const BREAKER_FAILURE_RATIO = 0.9;
const BREAKER_OPEN_MS = 15_000;
const BREAKER_PROBE_INTERVAL_MS = 3_000;
const oneCBreaker =
  globalThis.__partsonOneCBreaker ??
  (globalThis.__partsonOneCBreaker = { results: [], openUntil: 0, nextProbeAt: 0 });

function recordBreakerResult(serverError) {
  const now = nowMs();
  if (!serverError) {
    if (oneCBreaker.openUntil) console.warn("[1C] breaker closed: 1C answers again");
    oneCBreaker.openUntil = 0;
  }
  oneCBreaker.results.push({ at: now, bad: serverError });
  while (oneCBreaker.results.length && now - oneCBreaker.results[0].at > BREAKER_WINDOW_MS) oneCBreaker.results.shift();
  if (!serverError || oneCBreaker.results.length < BREAKER_MIN_RESULTS) return;
  const bad = oneCBreaker.results.reduce((n, r) => n + (r.bad ? 1 : 0), 0);
  if (bad / oneCBreaker.results.length >= BREAKER_FAILURE_RATIO) {
    if (oneCBreaker.openUntil <= now) console.warn(`[1C] breaker open: ${bad}/${oneCBreaker.results.length} recent answers were 5xx`);
    oneCBreaker.openUntil = now + BREAKER_OPEN_MS;
    oneCBreaker.results = [];
  }
}

// True when this request may go to 1C now (the breaker is closed, or this is
// the one probe allowed per interval while it is open).
function breakerAllows() {
  const now = nowMs();
  if (oneCBreaker.openUntil <= now) return true;
  if (now < oneCBreaker.nextProbeAt) return false;
  oneCBreaker.nextProbeAt = now + BREAKER_PROBE_INTERVAL_MS;
  return true;
}

// --- Traffic summary ---------------------------------------------------------
// One log line per 15 minutes: requests per endpoint and request shape (the
// body's field names, not values), how many came back empty, timed out or
// never got a 1C slot, and the average time. Shows which callers load 1C.
const ONEC_STATS_INTERVAL_MS = 15 * 60 * 1000;
const oneCStats =
  globalThis.__partsonOneCStats ??
  (globalThis.__partsonOneCStats = { since: Date.now(), rows: new Map() });

function requestShape(endpoint, body) {
  if (!body || typeof body !== "object") return endpoint;
  const fields = Object.keys(body).filter((key) => body[key] !== false && body[key] !== "" && body[key] != null);
  return `${endpoint}{${fields.sort().join(",")}}`;
}

function recordOneCStat(shape, outcome, ms, text) {
  const row = oneCStats.rows.get(shape) ?? { n: 0, empty: 0, failed: 0, busy: 0, ms: 0 };
  row.n += 1;
  row.ms += ms;
  if (outcome === "busy") row.busy += 1;
  else if (outcome === "failed") row.failed += 1;
  else if (typeof text === "string" && /"(?:items|Товари)"\s*:\s*\[\s*\]/.test(text.slice(0, 600))) row.empty += 1;
  oneCStats.rows.set(shape, row);

  const now = Date.now();
  if (now - oneCStats.since < ONEC_STATS_INTERVAL_MS) return;
  const minutes = Math.round((now - oneCStats.since) / 60000);
  const summary = [...oneCStats.rows]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12)
    .map(([key, r]) => `${key} n=${r.n} empty=${r.empty} failed=${r.failed} busy=${r.busy} avg=${Math.round(r.ms / r.n)}ms`)
    .join(" | ");
  console.log(`[1C stats ${minutes}m] ${summary}`);
  oneCStats.since = now;
  oneCStats.rows.clear();
}

// A request's own timeoutMs (below, req.setTimeout) only bounds time spent
// actually in flight — it starts counting once this function calls `task`,
// not while queued waiting for a concurrency slot. Under a genuinely slow
// 1C, every endpoint's fixed slot count (getEndpointConcurrencyLimit) fills
// with requests that are themselves each taking up to their own timeout to
// fail, so later callers queue behind them with no bound on that wait at
// all — one degraded window compounds into an ever-growing backlog instead
// of every caller failing fast on roughly the same schedule. queueTimeoutMs
// gives a queued (not yet started) task the same kind of ceiling: if its
// turn hasn't come by then, it fails now instead of eventually.
function runWithEndpointConcurrency(endpoint, task, queueTimeoutMs) {
  const limit = getEndpointConcurrencyLimit(endpoint);
  if (!Number.isFinite(limit) || limit <= 0) {
    return Promise.resolve().then(task);
  }

  return new Promise((resolve, reject) => {
    let settledInQueue = false;
    let queueTimer = null;

    const removeFromQueue = (entry) => {
      const queue = endpointQueues.get(endpoint);
      if (!queue) return;
      const index = queue.indexOf(entry);
      if (index !== -1) queue.splice(index, 1);
      if (queue.length === 0) endpointQueues.delete(endpoint);
    };

    const start = () => {
      if (settledInQueue) return;
      if (queueTimer) {
        clearTimeout(queueTimer);
        queueTimer = null;
      }

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

    if (Number.isFinite(queueTimeoutMs) && queueTimeoutMs > 0) {
      queueTimer = setTimeout(() => {
        settledInQueue = true;
        removeFromQueue(start);
        reject(
          new Error(
            `Timed out after ${queueTimeoutMs}ms waiting for a free "${endpoint}" request slot`
          )
        );
      }, queueTimeoutMs);
    }
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
let cacheGeneration = 0;
const RESPONSE_CACHE_MAX_ENTRIES = parsePositiveIntEnv("ONEC_CACHE_MAX_ENTRIES", 2048);
const RESPONSE_CACHE_MAX_BYTES = parsePositiveIntEnv("ONEC_CACHE_MAX_BYTES", 64 * 1024 * 1024);
const RESPONSE_CACHE_PRUNE_INTERVAL_MS = 30_000;
let responseCacheBytes = 0;
let nextCachePruneAt = 0;

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
  // Price/image lookups fan out into many requests. Scanning the entire cache
  // on every hit turns a warm catalogue request into work proportional to all
  // previously visited products. Individual reads still check their own TTL.
  if (now < nextCachePruneAt) return;
  nextCachePruneAt = now + RESPONSE_CACHE_PRUNE_INTERVAL_MS;
  for (const [key, entry] of responseCache.entries()) {
    if ((entry.staleUntil || entry.expiresAt) <= now) deleteCached(key);
  }
}

function deleteCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return;
  responseCacheBytes -= entry.sizeBytes;
  responseCache.delete(key);
}

// The category tree, car list and product info change rarely but cost
// seconds to fetch cold. Past their TTL they are still served for this long
// while one background request refreshes them, so the visitor who happens to
// arrive after expiry no longer waits for 1C.
const STALE_WHILE_REVALIDATE_ENDPOINTS = new Set(["getprod", "getauto", "getinfo"]);
const STALE_WHILE_REVALIDATE_MS = parsePositiveIntEnv("ONEC_STALE_WHILE_REVALIDATE_MS", 1000 * 60 * 60 * 6);

function getStaleCached(key) {
  const entry = responseCache.get(key);
  if (!entry || !entry.staleUntil || entry.staleUntil <= nowMs()) return null;
  return entry.value;
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) {
    if (!entry.staleUntil || entry.staleUntil <= nowMs()) deleteCached(key);
    return null;
  }
  // Map insertion order doubles as the LRU list without another allocation.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry.value;
}

function setCached(key, value, ttlMs, staleMs = 0) {
  if (!ttlMs || ttlMs <= 0) return;
  // Count UTF-16 string storage conservatively, including request keys. Image
  // responses can be several MB, so an entry count alone cannot bound memory.
  const sizeBytes = 2 * (key.length + value.text.length + (value.contentType || "").length);
  deleteCached(key);
  if (sizeBytes > RESPONSE_CACHE_MAX_BYTES) return;

  while (
    responseCache.size >= RESPONSE_CACHE_MAX_ENTRIES ||
    responseCacheBytes + sizeBytes > RESPONSE_CACHE_MAX_BYTES
  ) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey === undefined) break;
    deleteCached(oldestKey);
  }

  const expiresAt = nowMs() + ttlMs;
  responseCache.set(key, { expiresAt, staleUntil: staleMs > 0 ? expiresAt + staleMs : 0, value, sizeBytes });
  responseCacheBytes += sizeBytes;
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
      deleteCached(key);
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
  cacheGeneration += 1;
  const size = responseCache.size;
  responseCache.clear();
  responseCacheBytes = 0;
  nextCachePruneAt = 0;
  if (DEV_DISK_CACHE) {
    try {
      fs.rmSync(DEV_DISK_CACHE_DIR, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
  return size;
}

// Page renders give 1C deliberately short budgets (a few hundred ms) and
// fall back when they run out, so timeouts come in bursts. One line per
// endpoint a minute, with how many were folded into it.
const failureLog = new Map();
function logOneCFailure(endpoint, url, details) {
  const now = nowMs();
  const entry = failureLog.get(endpoint);
  if (entry && now - entry.loggedAt < 60_000) {
    entry.suppressed += 1;
    return;
  }
  const suppressed = entry?.suppressed ? ` (+${entry.suppressed} more in the last minute)` : "";
  failureLog.set(endpoint, { loggedAt: now, suppressed: 0 });
  console.warn(`[1C] ${endpoint} failed at ${url}: ${details}${suppressed}`);
}

export async function oneCRequest(endpoint, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs = getOneCTimeoutMs(endpoint),
    retries: requestedRetries = 1,
    retryDelayMs = 200,
    cacheTtlMs = 0,
    cacheKey,
    retryOn5xx = true,
  } = options;
  // Receipt/sale is a non-idempotent movement. Neither retry it after a
  // timeout nor collapse two independent operations with identical bodies.
  const stockMovement = body && typeof body === "object" &&
    (Object.hasOwn(body, "Поступлення") || Object.hasOwn(body, "Реалізація"));
  const retries = stockMovement ? 0 : requestedRetries;
  const requestGeneration = cacheGeneration;

  const resolvedCacheKey = cacheKey ?? `${method}:${endpoint}:${stableStringify(body)}`;
  if (process.env.ONEC_BUILD_SNAPSHOT_ONLY === "1") {
    if (stockMovement) return missingBuildSnapshot(endpoint, resolvedCacheKey);
    const snapshot = readBuildSnapshot(endpoint, resolvedCacheKey);
    if (snapshot) return snapshot;
    // ONEC_BUILD_LIVE_FALLBACK: a request sync:catalog did not record goes to
    // live 1C (and is recorded for the next build) instead of rendering the
    // page from a 503 placeholder.
    if (process.env.ONEC_BUILD_LIVE_FALLBACK !== "1") return missingBuildSnapshot(endpoint, resolvedCacheKey);
  }

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

  if (cacheTtlMs > 0) {
    const cached = getCached(resolvedCacheKey);
    if (cached) return recordBuildSnapshot(endpoint, resolvedCacheKey, cached);
    const disk = readDevDiskCache(endpoint, resolvedCacheKey);
    if (disk) {
      setCached(resolvedCacheKey, disk, cacheTtlMs);
      return recordBuildSnapshot(endpoint, resolvedCacheKey, disk);
    }
  }
  const staleMs = cacheTtlMs > 0 && STALE_WHILE_REVALIDATE_ENDPOINTS.has(endpoint) ? STALE_WHILE_REVALIDATE_MS : 0;
  const stale = staleMs > 0 ? getStaleCached(resolvedCacheKey) : null;

  const inFlightKey = `${requestGeneration}:${resolvedCacheKey}`;
  const inFlight = stockMovement ? null : inFlightRequests.get(inFlightKey);
  if (inFlight) {
    return stale ?? inFlight;
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

    const shape = requestShape(endpoint, body);
    let attempt = 0;
    while (true) {
      const attemptStartedAt = nowMs();
      // Stock movements (orders) are never held back: they are rare, and one
      // that is refused here could not be retried.
      const gated = !stockMovement;
      let attemptTimeoutMs = timeoutMs;
      if (gated && !breakerAllows()) {
        recordOneCStat(shape, "busy", 0);
        return {
          status: 503,
          text: JSON.stringify({ error: "1C Service unavailable", details: "1C is failing; retrying shortly", endpoint }),
          contentType: "application/json",
        };
      }
      try {
        if (gated) {
          // Waiting for a slot spends this attempt's own budget (it used to be
          // spent the same way in Apache's queue); at least a quarter of it is
          // always left for 1C itself.
          await acquireGlobalOneCSlot(Math.floor(timeoutMs * 0.75));
          attemptTimeoutMs = Math.max(Math.floor(timeoutMs * 0.25), timeoutMs - (nowMs() - attemptStartedAt));
        }
      } catch (err) {
        recordOneCStat(shape, "busy", nowMs() - attemptStartedAt);
        logOneCFailure(endpoint, getOneCUrl(endpoint), err?.message || String(err));
        return {
          status: 503,
          text: JSON.stringify({ error: "1C Service busy", details: err?.message || String(err), endpoint }),
          contentType: "application/json",
        };
      }
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
              res.on("error", reject);
              res.on("end", () => {
                resolve({
                  status: res.statusCode || 500,
                  text,
                  contentType: res.headers["content-type"] || "",
                });
              });
            }
          );

          // setTimeout only fires on an idle socket; a response trickling in
          // slowly would never trip it. The deadline bounds the whole request.
          req.setTimeout(attemptTimeoutMs, () => {
            req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
          });
          const deadline = setTimeout(() => {
            req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
          }, attemptTimeoutMs + 1000);

          req.on("error", (err) => {
            clearTimeout(deadline);
            reject(err);
          });
          req.on("close", () => clearTimeout(deadline));

          if (payload) {
            req.write(payload);
          }

          req.end();
        }).finally(() => {
          if (gated) releaseGlobalOneCSlot();
        });
        recordOneCStat(shape, result.status >= 200 && result.status < 300 ? "ok" : "failed", nowMs() - attemptStartedAt, result.text);
        recordBreakerResult(result.status >= 500);

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

        if (cacheTtlMs > 0 && requestGeneration === cacheGeneration && result.status >= 200 && result.status < 300) {
          setCached(resolvedCacheKey, result, cacheTtlMs, staleMs);
          writeDevDiskCache(endpoint, resolvedCacheKey, result);
        }

        if (!stockMovement) recordBuildSnapshot(endpoint, resolvedCacheKey, result);
        return result;
      } catch (err) {
        recordOneCStat(shape, "failed", nowMs() - attemptStartedAt);
        // A refused or reset connection means 1C/Apache is down; a timeout does not.
        if (!/timeout/i.test(err?.message || "") && err?.name !== "AbortError") recordBreakerResult(true);
        attempt += 1;
        const details =
          err?.name === "AbortError"
            ? `Request timeout after ${timeoutMs}ms`
            : err?.message || String(err);
        if (attempt > retries) {
          logOneCFailure(endpoint, url, details);
          return {
            status: 500,
            text: JSON.stringify({
              // No 1C address here: /api/proxy hands this body to browsers.
              error: "1C Service unreachable",
              details,
              endpoint,
            }),
            contentType: "application/json",
          };
        }

        const delay = Math.min(1000, retryDelayMs * Math.pow(2, attempt - 1));
        await sleep(delay);
      }
    }
  }, timeoutMs)
    // A request that never got a slot fails like any other unreachable call
    // (a result, not a throw), so callers handle both the same way.
    .catch((err) => ({
      status: 503,
      text: JSON.stringify({ error: "1C Service busy", details: err?.message || String(err), endpoint }),
      contentType: "application/json",
    }))
    .finally(() => {
      if (!stockMovement) inFlightRequests.delete(inFlightKey);
    });

  if (!stockMovement) inFlightRequests.set(inFlightKey, requestPromise);
  // Past its TTL, a slow tree answer is still served while this refreshes it.
  return stale ?? requestPromise;
}
