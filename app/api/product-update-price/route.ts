import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Endpoint in the 1C HTTP-service that handles price reads and updates.
// Must match the endpoint name registered in the 1C configuration.
const ONEC_PRICE_ADMIN_ENDPOINT =
  (
    process.env.ONEC_PRODUCT_UPDATE_ENDPOINT ||
    process.env.ONEC_PRICE_ADMIN_ENDPOINT ||
    "edit"
  ).trim();

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

  const code =
    typeof value.code === "string" && value.code.trim()
      ? value.code.trim()
      : typeof value["Код"] === "string"
        ? value["Код"].trim()
        : "";
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "code/Код is required" }, 400);
  }

  const article =
    typeof value.article === "string" && value.article.trim()
      ? value.article.trim()
      : typeof value["НомерПоКаталогу"] === "string" && value["НомерПоКаталогу"].trim()
        ? value["НомерПоКаталогу"].trim()
        : "";

  const salePriceValue =
    value.priceEuro !== undefined && value.priceEuro !== null
      ? value.priceEuro
      : value["ЦінаПрод"];
  const costPriceValue =
    value.costPriceEuro !== undefined && value.costPriceEuro !== null
      ? value.costPriceEuro
      : value["ЦінаЗакуп"];
  const hasSalePrice = salePriceValue !== undefined && salePriceValue !== null;
  const hasCostPrice = costPriceValue !== undefined && costPriceValue !== null;

  if (!hasSalePrice && !hasCostPrice) {
    return json({ ok: false, error: "Provide priceEuro/ЦінаПрод and/or costPriceEuro/ЦінаЗакуп" }, 400);
  }

  const priceEuro = hasSalePrice ? Number(salePriceValue) : undefined;
  const costPriceEuro = hasCostPrice ? Number(costPriceValue) : undefined;

  if (priceEuro !== undefined && (!Number.isFinite(priceEuro) || priceEuro < 0)) {
    return json({ ok: false, error: "priceEuro must be a non-negative number" }, 400);
  }
  if (costPriceEuro !== undefined && (!Number.isFinite(costPriceEuro) || costPriceEuro < 0)) {
    return json({ ok: false, error: "costPriceEuro must be a non-negative number" }, 400);
  }

  const oneCBody: Record<string, unknown> = { Код: code };
  // In the 1C price directory the catalog number is stored in "Наименование".
  // The edit service reads this helper key and uses it for the price-row lookup.
  if (article) oneCBody["артикул_ціни"] = article;
  if (priceEuro !== undefined) oneCBody["ЦінаПрод"] = priceEuro;
  if (costPriceEuro !== undefined) oneCBody["ЦінаЗакуп"] = costPriceEuro;

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

  clearAllOneCCache();
  try {
    revalidateTag("product-page-data", "max");
    if (article) revalidatePath(`/product/${encodeURIComponent(article)}`, "page");
    if (code !== article) revalidatePath(`/product/${encodeURIComponent(code)}`, "page");
  } catch {
    // Revalidation can throw in non-request contexts.
  }

  const hasUpdatedPrice =
    (typeof priceEuro === "number" && Number.isFinite(priceEuro) && priceEuro > 0) ||
    (typeof costPriceEuro === "number" && Number.isFinite(costPriceEuro) && costPriceEuro > 0);

  return json({
    ok: true,
    code,
    Код: code,
    ...(article ? { article } : {}),
    endpoint: ONEC_PRICE_ADMIN_ENDPOINT,
    updatedBy: adminEmail,
    ...(priceEuro !== undefined ? { priceEuro, "ЦінаПрод": priceEuro } : {}),
    ...(costPriceEuro !== undefined ? { costPriceEuro, "ЦінаЗакуп": costPriceEuro } : {}),
    hasPrice: hasUpdatedPrice,
    "ЕстьЦена": hasUpdatedPrice,
  });
}
