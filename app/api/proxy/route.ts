import { NextRequest, NextResponse } from "next/server";

import { oneCRequest } from "app/api/_lib/oneC";
import { fetchEuroRate } from "app/lib/catalog-server";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { stripPurchasePricesFromText } from "app/api/_lib/strip-purchase-prices";

// Public, unauthenticated: only what the browser itself needs. allgoods and
// getdata stay server-side (catalog-server.ts) — their raw answers carry
// purchase prices.
const ALLOWED_ENDPOINTS = new Set([
  "getprod",
  "getauto",
  "prices",
]);

const buildJsonResponse = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const getEndpoint = (request: Request) => {
  const url = new URL(request.url);
  return (url.searchParams.get("endpoint") || "").trim().toLowerCase();
};

const readRequestBody = async (request: Request) => {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
};

// The category tree and car directory are the same for every visitor and
// change rarely. Read via GET (app/lib/onec-proxy-client.ts), they may be
// cached by the browser and nginx; 1C itself only offers them as POST.
const CACHEABLE_GET_ENDPOINTS = new Set(["getprod", "getauto"]);
const CACHEABLE_GET_HEADER = "public, max-age=300, stale-while-revalidate=1800";
const MAX_GET_QUERY_LENGTH = 1024;

// GET carries the 1C request body as JSON in `q` (a plain object, or none).
const readQueryBody = (request: Request): Record<string, unknown> | null => {
  const raw = new URL(request.url).searchParams.get("q");
  if (!raw) return {};
  if (raw.length > MAX_GET_QUERY_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const forwardToOneC = async (endpoint: string, request: Request) => {
  const cacheableGet = request.method === "GET" && CACHEABLE_GET_ENDPOINTS.has(endpoint);
  const body = cacheableGet
    ? readQueryBody(request)
    : request.method === "GET" ? undefined : await readRequestBody(request);
  if (body === null) return buildJsonResponse({ error: "Invalid query" }, 400);
  const result = await oneCRequest(endpoint, {
    method: request.method === "GET" && !cacheableGet ? "GET" : "POST",
    body,
    retries: endpoint === "prices" ? 1 : 0,
    retryDelayMs: 200,
    cacheTtlMs: endpoint === "getprod" ? 1000 * 60 * 30 : endpoint === "getauto" ? 1000 * 60 * 10 : 0,
  });

  // Until 1C's module is updated, "prices" also carries the purchase price.
  const text = endpoint === "prices" ? stripPurchasePricesFromText(result.text) : result.text;
  // 1C reports some failures as 200 with {"error": ...}; never cache those.
  const ok = result.status >= 200 && result.status < 300 && !/^\s*\{\s*"error"/.test(text);

  return new NextResponse(text, {
    status: result.status,
    headers: {
      "content-type": result.contentType || "application/json; charset=utf-8",
      "cache-control": cacheableGet && ok ? CACHEABLE_GET_HEADER : "no-store",
    },
  });
};

const checkProxyRateLimit = (request: NextRequest) =>
  checkRateLimit({ req: request, key: "proxy", limit: 60, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  const rateResult = checkProxyRateLimit(request);
  if (!rateResult.ok) {
    const limited = buildJsonResponse({ error: "Too many requests" }, 429);
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const endpoint = getEndpoint(request);

  if (endpoint === "euro") {
    const rate = await fetchEuroRate();
    return buildJsonResponse({ rate });
  }

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return buildJsonResponse({ error: "Unsupported endpoint", endpoint }, 400);
  }

  return forwardToOneC(endpoint, request);
}

export async function POST(request: NextRequest) {
  const rateResult = checkProxyRateLimit(request);
  if (!rateResult.ok) {
    const limited = buildJsonResponse({ error: "Too many requests" }, 429);
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const endpoint = getEndpoint(request);

  if (endpoint === "euro") {
    const rate = await fetchEuroRate();
    return buildJsonResponse({ rate });
  }

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return buildJsonResponse({ error: "Unsupported endpoint", endpoint }, 400);
  }

  return forwardToOneC(endpoint, request);
}