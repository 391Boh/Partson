import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { clearCatalogPageRouteCache } from "app/lib/catalog-page-route-cache";
import { invalidateFullCatalogSnapshot } from "app/lib/catalog-server";

export const runtime = "nodejs";

// Endpoint in the 1C HTTP-service that handles price reads and updates.
// Must match the endpoint name registered in the 1C configuration.
const ONEC_PRICE_ADMIN_ENDPOINT =
  (
    process.env.ONEC_PRODUCT_UPDATE_ENDPOINT ||
    process.env.ONEC_PRICE_ADMIN_ENDPOINT ||
    "edit"
  ).trim();

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

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

  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const adminEmail = admin.email;

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
  // Promo price (1C Ціна.Акція), EUR. 0 removes the promo.
  const promoPriceValue =
    value.promoPriceEuro !== undefined && value.promoPriceEuro !== null
      ? value.promoPriceEuro
      : value["Акція"];
  const hasSalePrice = salePriceValue !== undefined && salePriceValue !== null;
  const hasCostPrice = costPriceValue !== undefined && costPriceValue !== null;
  const hasPromoPrice = promoPriceValue !== undefined && promoPriceValue !== null;

  if (!hasSalePrice && !hasCostPrice && !hasPromoPrice) {
    return json({ ok: false, error: "Provide priceEuro/ЦінаПрод, costPriceEuro/ЦінаЗакуп and/or promoPriceEuro/Акція" }, 400);
  }

  const priceEuro = hasSalePrice ? Number(salePriceValue) : undefined;
  const costPriceEuro = hasCostPrice ? Number(costPriceValue) : undefined;
  const promoPriceEuro = hasPromoPrice ? Number(promoPriceValue) : undefined;

  if (priceEuro !== undefined && (!Number.isFinite(priceEuro) || priceEuro < 0)) {
    return json({ ok: false, error: "priceEuro must be a non-negative number" }, 400);
  }
  if (costPriceEuro !== undefined && (!Number.isFinite(costPriceEuro) || costPriceEuro < 0)) {
    return json({ ok: false, error: "costPriceEuro must be a non-negative number" }, 400);
  }
  if (promoPriceEuro !== undefined && (!Number.isFinite(promoPriceEuro) || promoPriceEuro < 0)) {
    return json({ ok: false, error: "promoPriceEuro must be a non-negative number (0 removes the promo)" }, 400);
  }

  const oneCBody: Record<string, unknown> = { Код: code };
  // In the 1C price directory the catalog number is stored in "Наименование".
  // The edit service reads this helper key and uses it for the price-row lookup.
  if (article) oneCBody["артикул_ціни"] = article;
  if (priceEuro !== undefined) oneCBody["ЦінаПрод"] = priceEuro;
  if (costPriceEuro !== undefined) oneCBody["ЦінаЗакуп"] = costPriceEuro;
  if (promoPriceEuro !== undefined) oneCBody["Акція"] = promoPriceEuro;

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

  let parsed: {
    success?: boolean;
    found?: boolean;
    updated?: boolean;
    message?: string;
    error_message?: string;
    // edit's price write; the top-level success only means "request handled".
    price_result?: { success?: boolean; message?: string; ЦінаПрод?: number; ЦінаЗакуп?: number; Акція?: number };
  } = {};
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch {
    // non-JSON — treat as success if HTTP 2xx
  }

  if (parsed.success === false || parsed.found === false) {
    return json({
      ok: false,
      error:
        parsed.message ||
        parsed.error_message ||
        (parsed.found === false ? "Товар не знайдено в 1С" : "1C повернула помилку"),
    }, 422);
  }
  if (parsed.price_result?.success === false) {
    return json({ ok: false, error: parsed.price_result.message || "1С не записала ціну" }, 422);
  }
  // An older 1C edit ignores Акція without saying so; only a stored value it
  // echoes back proves the promo was written.
  const confirmedPromoPriceEuro =
    typeof parsed.price_result?.Акція === "number" ? parsed.price_result.Акція : undefined;
  if (promoPriceEuro !== undefined && confirmedPromoPriceEuro === undefined) {
    return json({ ok: false, error: "1С не підтвердила акційну ціну (потрібне оновлення модуля ОбщегоНазначения)" }, 502);
  }

  clearAllOneCCache();
  clearCatalogPageRouteCache();
  // Promo badges and partner promo prices are read from the full snapshot.
  invalidateFullCatalogSnapshot();
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
    ...(confirmedPromoPriceEuro !== undefined
      ? { promoPriceEuro: confirmedPromoPriceEuro, "Акція": confirmedPromoPriceEuro }
      : {}),
    hasPrice: hasUpdatedPrice,
    "ЕстьЦена": hasUpdatedPrice,
  });
}
