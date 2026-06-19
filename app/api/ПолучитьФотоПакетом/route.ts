import { NextResponse } from "next/server";

import { oneCRequest } from "app/api/_lib/oneC";

export const runtime = "nodejs";

const ONEC_PHOTO_BATCH_ENDPOINT =
  (process.env.ONEC_IMAGE_BATCH_ENDPOINT || "ПолучитьФотоПакетом").trim();
const MAX_PHOTO_BATCH_LIMIT = 30;

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });

const readPositiveInteger = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
};

const normalizeBody = (value: Record<string, unknown>) => {
  const rawCodes = Array.isArray(value.codes)
    ? value.codes
    : Array.isArray(value["Коды"])
      ? value["Коды"]
      : [];
  const codes = rawCodes
    .map((code) => (typeof code === "string" ? code.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_PHOTO_BATCH_LIMIT);

  if (codes.length > 0) {
    return { codes };
  }

  const limit = Math.min(
    readPositiveInteger(value["Лимит"] ?? value.limit) ?? 20,
    MAX_PHOTO_BATCH_LIMIT
  );
  const cursor =
    typeof value["ПослеКода"] === "string"
      ? value["ПослеКода"].trim()
      : typeof value.afterCode === "string"
        ? value.afterCode.trim()
        : "";

  return {
    Лимит: limit,
    ПослеКода: cursor,
  };
};

export async function POST(request: Request) {
  let value: Record<string, unknown>;
  try {
    const parsed = await request.json();
    value = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return json({ success: false, error: "Invalid JSON body", items: [] }, 400);
  }

  const body = normalizeBody(value);
  const response = await oneCRequest(ONEC_PHOTO_BATCH_ENDPOINT, {
    method: "POST",
    body,
    timeoutMs: 18_000,
    retries: 1,
    retryDelayMs: 250,
    cacheTtlMs: 1000 * 60 * 30,
    cacheKey: JSON.stringify({
      endpoint: ONEC_PHOTO_BATCH_ENDPOINT,
      body,
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    return json(
      {
        success: false,
        error: "1C returned an error",
        status: response.status,
        details: response.text?.slice(0, 300) || "",
        items: [],
      },
      502
    );
  }

  try {
    return json(JSON.parse(response.text || "{}"));
  } catch {
    return json({ success: true, raw: response.text || "", items: [] });
  }
}
