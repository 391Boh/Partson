import { NextRequest, NextResponse } from "next/server";

import { deductOrderStock } from "app/api/_lib/order-stock";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// Takes only an order id: the items and quantities are read from the stored
// order, and an order deducts once (see order-stock.ts). The old body of raw
// {code, quantity} items let any caller write sales to 1C, and the shared
// secret meant to stop that had to ship to the browser to work at all.
export async function POST(req: NextRequest) {
  const rl = checkRateLimit({ req, key: "orders:deduct-stock", limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    const res = json({ error: "Too many requests" }, 429);
    setRateLimitHeaders(res.headers, rl);
    return res;
  }

  let body: { orderId?: unknown };
  try {
    body = (await req.json()) as { orderId?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || orderId.length > 128 || orderId.includes("/")) {
    return json({ error: "orderId is required" }, 400);
  }

  const result = await deductOrderStock(orderId).catch((error) => {
    console.error(`Order ${orderId} stock deduction failed:`, error);
    return null;
  });
  if (!result) return json({ error: "Stock deduction failed" }, 502);
  if (result.status === "not_found") return json({ error: "Order not found" }, 404);
  if (result.status === "not_payable") return json({ error: "Order is not confirmed yet" }, 409);
  if (result.status === "empty") return json({ ok: true, items: [] });
  if (result.status === "cancelled") return json({ ok: true, cancelled: true, items: [] });

  return json({
    ok: true,
    status: result.status,
    items: result.items.map(({ code, stockAfter }) => ({ code, stockAfter })),
  });
}
