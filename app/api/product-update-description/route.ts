import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { clearCatalogPageRouteCache } from "app/lib/catalog-page-route-cache";
import {
  fetchExactCatalogProductByLookup,
  invalidateFullCatalogSnapshot,
  patchFullCatalogSnapshotProduct,
} from "app/lib/catalog-server";
import { setProductEditOverride } from "app/lib/product-edit-overrides";

export const runtime = "nodejs";

// 1C endpoint name — getinfo handles both GET (no Описание) and SET (with Описание)
const ONEC_SET_DESCRIPTION_ENDPOINT =
  (process.env.ONEC_SET_DESCRIPTION_ENDPOINT || "getinfo").trim();

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

  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const adminEmail = admin.email;

  const body = await readJsonObject(request, { maxBytes: 12_000 });
  if (!body.ok) {
    return json({ ok: false, error: body.error }, body.status);
  }

  const { value } = body;

  const code =
    typeof value.code === "string" && value.code.trim()
      ? value.code.trim()
      : typeof value["Код"] === "string" && value["Код"].trim()
        ? value["Код"].trim()
        : "";

  if (typeof value.description !== "string") {
    return json({ ok: false, error: "description must be a string" }, 400);
  }
  const description = value.description.trim();

  if (description.length > 10_000) {
    return json({ ok: false, error: "description is too long (max 10 000 chars)" }, 400);
  }

  // The 1C description endpoint locates the product by НомерПоКаталогу only.
  // The internal Код is never a valid stand-in for it (sending it there is
  // what produced "Номенклатура не найдена"), but it can be used to read the
  // product's current НомерПоКаталогу from 1C — read-only — when the caller
  // has none or 1C doesn't recognise the one it sent (e.g. renamed in 1C
  // since the page loaded).
  const resolveCatalogNumberByCode = async () => {
    if (!code) return "";
    const product = await fetchExactCatalogProductByLookup(code, {
      cacheTtlMs: 0,
      retries: 0,
      timeoutMs: 8_000,
      lookupFields: ["Код"],
    }).catch(() => null);
    return product && product.code.trim().toLowerCase() === code.toLowerCase()
      ? product.article.trim()
      : "";
  };

  let article =
    typeof value.article === "string" && value.article.trim() ? value.article.trim() : "";
  // A page can still hold an old article after another editor renamed it.
  // Resolve before writing: the old article may now belong to another item.
  const currentArticle = await resolveCatalogNumberByCode();
  if (code && !currentArticle) {
    return json({ ok: false, error: "Не вдалося перевірити актуальний артикул товару в 1С. Опис не змінено; оновіть товар і повторіть збереження." }, 503);
  }
  if (currentArticle) article = currentArticle;

  if (!isNonEmptyString(article, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "У товару немає номера по каталогу (НомерПоКаталогу) — опис зберегти неможливо" }, 400);
  }

  type OneCDescriptionReply = {
    success?: boolean;
    found?: boolean;
    updated?: boolean;
    message?: string;
    error_message?: string;
    error?: string;
  };

  const sendDescription = async (catalogNumber: string) => {
    const result = await oneCRequest(ONEC_SET_DESCRIPTION_ENDPOINT, {
      method: "POST",
      body: { НомерПоКаталогу: catalogNumber, Описание: description },
      retries: 1,
      retryDelayMs: 300,
      cacheTtlMs: 0,
    });
    let parsed: OneCDescriptionReply = {};
    let replyText = "";
    try {
      const payload: unknown = JSON.parse(result.text);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        parsed = payload as OneCDescriptionReply;
      } else if (typeof payload === "string") {
        parsed = { message: payload };
      }
    } catch {
      replyText = result.text;
    }
    const ok = result.status >= 200 && result.status < 300;
    const message = parsed.error_message || parsed.error || parsed.message || replyText;
    const notFound =
      parsed.found === false || /не\s+найден|не\s+знайден|not\s+found/i.test(message);
    return { result, parsed, ok, message, notFound };
  };

  let attempt = await sendDescription(article);
  if (attempt.notFound) {
    const resolved = await resolveCatalogNumberByCode();
    if (resolved && resolved !== article) {
      article = resolved;
      attempt = await sendDescription(article);
    }
  }

  const { result, parsed } = attempt;
  if (!attempt.ok) {
    let oneCError: string | undefined = attempt.message || undefined;
    if (!oneCError) oneCError = result.text?.slice(0, 200) || undefined;
    return json({ ok: false, error: "1C returned an error", details: oneCError, status: result.status }, 502);
  }

  if (parsed.success === false || parsed.updated === false || parsed.error || parsed.error_message || attempt.notFound) {
    return json({
      ok: false,
      error:
        attempt.message ||
        (parsed.found === false ? `Товар з номером по каталогу «${article}» не знайдено в 1С` : "1C повернула помилку"),
    }, 422);
  }

  clearAllOneCCache();
  clearCatalogPageRouteCache();
  // The product page reads its initial description from the cached product
  // data / full-catalog snapshot, which still hold the old text: without
  // these the reload after saving rendered the previous description first
  // and only the client's live re-check swapped it. Same approach (and the
  // same immediate expiry) as /api/product-update.
  invalidateFullCatalogSnapshot();
  if (code) {
    setProductEditOverride(code, { description });
    patchFullCatalogSnapshotProduct(code, { description });
  }
  try {
    revalidateTag("product-page-data", { expire: 0 });
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
