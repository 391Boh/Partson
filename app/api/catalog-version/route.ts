import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { oneCRequest } from "app/api/_lib/oneC";

export const runtime = "nodejs";

const CACHE_CONTROL_HEADER =
  "public, max-age=15, s-maxage=15, stale-while-revalidate=60";

const HASH_CANDIDATE_KEYS = [
  "hash",
  "version",
  "etag",
  "cache",
  "value",
  "data",
  "result",
  "response",
] as const;

const buildHash = (value: string) =>
  createHash("sha1").update(value).digest("hex");

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const extractVersionCandidate = (value: unknown, depth = 0): string | null => {
  if (depth > 4 || value == null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && trimmed !== '""' ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractVersionCandidate(item, depth + 1);
      if (candidate) return candidate;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of HASH_CANDIDATE_KEYS) {
    const candidate = extractVersionCandidate(record[key], depth + 1);
    if (candidate) return candidate;
  }

  for (const nested of Object.values(record)) {
    const candidate = extractVersionCandidate(nested, depth + 1);
    if (candidate) return candidate;
  }

  return null;
};

const resolveCatalogVersionHash = (rawText: string) => {
  const trimmed = normalizeString(rawText);
  if (!trimmed || trimmed === '""') return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const candidate = extractVersionCandidate(parsed);
    if (candidate) return buildHash(candidate);
  } catch {}

  const unquoted = trimmed.replace(/^"+|"+$/g, "").trim();
  return unquoted ? buildHash(unquoted) : null;
};

export async function GET() {
  try {
    const catalogResponse = await oneCRequest("getprod", {
      method: "POST",
      body: {},
      retries: 0,
      cacheTtlMs: 1000 * 60,
      cacheKey: "catalog-version:getprod",
    });

    const catalogHash =
      catalogResponse.status >= 200 && catalogResponse.status < 300
        ? resolveCatalogVersionHash(catalogResponse.text)
        : null;

    return NextResponse.json(
      {
        hash: catalogHash,
        source: catalogHash ? "getprod" : "unavailable",
      },
      {
        headers: {
          "cache-control": CACHE_CONTROL_HEADER,
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        hash: null,
        source: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 200,
        headers: {
          "cache-control": CACHE_CONTROL_HEADER,
        },
      }
    );
  }
}
