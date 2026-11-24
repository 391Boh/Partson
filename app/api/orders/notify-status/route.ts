import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { notifyOrderStatusTelegram, ORDER_STATUS_TELEGRAM_LABEL } from "app/lib/order-status-notify";

export const runtime = "nodejs";

// Telegram half of an order-status change. The admin status route
// (app/api/admin/orders/status) now notifies by itself; this stays for older
// clients. Most accounts have no linked Telegram chat — a silent no-op, never
// an error, since this must never block or fail the admin's action.
const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function POST(req: NextRequest) {
  const rl = checkRateLimit({ req, key: "orders-notify-status", limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return new NextResponse(JSON.stringify({ ok: false, error: "Too many requests" }), {
      status: 429,
      headers,
    });
  }

  const admin = await verifyAdminRequest(req);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  const bodyResult = await readJsonObject(req, { maxBytes: 2048 });
  if (!bodyResult.ok) return json({ ok: false, error: bodyResult.error }, bodyResult.status);

  const orderId =
    typeof bodyResult.value.orderId === "string" ? bodyResult.value.orderId.trim() : "";
  const status =
    typeof bodyResult.value.status === "string" ? bodyResult.value.status.trim() : "";
  if (!isNonEmptyString(orderId, { minLength: 1, maxLength: 200 }) || !ORDER_STATUS_TELEGRAM_LABEL[status]) {
    return json({ ok: false, error: "orderId and a valid status are required" }, 400);
  }

  const result = await notifyOrderStatusTelegram(orderId, status);
  return json(result.sent ? { ok: true } : { ok: true, skipped: true, ...(result.error ? { error: result.error } : {}) });
}
