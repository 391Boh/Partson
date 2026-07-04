import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";

export const runtime = "nodejs";

const NOTIFY_SECRET = (process.env.NOTIFY_SECRET || "").trim();
const ONEC_PRODUCT_UPDATE_ENDPOINT = (
  process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "ОбновитьТовар"
).trim();

const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function POST(req: NextRequest) {
  if (NOTIFY_SECRET) {
    const incoming = (req.headers.get("x-notify-secret") || "").trim();
    if (!incoming) return json({ error: "Unauthorized" }, 401);
    try {
      const a = Buffer.from(incoming);
      const b = Buffer.from(NOTIFY_SECRET);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return json({ error: "Unauthorized" }, 401);
      }
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const rl = checkRateLimit({ req, key: "orders:deduct-stock", limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    const res = json({ error: "Too many requests" }, 429);
    setRateLimitHeaders(res.headers, rl);
    return res;
  }

  let body: { items?: unknown };
  try {
    body = (await req.json()) as { items?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "items array is required" }, 400);
  }

  type RawItem = { code?: unknown; article?: unknown; quantity?: unknown };
  const items = (body.items as RawItem[])
    .map((item) => ({
      code: typeof item.code === "string" ? item.code.trim() : "",
      article: typeof item.article === "string" ? item.article.trim() : "",
      quantity:
        typeof item.quantity === "number" && item.quantity > 0
          ? Math.floor(item.quantity)
          : 0,
    }))
    .filter((item) => item.code && item.quantity > 0);

  if (items.length === 0) {
    return json({ error: "No valid items to deduct" }, 400);
  }

  const results = await Promise.allSettled(
    items.map((item) => {
      const oneCBody: Record<string, unknown> = {
        Код: item.code,
        Реалізація: item.quantity,
      };
      if (item.article) oneCBody["article"] = item.article;

      return oneCRequest(ONEC_PRODUCT_UPDATE_ENDPOINT, {
        method: "POST",
        body: oneCBody,
        timeoutMs: 15_000,
        retries: 1,
        retryDelayMs: 300,
        cacheTtlMs: 0,
      });
    })
  );

  clearAllOneCCache();

  const succeeded = results.filter(
    (r) => r.status === "fulfilled" && r.value.status >= 200 && r.value.status < 300
  ).length;

  return json({ ok: true, total: items.length, succeeded });
}
