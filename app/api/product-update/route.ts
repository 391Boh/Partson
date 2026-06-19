import { NextRequest, NextResponse } from "next/server";

import { clearOneCCacheForProduct, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";
import { clearProductImageCacheForProduct } from "app/lib/product-image";

export const runtime = "nodejs";

const ONEC_PRODUCT_UPDATE_ENDPOINT =
  (process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").trim();

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
const DATA_URI_REGEX =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/\r\n=]+)$/i;

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
    return email && ADMIN_EMAILS.has(email) ? email : null;
  } catch {
    return null;
  }
};

const readCode = (value: Record<string, unknown>) =>
  typeof value.code === "string" && value.code.trim()
    ? value.code.trim()
    : typeof value["Код"] === "string"
      ? value["Код"].trim()
      : "";

const readNonNegativeNumber = (
  value: Record<string, unknown>,
  localKey: string,
  oneCKey: string
) => {
  const raw =
    value[localKey] !== undefined && value[localKey] !== null
      ? value[localKey]
      : value[oneCKey];
  if (raw === undefined || raw === null || raw === "") return undefined;

  const numberValue = Number(raw);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return numberValue;
};

const readImage = (value: Record<string, unknown>, code: string) => {
  const imageDataUrl =
    typeof value.imageDataUrl === "string" ? value.imageDataUrl.trim() : "";
  const imageBase64 =
    typeof value.image_base64 === "string" ? value.image_base64.trim() : "";
  const match = imageDataUrl ? DATA_URI_REGEX.exec(imageDataUrl) : null;

  if (imageDataUrl && !match) {
    return { ok: false as const, error: "imageDataUrl must be a valid data URI (jpeg/png/webp/gif)" };
  }

  const base64 = (match?.[2] ?? imageBase64).replace(/[\r\n\s]/g, "");
  if (!base64) return { ok: true as const, imageBase64: "", fileName: "" };

  const mimeType = match?.[1].toLowerCase() ?? "";
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "jpg";
  const fileName =
    typeof value.file_name === "string" && value.file_name.trim()
      ? value.file_name.trim()
      : typeof value.imageName === "string" && value.imageName.trim()
        ? value.imageName.trim()
        : `${code}.${ext}`;

  return { ok: true as const, imageBase64: base64, fileName };
};

