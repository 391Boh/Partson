import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import { kyivDayKey, kyivDayStartMs, loadOrdersInRange } from "app/lib/admin-orders-query";
import { shiftAnalyticsDay, summarizeOrderValues } from "app/lib/admin-order-analytics";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  getOrderStatus,
  getOrderTotal,
  isClosedOrderStatus,
  toMillis,
  type OrderStatus,
} from "app/lib/order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 60;
const SERIES_DAYS = 30;
const UNREAD_ALERT_MS = 30 * 60_000;
const NOT_SHIPPED_ALERT_MS = 24 * 3_600_000;
const ARRIVED_ALERT_MS = 3 * DAY_MS;
const SHIPPED_ALERT_MS = 7 * DAY_MS;
const ALERT_LIMIT = 40;

type Alert = {
  id: string;
  name: string;
  phone: string;
  total: number;
  createdAt: number;
  status: OrderStatus;
  reason: "unread" | "not_shipped" | "arrived_waiting" | "shipped_long";
  sinceMs: number;
};

const digits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "").slice(-10) : "");

const summarize = summarizeOrderValues;

let cached: { value: unknown; expires: number } | null = null;

const buildSummary = async () => {
  const now = Date.now();
  const todayKey = kyivDayKey(now);
  const loaded = await loadOrdersInRange(kyivDayStartMs(shiftAnalyticsDay(todayKey, 1 - WINDOW_DAYS)), now + 60_000, 5001);
  const orders = loaded.slice(0, 5000);
  const todayStart = kyivDayStartMs(todayKey);
  const inLast = (days: number) => orders.filter((o) => o.createdAtMs >= kyivDayStartMs(shiftAnalyticsDay(todayKey, 1 - days)));

  // Daily series (Kyiv days), oldest first.
  const series: Array<{ day: string; orders: number; revenue: number }> = [];
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const order of orders) {
    if (getOrderStatus(order) === "cancelled") continue;
    const key = kyivDayKey(order.createdAtMs);
    const entry = byDay.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += getOrderTotal(order);
    byDay.set(key, entry);
  }
  for (let i = SERIES_DAYS - 1; i >= 0; i -= 1) {
    const key = shiftAnalyticsDay(todayKey, -i);
    const entry = byDay.get(key) ?? { orders: 0, revenue: 0 };
    series.push({ day: key, orders: entry.orders, revenue: Math.round(entry.revenue) });
  }

  // Status breakdown of open orders + attention list.
  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  const alerts: Alert[] = [];
  for (const order of orders) {
    const status = getOrderStatus(order);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (isClosedOrderStatus(status)) continue;
    const base = {
      id: order.id,
      name: typeof order.name === "string" ? order.name : "",
      phone: typeof order.phone === "string" ? order.phone : "",
      total: getOrderTotal(order),
      createdAt: order.createdAtMs,
      status,
    };
    const age = now - order.createdAtMs;
    if (order.read !== true && age > UNREAD_ALERT_MS) {
      alerts.push({ ...base, reason: "unread", sinceMs: order.createdAtMs });
    } else if (["new", "confirmed", "awaiting_payment", "packing"].includes(status) && age > NOT_SHIPPED_ALERT_MS) {
      alerts.push({ ...base, reason: "not_shipped", sinceMs: order.createdAtMs });
    } else if (status === "arrived") {
      const since = toMillis(order.npArrivedAt) || toMillis(order.npStatusAt);
      if (since && now - since > ARRIVED_ALERT_MS) alerts.push({ ...base, reason: "arrived_waiting", sinceMs: since });
    } else if (status === "shipped") {
      const since = toMillis(order.statusUpdatedAt) || order.createdAtMs;
      if (now - since > SHIPPED_ALERT_MS) alerts.push({ ...base, reason: "shipped_long", sinceMs: since });
    }
  }
  const reasonRank = { arrived_waiting: 0, unread: 1, not_shipped: 2, shipped_long: 3 } as const;
  alerts.sort((a, b) => reasonRank[a.reason] - reasonRank[b.reason] || a.sinceMs - b.sinceMs);

  // Top products and repeat customers, last 30 days.
  const last30 = inLast(30).filter((o) => getOrderStatus(o) !== "cancelled");
  const products = new Map<string, { code: string; article: string; name: string; qty: number; revenue: number; orders: number }>();
  const customers = new Map<string, { name: string; phone: string; orders: number; revenue: number }>();
  for (const order of last30) {
    const items = Array.isArray(order.cartItems) ? (order.cartItems as Array<Record<string, unknown>>) : [];
    const productsInOrder = new Set<string>();
    for (const item of items) {
      const code = String(item.code ?? "").trim();
      const article = String(item.article ?? "").trim();
      const key = code || article || String(item.name ?? "");
      if (!key) continue;
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const entry = products.get(key) ?? { code, article, name: String(item.name ?? ""), qty: 0, revenue: 0, orders: 0 };
      entry.qty += qty;
      entry.revenue += qty * price;
      if (!productsInOrder.has(key)) entry.orders += 1;
      productsInOrder.add(key);
      products.set(key, entry);
    }
    const phone = digits(order.phone);
    if (phone) {
      const entry = customers.get(phone) ?? {
        name: typeof order.name === "string" ? order.name : "",
        phone: typeof order.phone === "string" ? order.phone : "",
        orders: 0,
        revenue: 0,
      };
      entry.orders += 1;
      entry.revenue += getOrderTotal(order);
      customers.set(phone, entry);
    }
  }
  const topProducts = [...products.values()]
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
    .slice(0, 10)
    .map((p) => ({ ...p, revenue: Math.round(p.revenue) }));
  const repeat = [...customers.values()].filter((c) => c.orders > 1);
  const repeatCustomers = repeat
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    .slice(0, 10)
    .map((c) => ({ ...c, revenue: Math.round(c.revenue) }));

  // Payment state of the last 30 days (read-only view of LiqPay results).
  const payments = { paid: 0, pending: 0, failed: 0, cod: 0 };
  for (const order of last30) {
    const value = String(order.paymentStatus ?? "");
    if (value === "paid") payments.paid += 1;
    else if (value === "failed") payments.failed += 1;
    else if (value === "pending") payments.pending += 1;
    else payments.cod += 1;
  }

  // Unprocessed call-back requests.
  const calls = getFirebaseAdminDb().collection("zvyaz");
  const [callsTotal, callsProcessed] = await Promise.all([
    calls.count().get(),
    calls.where("processed", "==", true).count().get(),
  ]);

  return {
    ok: true,
    generatedAt: now,
    periods: {
      today: summarize(orders.filter((o) => o.createdAtMs >= todayStart)),
      week: summarize(inLast(7)),
      month: summarize(inLast(30)),
    },
    previous: {
      today: summarize(orders.filter(o => o.createdAtMs >= kyivDayStartMs(shiftAnalyticsDay(todayKey, -1)) && o.createdAtMs < todayStart)),
      week: summarize(orders.filter(o => o.createdAtMs >= kyivDayStartMs(shiftAnalyticsDay(todayKey, -13)) && o.createdAtMs < kyivDayStartMs(shiftAnalyticsDay(todayKey, -6)))),
      month: summarize(orders.filter(o => o.createdAtMs < kyivDayStartMs(shiftAnalyticsDay(todayKey, -29)))),
    },
    truncated: loaded.length > 5000,
    series,
    statusCounts,
    alerts: alerts.slice(0, ALERT_LIMIT),
    alertsTotal: alerts.length,
    topProducts,
    repeatCustomers,
    repeatCustomersTotal: repeat.length,
    customersTotal: customers.size,
    payments,
    openCalls: Math.max(0, callsTotal.data().count - callsProcessed.data().count),
  };
};

export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ ok: false, error: "Доступ заборонено" }, 403);
  const rate = checkRateLimit({ req: request, key: "admin-orders-summary", limit: 30, windowMs: 60_000 });
  if (!rate.ok) return json({ ok: false, error: "Забагато запитів" }, 429);
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (!refresh && cached && cached.expires > Date.now()) return json(cached.value);
    const value = await buildSummary();
    cached = { value, expires: Date.now() + 20_000 };
    return json(value);
  } catch (error) {
    console.error("[admin-orders-summary] failed:", error);
    return json({ ok: false, error: "Не вдалося зібрати статистику" }, 503);
  }
}
