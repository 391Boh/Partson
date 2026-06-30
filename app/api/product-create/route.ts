import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

export const runtime = "nodejs";

const ONEC_CREATE_ENDPOINT =
  (process.env.ONEC_PRODUCT_CREATE_ENDPOINT || "createproduct").trim();

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
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

export async function POST(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "product-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Too many requests" }),
      { status: 429, headers }
    );
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

  // Required: Наименование
  const name =
    typeof value["Наименование"] === "string" && value["Наименование"].trim()
      ? value["Наименование"].trim()
      : typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : "";

  if (!isNonEmptyString(name, { minLength: 1, maxLength: 500 })) {
    return json({ ok: false, error: "name / Наименование is required" }, 400);
  }

  const article =
    typeof value["НомерПоКаталогу"] === "string" && value["НомерПоКаталогу"].trim()
      ? value["НомерПоКаталогу"].trim()
      : typeof value.article === "string" && value.article.trim()
        ? value.article.trim()
        : "";

  const producer =
    typeof value["ПроизводительНаименование"] === "string" && value["ПроизводительНаименование"].trim()
      ? value["ПроизводительНаименование"].trim()
      : typeof value.producer === "string" && value.producer.trim()
        ? value.producer.trim()
        : "";

  const group =
    typeof value.group === "string" ? value.group.trim()
      : typeof value["Группа"] === "string" ? value["Группа"].trim()
        : "";

  const subGroup =
    typeof value.subGroup === "string" ? value.subGroup.trim()
      : typeof value["Подгруппа"] === "string" ? value["Подгруппа"].trim()
        : "";

  const category =
    typeof value.category === "string" ? value.category.trim()
      : typeof value["Категория"] === "string" ? value["Категория"].trim()
        : "";

  const readPrice = (jsKey: string, onecKey: string): number | undefined => {
    const raw = value[jsKey] !== undefined ? value[jsKey] : value[onecKey];
    if (raw === undefined || raw === null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const priceEuro = readPrice("priceEuro", "ЦінаПрод");
  const costPriceEuro = readPrice("costPriceEuro", "ЦінаЗакуп");

  // Optional image
  const imageDataUrl = typeof value.imageDataUrl === "string" ? value.imageDataUrl.trim() : "";
  const rawBase64 = typeof value.image_base64 === "string" ? value.image_base64.trim() : "";
  const match = imageDataUrl ? DATA_URI_REGEX.exec(imageDataUrl) : null;
  if (imageDataUrl && !match) {
    return json({ ok: false, error: "imageDataUrl must be a valid data URI (jpeg/png/webp/gif)" }, 400);
  }
  const mimeType = match?.[1].toLowerCase() ?? "";
  const base64Data = (match?.[2] ?? rawBase64).replace(/[\r\n\s]/g, "");
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "jpg";
  const fileName =
    base64Data
      ? (typeof value.file_name === "string" && value.file_name.trim()
          ? value.file_name.trim()
          : `${article || name.slice(0, 20).replace(/\s+/g, "_")}.${ext}`)
      : "";

  const oneCBody: Record<string, unknown> = {
    Наименование: name,
  };
  if (article) oneCBody["НомерПоКаталогу"] = article;
  if (producer) oneCBody["ПроизводительНаименование"] = producer;
  if (group) oneCBody["Группа"] = group;
  if (subGroup) oneCBody["Подгруппа"] = subGroup;
  if (category) oneCBody["Категория"] = category;
  if (priceEuro !== undefined) oneCBody["ЦінаПрод"] = priceEuro;
  if (costPriceEuro !== undefined) oneCBody["ЦінаЗакуп"] = costPriceEuro;
  if (fileName) oneCBody.file_name = fileName;
  if (base64Data) oneCBody.image_base64 = base64Data;

  const result = await oneCRequest(ONEC_CREATE_ENDPOINT, {
    method: "POST",
    body: oneCBody,
    timeoutMs: 25_000,
    retries: 0,
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
    Код?: string;
    code?: string;
    message?: string;
    НомерПоКаталогу?: string;
    Наименование?: string;
  } = {};
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch {
    // Non-JSON 2xx treated as success
  }

  if (parsed.success === false) {
    return json({ ok: false, error: parsed.message || "1C повернула помилку при створенні товару" }, 422);
  }

  const newCode = parsed.Код || parsed.code || "";
  const newArticle = parsed.НомерПоКаталогу || article;
  const newName = parsed.Наименование || name;

  clearAllOneCCache();
  try {
    revalidateTag("product-page-data", "max");
    revalidatePath("/product/[code]", "page");
    revalidatePath("/katalog", "page");
  } catch {
    // can throw outside request context
  }

  return json({
    ok: true,
    code: newCode,
    name: newName,
    article: newArticle,
    createdBy: adminEmail,
    endpoint: ONEC_CREATE_ENDPOINT,
  });
}
