import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString } from "app/api/_lib/requestValidation";
import { clearCatalogImageResultCacheForProduct } from "app/lib/catalog-image-result-cache";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";
import { clearProductImageCacheForProduct } from "app/lib/product-image";
import { clearRouteImageCacheForProduct } from "app/lib/product-image-route-cache";

export const runtime = "nodejs";

// images endpoint handles both GET (no image_base64) and upload (with image_base64)
const ONEC_UPLOAD_IMAGE_ENDPOINT =
  (
    process.env.ONEC_PRODUCT_UPDATE_ENDPOINT ||
    process.env.ONEC_UPLOAD_IMAGE_ENDPOINT ||
    "edit"
  ).trim();

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

// ~3 MB limit: base64 overhead ≈ 4/3 × raw, so 3 MB base64 ≈ ~2.25 MB image
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
    key: "product-upload-image",
    limit: 10,
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

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const code =
    typeof parsed.code === "string" && parsed.code.trim()
      ? parsed.code.trim()
      : typeof parsed["Код"] === "string"
        ? parsed["Код"].trim()
        : "";
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "code/Код is required" }, 400);
  }

  const imageDataUrl = typeof parsed.imageDataUrl === "string" ? parsed.imageDataUrl.trim() : "";
  const rawImageBase64 =
    typeof parsed.image_base64 === "string" ? parsed.image_base64.trim() : "";
  const match = imageDataUrl ? DATA_URI_REGEX.exec(imageDataUrl) : null;
  if (imageDataUrl && !match) {
    return json(
      { ok: false, error: "imageDataUrl must be a valid data URI (jpeg/png/webp/gif)" },
      400
    );
  }

  const mimeType = match?.[1].toLowerCase() ?? "";
  const base64Data = (match?.[2] ?? rawImageBase64).replace(/[\r\n\s]/g, "");
  if (!base64Data) {
    return json({ ok: false, error: "imageDataUrl or image_base64 is required" }, 400);
  }

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "jpg";
  const fileName =
    typeof parsed.file_name === "string" && parsed.file_name.trim()
      ? parsed.file_name.trim()
      : typeof parsed.imageName === "string" && parsed.imageName.trim()
      ? parsed.imageName.trim()
      : `${code}.${ext || "png"}`;

  // 1C images endpoint: { Код, file_name, image_base64 }
  // Passes the pure base64 string (without data URI prefix)
  const oneCBody = {
    Код: code,
    file_name: fileName,
    image_base64: base64Data,
  };

  const result = await oneCRequest(ONEC_UPLOAD_IMAGE_ENDPOINT, {
    method: "POST",
    body: oneCBody,
    timeoutMs: 15_000,
    retries: 0,
    cacheTtlMs: 0,
  });

  if (result.status < 200 || result.status >= 300) {
    let oneCError: string | undefined;
    try {
      const p = JSON.parse(result.text) as { error?: string; message?: string };
      oneCError = p?.error ?? p?.message;
    } catch {
      oneCError = result.text?.slice(0, 200) || undefined;
    }
    return json({ ok: false, error: "1C returned an error", details: oneCError, status: result.status }, 502);
  }

  let oneCResult: {
    success?: boolean;
    found?: boolean;
    message?: string;
    photo_result?: { success?: boolean; message?: string };
  } = {};
  try {
    oneCResult = JSON.parse(result.text) as typeof oneCResult;
  } catch {
    // non-JSON — treat as success if HTTP 2xx
  }

  if (oneCResult.success === false) {
    return json({
      ok: false,
      error: oneCResult.message || "1C повернула помилку при завантаженні фото",
    }, 422);
  }

  // When image goes through the combined "edit" endpoint, photo result is nested
  const photoResult = oneCResult.photo_result;
  if (photoResult && photoResult.success === false) {
    return json({
      ok: false,
      error: photoResult.message || "1C повернула помилку при завантаженні фото",
    }, 422);
  }

  const article = typeof parsed.article === "string" ? parsed.article.trim() : "";
  clearAllOneCCache();
  clearProductImageCacheForProduct(code);
  clearCatalogImageResultCacheForProduct(code, article || undefined);
  // See product-update/route.ts for why this is needed separately from
  // clearCatalogImageResultCacheForProduct above.
  clearRouteImageCacheForProduct(code, article || undefined);
  if (article) clearProductImageCacheForProduct(article);
  try {
    revalidateTag("product-page-data", "max");
    if (article) revalidatePath(`/product/${encodeURIComponent(article)}`, "page");
    if (code !== article) revalidatePath(`/product/${encodeURIComponent(code)}`, "page");
    revalidatePath("/katalog", "page");
  } catch {
    // can throw outside of a request context
  }

  return json({
    ok: true,
    code,
    fileName,
    endpoint: ONEC_UPLOAD_IMAGE_ENDPOINT,
    uploadedBy: adminEmail,
  });
}
