import { NextResponse } from "next/server";

import { oneCRequest } from "app/api/_lib/oneC";
import { fetchEuroRate } from "app/lib/catalog-server";

const ALLOWED_ENDPOINTS = new Set([
  "getprod",
  "getauto",
  "prices",
  "getdata",
  "allgoods",
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

const forwardToOneC = async (endpoint: string, request: Request) => {
  const body = request.method === "GET" ? undefined : await readRequestBody(request);
  const result = await oneCRequest(endpoint, {
    method: request.method === "GET" ? "GET" : "POST",
    body,
    retries: endpoint === "prices" ? 1 : 0,
    retryDelayMs: 200,
    cacheTtlMs: endpoint === "getprod" ? 1000 * 60 * 30 : endpoint === "getauto" ? 1000 * 60 * 10 : 0,
  });

  return new NextResponse(result.text, {
    status: result.status,
    headers: {
      "content-type": result.contentType || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};

export async function GET(request: Request) {
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

export async function POST(request: Request) {
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