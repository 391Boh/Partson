import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// 1C endpoint name — getinfo handles both GET (no Описание) and SET (with Описание)
const ONEC_SET_DESCRIPTION_ENDPOINT =
  (process.env.ONEC_SET_DESCRIPTION_ENDPOINT || "getinfo").trim();

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
    key: "product-update-description",
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

  const body = await readJsonObject(request, { maxBytes: 12_000 });
  if (!body.ok) {
    return json({ ok: false, error: body.error }, body.status);
  }

  const { value } = body;

  // article = НомерПоКаталогу (catalog number), required by getinfo endpoint
  // Falls back to code for backwards compatibility
  const article =
    typeof value.article === "string" && value.article.trim()
      ? value.article.trim()
      : typeof value.code === "string"
        ? value.code.trim()
        : "";
  const code =
    typeof value.code === "string" && value.code.trim()
      ? value.code.trim()
      : typeof value["Код"] === "string" && value["Код"].trim()
        ? value["Код"].trim()
        : "";

  if (!isNonEmptyString(article, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "article (НомерПоКаталогу) is required" }, 400);
  }

  if (typeof value.description !== "string") {
    return json({ ok: false, error: "description must be a string" }, 400);
  }
  const description = value.description.trim();

  if (description.length > 10_000) {
    return json({ ok: false, error: "description is too long (max 10 000 chars)" }, 400);
  }

  const oneCBody: Record<string, string> = {
    НомерПоКаталогу: article,
    Описание: description,
  };

  const result = await oneCRequest(ONEC_SET_DESCRIPTION_ENDPOINT, {
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
    // non-JSON response from 1C — treat as success if HTTP 2xx
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
    revalidatePath(`/product/${encodeURIComponent(article)}`, "page");
    if (code && code !== article) revalidatePath(`/product/${encodeURIComponent(code)}`, "page");
  } catch {
    // Revalidation can throw in non-request contexts.
  }

  return json({
    ok: true,
    article,
    endpoint: ONEC_SET_DESCRIPTION_ENDPOINT,
    clearedBy: adminEmail,
  });
}
