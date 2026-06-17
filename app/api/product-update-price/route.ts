import { NextRequest, NextResponse } from "next/server";

import { clearOneCCacheForProduct, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Endpoint in the 1C HTTP-service that handles price reads and updates.
// Must match the endpoint name registered in the 1C configuration.
const ONEC_PRICE_ADMIN_ENDPOINT =
  (process.env.ONEC_PRICE_ADMIN_ENDPOINT || "prices").trim();

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const verifyAdminToken = async (request: NextRequest): Promise<string | null> => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) return null;
    return email;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "product-update-price",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return new NextResponse(JSON.stringify({ ok: false, error: "Too many requests" }), {
      status: 429,
      headers,
    });
  }

  const adminEmail = await verifyAdminToken(request);
  if (!adminEmail) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const body = await readJsonObject(request, { maxBytes: 2048 });
  if (!body.ok) {
    return json({ ok: false, error: body.error }, body.status);
  }

  const { value } = body;

  const code = typeof value.code === "string" ? value.code.trim() : "";
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "code is required" }, 400);
  }

  const hasPriceUAH = value.priceUAH !== undefined && value.priceUAH !== null;
  const hasCostPriceUAH = value.costPriceUAH !== undefined && value.costPriceUAH !== null;

  if (!hasPriceUAH && !hasCostPriceUAH) {
    return json({ ok: false, error: "Provide priceUAH and/or costPriceUAH" }, 400);
  }

  const priceUAH = hasPriceUAH ? Number(value.priceUAH) : undefined;
  const costPriceUAH = hasCostPriceUAH ? Number(value.costPriceUAH) : undefined;

  if (priceUAH !== undefined && (!Number.isFinite(priceUAH) || priceUAH < 0)) {
    return json({ ok: false, error: "priceUAH must be a non-negative number" }, 400);
  }
  if (costPriceUAH !== undefined && (!Number.isFinite(costPriceUAH) || costPriceUAH < 0)) {
    return json({ ok: false, error: "costPriceUAH must be a non-negative number" }, 400);
  }

  const oneCBody: Record<string, unknown> = { Код: code };
  if (priceUAH !== undefined) oneCBody["ЦінаПрод"] = priceUAH;
  if (costPriceUAH !== undefined) oneCBody["ЦінаЗакуп"] = costPriceUAH;

  const result = await oneCRequest(ONEC_PRICE_ADMIN_ENDPOINT, {
    method: "POST",
    body: oneCBody,
    retries: 1,
    retryDelayMs: 300,
    cacheTtlMs: 0,
  });

  if (result.status < 200 || result.status >= 300) {
    let oneCError: string | undefined;
    try {
      const parsed = JSON.parse(result.text) as { error?: string; message?: string };
      oneCError = parsed?.error ?? parsed?.message;
    } catch {
      oneCError = result.text?.slice(0, 200) || undefined;
    }
    return json({ ok: false, error: "1C returned an error", details: oneCError, status: result.status }, 502);
  }

  let parsed: { success?: boolean; found?: boolean; updated?: boolean; message?: string } = {};
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch {
    // non-JSON — treat as success if HTTP 2xx
  }

  if (parsed.success === false || parsed.found === false) {
    return json({
      ok: false,
      error: parsed.message || (parsed.found === false ? "Товар не знайдено в 1С" : "1C повернула помилку"),
    }, 422);
  }

  clearOneCCacheForProduct(code);

  return json({
    ok: true,
    code,
    endpoint: ONEC_PRICE_ADMIN_ENDPOINT,
    updatedBy: adminEmail,
    ...(priceUAH !== undefined ? { priceUAH } : {}),
    ...(costPriceUAH !== undefined ? { costPriceUAH } : {}),
  });
}
