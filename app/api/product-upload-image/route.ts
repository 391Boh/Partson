import { NextRequest, NextResponse } from "next/server";

import { clearOneCCacheForProduct, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";
import { clearProductImageCacheForProduct } from "app/lib/product-image";

export const runtime = "nodejs";

// images endpoint handles both GET (no image_base64) and upload (with image_base64)
const ONEC_UPLOAD_IMAGE_ENDPOINT =
  (process.env.ONEC_UPLOAD_IMAGE_ENDPOINT || "images").trim();

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

  const code = typeof parsed.code === "string" ? parsed.code.trim() : "";
  if (!isNonEmptyString(code, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "code is required" }, 400);
  }

  const imageDataUrl = typeof parsed.imageDataUrl === "string" ? parsed.imageDataUrl.trim() : "";
  if (!imageDataUrl) {
    return json({ ok: false, error: "imageDataUrl is required (data:image/...;base64,...)" }, 400);
  }

  const match = DATA_URI_REGEX.exec(imageDataUrl);
  if (!match) {
    return json(
      { ok: false, error: "imageDataUrl must be a valid data URI (jpeg/png/webp/gif)" },
      400
    );
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2].replace(/[\r\n\s]/g, "");

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "jpg";
  const fileName =
    typeof parsed.imageName === "string" && parsed.imageName.trim()
      ? parsed.imageName.trim()
      : `${code}.${ext}`;

  // 1C images endpoint: { code, file_name, image_base64 }
  // Passes the pure base64 string (without data URI prefix)
  const oneCBody = {
    code,
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

  let oneCResult: { success?: boolean; found?: boolean; message?: string } = {};
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

  clearOneCCacheForProduct(code);
  clearProductImageCacheForProduct(code);

  return json({
    ok: true,
    code,
    fileName,
    endpoint: ONEC_UPLOAD_IMAGE_ENDPOINT,
    uploadedBy: adminEmail,
  });
}
