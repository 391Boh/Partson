import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { oneCRequest, clearAllOneCCache } from "app/api/_lib/oneC";
import { sendTelegramNotification } from "app/lib/telegram-notify";
import { formatOrderMoney } from "app/lib/telegram-order-message";
import type { CartItem } from "app/lib/telegram-cart";

export type DeliveryMethod = "Нова Пошта" | "Самовивіз" | "Доставка у Львові";

export type NovaPoshtaEntry = { Description: string; Ref: string };

// Same allow-listed proxy the site's own DeliveryMethod.tsx calls
// (app/api/novaposhta/route.ts) — reused as-is rather than talking to the
// real Nova Poshta API directly, so there's exactly one place holding
// NP_API_KEY and its request-shape allow-list.
const callNovaPoshta = async (
  siteUrl: string,
  calledMethod: "getCities" | "getWarehouses",
  methodProperties: Record<string, unknown>
): Promise<NovaPoshtaEntry[]> => {
  try {
    const res = await fetch(`${siteUrl}/api/novaposhta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelName: "Address", calledMethod, methodProperties }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
    return Array.isArray(json?.data) ? (json.data as NovaPoshtaEntry[]) : [];
  } catch {
    return [];
  }
};

export const searchNovaPoshtaCities = (siteUrl: string, query: string) =>
  callNovaPoshta(siteUrl, "getCities", { FindByString: query, Limit: 8 });

export const getNovaPoshtaWarehouses = (siteUrl: string, cityRef: string, query?: string) =>
  callNovaPoshta(siteUrl, "getWarehouses", {
    CityRef: cityRef,
    Limit: 8,
    ...(query ? { FindByString: query } : {}),
  });

// Exact port of app/components/zamovl.tsx's addBusinessDays/estimateDeliveryDate
// (NP=4 business days, Lviv delivery=2, pickup=1) so a bot order's estimate
// matches what the site itself would have shown for the same delivery method.
const addBusinessDays = (start: Date, businessDays: number) => {
  const result = new Date(start);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
};

const formatDateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const estimateDeliveryDate = (deliveryMethod: DeliveryMethod) => {
  const businessDays =
    deliveryMethod === "Нова Пошта" ? 4 : deliveryMethod === "Доставка у Львові" ? 2 : 1;
  return formatDateOnly(addBusinessDays(new Date(), businessDays));
};

// Mirrors /api/telegram/notify's buildOrderMessage formatting — that
// function isn't exported, so this is a small equivalent. Called directly
// (sendTelegramNotification is already a plain importable lib function)
// instead of an internal HTTP round-trip through that route.
const buildOrderNotifyText = (order: {
  orderId: string;
  name: string;
  phone: string;
  deliveryMethod: string;
  paymentMethod: string;
  city: string;
  warehouse: string;
  lvivStreet: string;
  totalAmount: number;
  cartItems: CartItem[];
}) => {
  const deliveryParts = [order.deliveryMethod, order.city, order.warehouse || order.lvivStreet].filter(
    Boolean
  );
  const items = order.cartItems
    .slice(0, 8)
    .map((item) => `- ${item.name} (${item.article || item.code}) x${item.quantity}, ${formatOrderMoney(item.price)}`);

  return [
    "🛒 Нове замовлення PartsON (з Telegram-бота)",
    `Номер: ${order.orderId}`,
    `Клієнт: ${order.name}`,
    `Телефон: ${order.phone}`,
    `Сума: ${formatOrderMoney(order.totalAmount)}`,
    "Оплата: Готівка (при отриманні)",
    deliveryParts.length ? `Доставка: ${deliveryParts.join(", ")}` : "",
    items.length ? `\nТовари:\n${items.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

// Same 1C call app/api/orders/deduct-stock/route.ts makes, per item —
// deliberately omits `article`: 1C's ОбновитьТовар treats its presence as
// a catalog-number change request and throws on a quantity-only update.
const deductStock = async (cartItems: CartItem[]) => {
  const endpoint = (process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "ОбновитьТовар").trim();
  await Promise.allSettled(
    cartItems.map((item) =>
      oneCRequest(endpoint, {
        method: "POST",
        body: { Код: item.code, Реалізація: item.quantity },
        timeoutMs: 15_000,
        retries: 1,
        retryDelayMs: 300,
        cacheTtlMs: 0,
      })
    )
  );
  clearAllOneCCache();
};

export type CheckoutDelivery = {
  method: DeliveryMethod;
  city: string | null;
  cityRef: string | null;
  warehouse: string | null;
  warehouseRef: string | null;
  lvivStreet: string | null;
};

// Cash-on-delivery order creation — the exact single-write shape
// app/components/zamovl.tsx's persistOrder uses for paymentMethod
// "Готівка" (no LiqPay involvement, no pending/complete two-step). Written
// via the Admin SDK since the bot is already server-side, sidestepping the
// client-rules update-after-create quirk the site's own card-payment path
// has to work around. Field names match exactly so the order renders
// correctly through the existing /orders command and admin panel with no
// changes there.
export const createCashOrder = async (input: {
  uid: string;
  name: string;
  phone: string;
  email: string;
  cart: CartItem[];
  delivery: CheckoutDelivery;
}) => {
  const { uid, name, phone, email, cart, delivery } = input;
  const orderId = `${Date.now()}`;
  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const estimatedDeliveryDate = estimateDeliveryDate(delivery.method);

  const order = {
    uid,
    name,
    phone,
    email,
    deliveryMethod: delivery.method,
    paymentMethod: "Готівка",
    city: delivery.city,
    cityRef: delivery.cityRef,
    warehouse: delivery.warehouse,
    warehouseRef: delivery.warehouseRef,
    lvivStreet: delivery.lvivStreet,
    cartItems: cart,
    subtotalAmount: totalAmount,
    discountAmount: 0,
    discountRate: 0,
    discountCode: null,
    discountLabel: null,
    totalAmount,
    orderId,
    deliveryCountry: "UA",
    estimatedDeliveryDate,
    paymentStatus: "cash_on_delivery",
    paymentProvider: "cash",
    liqpayStatus: null,
    liqpayTransactionId: null,
    liqpayPaymentId: null,
    paidAt: null,
    updatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    ga4PurchaseTracked: false,
  };

  await getFirebaseAdminDb().collection("orders").doc(orderId).set(order);

  const notifyText = buildOrderNotifyText({
    orderId,
    name,
    phone,
    deliveryMethod: delivery.method,
    paymentMethod: "Готівка",
    city: delivery.city || "",
    warehouse: delivery.warehouse || "",
    lvivStreet: delivery.lvivStreet || "",
    totalAmount,
    cartItems: cart,
  });
  void sendTelegramNotification(notifyText).catch((error) => {
    console.error("Order shop-notify failed:", error);
  });
  void deductStock(cart).catch((error) => {
    console.error("Order stock deduction failed:", error);
  });

  return { orderId, totalAmount };
};
