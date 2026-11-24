import { getOrderStatus, getOrderTotal, type OrderStatus, type OrderStatusFields } from "./order-status";

export type AnalyticsOrder = Record<string, unknown> & OrderStatusFields & { id: string; createdAtMs: number; totalAmount?: unknown; total?: unknown };
export type AnalyticsPeriod = { orders: number; revenue: number; avg: number; cancelled: number };
export type PaymentGroup = "paid" | "pending" | "failed" | "cod";
export const PAYMENT_GROUP_LABEL: Record<PaymentGroup, string> = {
  paid: "Оплачено онлайн", pending: "Очікує оплати", failed: "Помилка оплати", cod: "Інше / при отриманні",
};
export type OrderAnalysisSelection = {
  title: string; from: string; to: string; status?: OrderStatus;
  payment?: PaymentGroup; product?: string; phone?: string;
};
export type AnalysisRow = {
  id: string; name: string; phone: string; total: number; createdAt: number;
  status: OrderStatus; payment: PaymentGroup; items: number; itemNames: string[];
};
export type OrderAnalysisResponse = {
  period: { from: string; to: string; days: number };
  previous: { from: string; to: string; totals: AnalyticsPeriod };
  totals: AnalyticsPeriod & { paidRevenue: number; completed: number; returned: number };
  statusCounts: Partial<Record<OrderStatus, number>>;
  rows: AnalysisRow[]; total: number; hasMore: boolean; truncated: boolean;
};

const KYIV_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" });
export const analyticsDayKey = (ms: number) => KYIV_DAY.format(new Date(ms));
export const shiftAnalyticsDay = (day: string, delta: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
export const validAnalyticsDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
};
export const analyticsDaysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
export const paymentGroup = (value: unknown): PaymentGroup => value === "paid" || value === "pending" || value === "failed" ? value : "cod";
export const customerPhoneKey = (value: unknown) => typeof value === "string" ? value.replace(/\D/g, "").slice(-10) : "";

export function summarizeOrderValues(orders: AnalyticsOrder[]): OrderAnalysisResponse["totals"] {
  let count = 0, revenue = 0, cancelled = 0, paidRevenue = 0, completed = 0, returned = 0;
  for (const order of orders) {
    const status = getOrderStatus(order);
    if (status === "cancelled") { cancelled++; continue; }
    count++;
    const amount = getOrderTotal(order);
    revenue += amount;
    if (order.paymentStatus === "paid") paidRevenue += amount;
    if (status === "completed") completed++;
    if (status === "returned") returned++;
  }
  return { orders: count, revenue: Math.round(revenue), avg: count ? Math.round(revenue / count) : 0,
    cancelled, paidRevenue: Math.round(paidRevenue), completed, returned };
}

export function matchesOrderAnalysis(order: AnalyticsOrder, selection: Partial<OrderAnalysisSelection>) {
  if (selection.status && getOrderStatus(order) !== selection.status) return false;
  // Payment totals in the overview exclude cancelled orders.
  if (selection.payment && (getOrderStatus(order) === "cancelled" || paymentGroup(order.paymentStatus) !== selection.payment)) return false;
  if (selection.phone && customerPhoneKey(order.phone) !== customerPhoneKey(selection.phone)) return false;
  if (selection.product) {
    const items = Array.isArray(order.cartItems) ? order.cartItems as Array<Record<string, unknown>> : [];
    if (!items.some(item => String(item.code || item.article || item.name || "").trim() === selection.product)) return false;
    if (getOrderStatus(order) === "cancelled") return false;
  }
  if (selection.phone && getOrderStatus(order) === "cancelled") return false;
  return true;
}

export const toAnalysisRow = (order: AnalyticsOrder): AnalysisRow => {
  const items = Array.isArray(order.cartItems) ? order.cartItems as Array<Record<string, unknown>> : [];
  return {
    id: order.id, name: typeof order.name === "string" ? order.name : "", phone: typeof order.phone === "string" ? order.phone : "",
    total: getOrderTotal(order), createdAt: order.createdAtMs, status: getOrderStatus(order), payment: paymentGroup(order.paymentStatus),
    items: items.length, itemNames: items.slice(0, 3).map(item => String(item.name || item.article || item.code || "Товар")),
  };
};