export async function POST(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "product-update",
    limit: 20,
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
  if (!adminEmail) return json({ ok: false, error: "Unauthorized" }, 401);

  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "Payload too large (max ~3 MB)" }, 413);
  }

  let value: Record<string, unknown>;
  try {
    value = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const code = readCode(value);
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "code/Код is required" }, 400);
  }

  const priceEuro = readNonNegativeNumber(value, "priceEuro", "ЦінаПрод");
  if (priceEuro === null) {
    return json({ ok: false, error: "priceEuro/ЦінаПрод must be a non-negative number" }, 400);
  }

  const costPriceEuro = readNonNegativeNumber(value, "costPriceEuro", "ЦінаЗакуп");
  if (costPriceEuro === null) {
    return json({ ok: false, error: "costPriceEuro/ЦінаЗакуп must be a non-negative number" }, 400);
  }

  const image = readImage(value, code);
  if (!image.ok) return json({ ok: false, error: image.error }, 400);

  const productName =
    typeof value["Наименование"] === "string" && value["Наименование"].trim()
      ? value["Наименование"].trim()
      : typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : undefined;

  const catalogNumber =
    typeof value["НомерПоКаталогу"] === "string" && value["НомерПоКаталогу"].trim()
      ? value["НомерПоКаталогу"].trim()
      : typeof value.catalogNumber === "string" && value.catalogNumber.trim()
        ? value.catalogNumber.trim()
        : undefined;

  // article = current catalog number, used as НомерПоКаталогу for 1C product lookup
  const lookupArticle =
    typeof value.article === "string" && value.article.trim()
      ? value.article.trim()
      : "";

  const oneCBody: Record<string, unknown> = { Код: code };
  if (priceEuro !== undefined) oneCBody["ЦінаПрод"] = priceEuro;
  if (costPriceEuro !== undefined) oneCBody["ЦінаЗакуп"] = costPriceEuro;
  if (image.fileName) oneCBody.file_name = image.fileName;
  if (image.imageBase64) oneCBody.image_base64 = image.imageBase64;
  if (productName) oneCBody["Наименование"] = productName;
  // catalogNumber = new value (update); lookupArticle = current value (lookup only)
  const articleForOnec = catalogNumber || lookupArticle;
  if (articleForOnec) oneCBody["НомерПоКаталогу"] = articleForOnec;

  if (Object.keys(oneCBody).length === 1) {
    return json({ ok: false, error: "Provide price, cost price, image, name, or catalog number" }, 400);
  }

  const result = await oneCRequest(ONEC_PRODUCT_UPDATE_ENDPOINT, {
    method: "POST",
    body: oneCBody,
    timeoutMs: 20_000,
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
    Код?: string;
    count?: number;
    items?: unknown[];
    has_more?: boolean;
    next_cursor?: string;
    product_result?: { success?: boolean; message?: string; Наименование?: string; НомерПоКаталогу?: string };
    price_result?: { success?: boolean; message?: string; ЦінаПрод?: number | null; ЦінаЗакуп?: number | null; Артикул?: string };
    photo_result?: { success?: boolean; message?: string; file_name?: string };
  } = {};
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch {
    // Non-JSON 2xx response from 1C is treated as success.
  }

  if (parsed.success === false || parsed.found === false) {
    return json(
      {
        ok: false,
        error: parsed.message || (parsed.found === false ? "Товар не знайдено в 1С" : "1C повернула помилку"),
      },
      422
    );
  }

  // 1C returned a catalog-search response instead of an update response:
  // { success: true, count: 0, items: [], has_more: false } — product was not found/updated.
  const isCatalogFormatResponse =
    Array.isArray(parsed.items) &&
    parsed.count !== undefined &&
    parsed.price_result === undefined &&
    parsed.photo_result === undefined;

  if (isCatalogFormatResponse && parsed.count === 0) {
    return json(
      {
        ok: false,
        error: `Товар не знайдено в 1С (endpoint: ${ONEC_PRODUCT_UPDATE_ENDPOINT}). Перевірте правильність endpoint або НомерПоКаталогу.`,
        oneCResponse: "catalog-format-count-0",
        endpoint: ONEC_PRODUCT_UPDATE_ENDPOINT,
      },
      422
    );
  }

  // Partial failure — any sub-result explicitly failed on 1C side
  const productOk = !parsed.product_result || parsed.product_result.success !== false;
  const priceOk = !parsed.price_result || parsed.price_result.success !== false;
  const photoOk = !parsed.photo_result || parsed.photo_result.success !== false;
  if (!productOk || !priceOk || !photoOk) {
    const errors: string[] = [];
    if (!productOk) errors.push(parsed.product_result?.message || "Помилка оновлення реквізитів");
    if (!priceOk) errors.push(parsed.price_result?.message || "Помилка оновлення ціни");
    if (!photoOk) errors.push(parsed.photo_result?.message || "Помилка оновлення фото");
    return json({ ok: false, error: errors.join("; ") }, 422);
  }

  clearOneCCacheForProduct(code);
  clearProductImageCacheForProduct(code);

  const article = typeof value.article === "string" ? value.article.trim() : "";
  const productCode = typeof value.productCode === "string" ? value.productCode.trim() : "";
  if (article) {
    clearOneCCacheForProduct(article);
    clearProductImageCacheForProduct(article);
  }
  if (productCode) {
    clearOneCCacheForProduct(productCode);
    clearProductImageCacheForProduct(productCode);
  }

  // Prefer confirmed values from 1C results, fall back to sent values
  const confirmedPriceEuro =
    typeof parsed.price_result?.ЦінаПрод === "number" ? parsed.price_result.ЦінаПрод : priceEuro;
  const confirmedCostPriceEuro =
    typeof parsed.price_result?.ЦінаЗакуп === "number" ? parsed.price_result.ЦінаЗакуп : costPriceEuro;
  const confirmedName = parsed.product_result?.Наименование ?? productName;
  const confirmedCatalogNumber = parsed.product_result?.НомерПоКаталогу ?? catalogNumber;

  const hasUpdatedPrice =
    (typeof confirmedPriceEuro === "number" && Number.isFinite(confirmedPriceEuro) && confirmedPriceEuro > 0) ||
    (typeof confirmedCostPriceEuro === "number" && Number.isFinite(confirmedCostPriceEuro) && confirmedCostPriceEuro > 0);

  return json({
    ok: true,
    code,
    Код: code,
    updatedBy: adminEmail,
    ...(confirmedPriceEuro !== undefined ? { priceEuro: confirmedPriceEuro, "ЦінаПрод": confirmedPriceEuro } : {}),
    ...(confirmedCostPriceEuro !== undefined ? { costPriceEuro: confirmedCostPriceEuro, "ЦінаЗакуп": confirmedCostPriceEuro } : {}),
    ...((confirmedPriceEuro !== undefined || confirmedCostPriceEuro !== undefined)
      ? { hasPrice: hasUpdatedPrice, "ЕстьЦена": hasUpdatedPrice }
      : {}),
    ...(confirmedName ? { name: confirmedName } : {}),
    ...(confirmedCatalogNumber ? { catalogNumber: confirmedCatalogNumber } : {}),
    ...(image.fileName ? { fileName: image.fileName } : {}),
  });
}
