// Order workflow shared by the admin panel (client) and the admin order
// routes (server). Older orders only carry the legacy booleans
// (read/shipped/completed/cancelled), so the effective status is always
// derived through getOrderStatus() and every status write keeps those
// booleans in sync for code that still reads them (customer order history,
// Telegram notifications, notification counters).

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "awaiting_payment",
  "packing",
  "shipped",
  "arrived",
  "completed",
  "returned",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Statuses an admin can pick by hand. "cancelled" goes through the existing
// /api/orders/cancel route (stock return), "arrived" is set by the Nova Poshta
// sync, so neither is offered here.
export const MANUAL_ORDER_STATUSES: OrderStatus[] = [
  "new",
  "confirmed",
  "awaiting_payment",
  "packing",
  "shipped",
  "completed",
  "returned",
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Нове",
  confirmed: "Підтверджено",
  awaiting_payment: "Очікує оплати",
  packing: "Комплектується",
  shipped: "Відправлено",
  arrived: "У відділенні",
  completed: "Виконано",
  returned: "Повернення",
  cancelled: "Скасовано",
};

// Tailwind classes for the status chip on the dark admin panel; kept here so
// every list renders the same colors.
export const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  new: "bg-sky-500/20 text-sky-200",
  confirmed: "bg-indigo-500/20 text-indigo-200",
  awaiting_payment: "bg-amber-500/20 text-amber-200",
  packing: "bg-violet-500/20 text-violet-200",
  shipped: "bg-blue-500/20 text-blue-200",
  arrived: "bg-teal-500/20 text-teal-200",
  completed: "bg-emerald-500/20 text-emerald-200",
  returned: "bg-orange-500/20 text-orange-200",
  cancelled: "bg-rose-500/20 text-rose-200",
};

export type OrderStatusFields = {
  status?: unknown;
  read?: unknown;
  shipped?: unknown;
  completed?: unknown;
  cancelled?: unknown;
};

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);

export const getOrderStatus = (order: OrderStatusFields): OrderStatus => {
  if (order.cancelled) return "cancelled";
  if (isOrderStatus(order.status)) {
    // A legacy "completed" flag written by an older panel wins over a stale
    // explicit status.
    if (order.completed && order.status !== "returned") return "completed";
    return order.status;
  }
  if (order.completed) return "completed";
  if (order.shipped) return "shipped";
  return "new";
};

// Legacy booleans implied by a status.
export const legacyFlagsForStatus = (status: OrderStatus) => ({
  read: true,
  shipped: status === "shipped" || status === "arrived" || status === "completed" || status === "returned",
  completed: status === "completed",
});

// Final states: nothing more for a manager to do.
export const isClosedOrderStatus = (status: OrderStatus) =>
  status === "completed" || status === "cancelled" || status === "returned";

export type OrderHistoryEntry = {
  status?: OrderStatus;
  note?: string;
  byName?: string;
  byUid?: string;
  source?: "admin" | "novaposhta";
  at: number;
};

export const ORDER_NOTE_MAX_LENGTH = 1000;

// Firestore Timestamp | Date | millis | ISO string → millis (0 when unknown).
export const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const candidate = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof candidate.toMillis === "function") return candidate.toMillis();
  if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
  if (typeof candidate._seconds === "number") return candidate._seconds * 1000;
  return 0;
};

export const getOrderTotal = (order: { totalAmount?: unknown; total?: unknown }) => {
  const value = Number(order.totalAmount ?? order.total ?? 0);
  return Number.isFinite(value) ? value : 0;
};
