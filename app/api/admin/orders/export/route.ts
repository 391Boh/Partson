import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import { isDayKey, kyivDayKey, kyivDayStartMs, loadOrdersInRange } from "app/lib/admin-orders-query";
import { getOrderStatus, getOrderTotal, ORDER_STATUS_LABEL } from "app/lib/order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 400;

const KYIV_DATETIME = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// Excel with a Ukrainian locale opens ";"-separated UTF-8 with a BOM
// directly, without the import wizard.
const cell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const PAYMENT_LABEL: Record<string, string> = {
  paid: "Оплачено",
  pending: "Очікує",
  failed: "Помилка",
  cash_on_delivery: "Накладений платіж",
};

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (Kyiv days, inclusive) → CSV
export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "Доступ заборонено" }, { status: 403 });
  }
  const rate = checkRateLimit({ req: request, key: "admin-orders-export", limit: 10, windowMs: 60_000 });
  if (!rate.ok) return NextResponse.json({ ok: false, error: "Забагато запитів" }, { status: 429 });

  const params = request.nextUrl.searchParams;
  const today = kyivDayKey(Date.now());
  const from = isDayKey(params.get("from")) ? params.get("from")! : kyivDayKey(Date.now() - 29 * DAY_MS);
  const to = isDayKey(params.get("to")) ? params.get("to")! : today;
  const fromMs = kyivDayStartMs(from);
  const toMs = kyivDayStartMs(to) + DAY_MS + 3_600_000; // covers DST-length days
  if (toMs <= fromMs || toMs - fromMs > MAX_RANGE_DAYS * DAY_MS) {
    return NextResponse.json({ ok: false, error: "Некоректний період" }, { status: 400 });
  }

  try {
    const orders = (await loadOrdersInRange(fromMs, toMs, 20_000)).filter(
      (order) => kyivDayKey(order.createdAtMs) <= to
    );
    const header = [
      "Номер", "Дата", "Статус", "Клієнт", "Телефон", "Email", "Доставка", "Місто", "Відділення / адреса",
      "ТТН", "Статус НП", "Оплата", "Статус оплати", "Сума, грн", "Кількість позицій", "Товари", "Коментар менеджера",
    ];
    const rows = orders.map((order) => {
      const items = Array.isArray(order.cartItems) ? (order.cartItems as Array<Record<string, unknown>>) : [];
      const itemsText = items
        .map((item) => `${item.article || item.code || ""} ${item.name || ""} × ${item.quantity ?? 1} @ ${item.price ?? ""}`.trim())
        .join(" | ");
      return [
        order.id,
        order.createdAtMs ? KYIV_DATETIME.format(new Date(order.createdAtMs)) : "",
        ORDER_STATUS_LABEL[getOrderStatus(order)],
        order.name,
        order.phone,
        order.email,
        order.deliveryMethod,
        order.city,
        order.warehouse || order.lvivStreet,
        order.trackingNumber,
        order.npStatus,
        order.paymentMethod,
        PAYMENT_LABEL[String(order.paymentStatus ?? "")] ?? order.paymentStatus,
        getOrderTotal(order).toFixed(2).replace(".", ","),
        items.length,
        itemsText,
        order.lastNote,
      ].map(cell).join(";");
    });
    const csv = `﻿${header.map(cell).join(";")}\r\n${rows.join("\r\n")}\r\n`;
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="partson-orders-${from}_${to}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin-orders-export] failed:", error);
    return NextResponse.json({ ok: false, error: "Не вдалося сформувати файл" }, { status: 503 });
  }
}
