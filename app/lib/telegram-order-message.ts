import "server-only";

// Mirrors the read/shipped/completed boolean model Order.tsx and
// AdminChatPanel.tsx already use for orders — there is no separate status
// string field, so this derives the same three-state label the site shows.
export type OrderStatusFields = {
  read?: boolean;
  shipped?: boolean;
  completed?: boolean;
};

export type OrderItemFields = {
  name?: string;
  article?: string;
  code?: string;
  price?: number;
  quantity?: number;
};

export type OrderFields = OrderStatusFields & {
  orderId?: string;
  cartItems?: OrderItemFields[];
  totalAmount?: number;
  total?: number;
  createdAt?: { seconds?: number } | Date | string;
};

const MAX_ITEMS_SHOWN = 6;

export const escapeTelegramHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const getOrderStatusLabel = (order: OrderStatusFields) => {
  if (order.completed) return "✅ Виконано";
  if (order.shipped) return "🚚 Відправлено";
  return "🕐 В обробці";
};

export const formatOrderMoney = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: "UAH",
        maximumFractionDigits: 0,
      }).format(value)
    : "не вказано";

const toOrderDate = (createdAt: OrderFields["createdAt"]) => {
  if (!createdAt) return null;
  if (createdAt instanceof Date) return createdAt;
  if (typeof createdAt === "string") {
    const parsed = new Date(createdAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof createdAt.seconds === "number") {
    return new Date(createdAt.seconds * 1000);
  }
  return null;
};

export const formatOrderDate = (createdAt: OrderFields["createdAt"]) => {
  const date = toOrderDate(createdAt);
  if (!date) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatOrderItemsList = (items: OrderItemFields[] | undefined) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return "";

  const lines = list.slice(0, MAX_ITEMS_SHOWN).map((item) => {
    const name = escapeTelegramHtml(item.name || item.article || item.code || "Товар");
    const quantity = item.quantity ?? 1;
    const priceText =
      typeof item.price === "number" ? `, ${formatOrderMoney(item.price)}` : "";
    return `• ${name} x${quantity}${priceText}`;
  });

  const remaining = list.length - lines.length;
  if (remaining > 0) lines.push(`… і ще ${remaining}`);

  return lines.join("\n");
};

// Used both by /orders (a list of these, one per order) and by the
// notify-status route (a single order right after its status changes) —
// keeping the formatting in one place is the actual "sync" between what the
// bot shows and what the site's own order view shows.
export const formatOrderBlock = (docId: string, order: OrderFields) => {
  const number = escapeTelegramHtml(order.orderId || docId);
  const date = formatOrderDate(order.createdAt);
  const status = getOrderStatusLabel(order);
  const total = formatOrderMoney(order.totalAmount ?? order.total);
  const items = formatOrderItemsList(order.cartItems);

  return [
    `<b>Замовлення №${number}</b>${date ? ` від ${date}` : ""}`,
    status,
    items,
    `Сума: <b>${total}</b>`,
  ]
    .filter(Boolean)
    .join("\n");
};
