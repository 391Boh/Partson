import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import { kyivDayStartMs, loadOrdersInRange } from "app/lib/admin-orders-query";
import {
  analyticsDaysBetween, matchesOrderAnalysis, PAYMENT_GROUP_LABEL, shiftAnalyticsDay,
  summarizeOrderValues, toAnalysisRow, validAnalyticsDay,
  type OrderAnalysisSelection, type PaymentGroup,
} from "app/lib/admin-order-analytics";
import { getOrderStatus, isOrderStatus, type OrderStatus } from "app/lib/order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ORDERS = 5000;
const PAGE_SIZE = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) return json({ error: "Доступ заборонено" }, 403);
  const rate = checkRateLimit({ req: request, key: "admin-order-analysis", limit: 60, windowMs: 60_000 });
  if (!rate.ok) return json({ error: "Забагато запитів. Спробуйте за хвилину." }, 429);
  const params = request.nextUrl.searchParams;
  const from = params.get("from"), to = params.get("to");
  if (!validAnalyticsDay(from) || !validAnalyticsDay(to)) return json({ error: "Некоректні дати періоду." }, 400);
  const days = analyticsDaysBetween(from, to);
  if (days < 1 || days > 60) return json({ error: "Оберіть період від 1 до 60 днів." }, 400);
  const status = params.get("status"), payment = params.get("payment");
  const product = params.get("product") || undefined, phone = params.get("phone") || undefined;
  const offset = Number(params.get("offset") || 0);
  if ((status && !isOrderStatus(status)) || (payment && !Object.hasOwn(PAYMENT_GROUP_LABEL, payment)) ||
    (product && product.length > 200) || (phone && (!/^[+\d\s()-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.length > 40)) ||
    !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_ORDERS) return json({ error: "Некоректні фільтри." }, 400);
  const selection: Partial<OrderAnalysisSelection> = { status: status as OrderStatus || undefined, payment: payment as PaymentGroup || undefined, product, phone };
  const previousFrom = shiftAnalyticsDay(from, -days);
  const previousTo = shiftAnalyticsDay(from, -1);
  try {
    const [current, previous] = await Promise.all([
      loadOrdersInRange(kyivDayStartMs(from), kyivDayStartMs(shiftAnalyticsDay(to, 1)), MAX_ORDERS + 1),
      loadOrdersInRange(kyivDayStartMs(previousFrom), kyivDayStartMs(from), MAX_ORDERS + 1),
    ]);
    const orders = current.slice(0, MAX_ORDERS).filter(order => matchesOrderAnalysis(order, selection));
    const earlier = previous.slice(0, MAX_ORDERS).filter(order => matchesOrderAnalysis(order, selection));
    const statusCounts: Partial<Record<OrderStatus, number>> = {};
    for (const order of orders) { const key = getOrderStatus(order); statusCounts[key] = (statusCounts[key] || 0) + 1; }
    return json({
      period: { from, to, days }, previous: { from: previousFrom, to: previousTo, totals: summarizeOrderValues(earlier) },
      totals: summarizeOrderValues(orders), statusCounts, total: orders.length,
      rows: orders.slice(offset, offset + PAGE_SIZE).map(toAnalysisRow), hasMore: orders.length > offset + PAGE_SIZE,
      truncated: current.length > MAX_ORDERS || previous.length > MAX_ORDERS,
    });
  } catch (error) {
    console.error("[admin-order-analysis] failed:", error);
    return json({ error: "Не вдалося завантажити аналіз. Спробуйте ще раз." }, 503);
  }
}
