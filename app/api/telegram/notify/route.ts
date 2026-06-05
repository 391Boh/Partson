import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "../../_lib/rateLimit";
import { readJsonObject } from "../../_lib/requestValidation";
import { sendTelegramNotification } from "app/lib/telegram-notify";

type NotificationType = "order" | "message" | "call";

const readString = (source: Record<string, unknown>, key: string, max = 500) => {
  const value = source[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

const readNumber = (source: Record<string, unknown>, key: string) => {
  const value = source[key];
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatMoney = (value: number | null) =>
  value === null
    ? "не вказано"
    : new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: "UAH",
        maximumFractionDigits: 0,
      }).format(value);

const readItems = (source: Record<string, unknown>) => {
  const raw = source.items;
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const name = readString(record, "name", 120) || "Товар";
      const article = readString(record, "article", 80);
      const code = readString(record, "code", 80);
      const quantity = readNumber(record, "quantity");
      const price = readNumber(record, "price");
      const id = article || code;
      return `- ${name}${id ? ` (${id})` : ""} x${quantity ?? 1}${
        price !== null ? `, ${formatMoney(price)}` : ""
      }`;
    })
    .filter(Boolean);
};

const buildOrderMessage = (body: Record<string, unknown>) => {
  const items = readItems(body);
  const orderId = readString(body, "orderId", 80) || readString(body, "firestoreId", 80);
  const subtotalAmount = readNumber(body, "subtotalAmount");
  const discountAmount = readNumber(body, "discountAmount");
  const discountCode = readString(body, "discountCode", 80);
  const deliveryParts = [
    readString(body, "deliveryMethod", 80),
    readString(body, "city", 120),
    readString(body, "warehouse", 180) || readString(body, "lvivStreet", 180),
  ].filter(Boolean);

  return [
    "Нове замовлення PartsON",
    orderId ? `Номер: ${orderId}` : "",
    `Клієнт: ${readString(body, "name", 120) || "не вказано"}`,
    `Телефон: ${readString(body, "phone", 80) || "не вказано"}`,
    subtotalAmount !== null && discountAmount !== null && discountAmount > 0
      ? `Сума товарів: ${formatMoney(subtotalAmount)}`
      : "",
    discountAmount !== null && discountAmount > 0
      ? `Знижка${discountCode ? ` (${discountCode})` : ""}: -${formatMoney(discountAmount)}`
      : "",
    `Сума: ${formatMoney(readNumber(body, "totalAmount"))}`,
    `Оплата: ${readString(body, "paymentMethod", 80) || "не вказано"}`,
    deliveryParts.length ? `Доставка: ${deliveryParts.join(", ")}` : "",
    items.length ? `Товари:\n${items.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildCallMessage = (body: Record<string, unknown>) =>
  [
    "Нова заявка на дзвінок PartsON",
    `Клієнт: ${readString(body, "name", 120) || "не вказано"}`,
    `Телефон: ${readString(body, "phone", 80) || "не вказано"}`,
    readString(body, "topic", 120) ? `Тема: ${readString(body, "topic", 120)}` : "",
    readString(body, "car", 200) ? `Авто/VIN: ${readString(body, "car", 200)}` : "",
    readString(body, "message", 800)
      ? `Коментар: ${readString(body, "message", 800)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

const buildChatMessage = (body: Record<string, unknown>) => {
  const messageType = readString(body, "messageType", 40);
  const text = readString(body, "text", 1200);

  return [
    "Нове повідомлення в чаті PartsON",
    `Користувач: ${readString(body, "userId", 120) || "невідомий"}`,
    `Тип: ${messageType === "image" ? "фото" : "текст"}`,
    text ? `Повідомлення: ${text}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildNotificationText = (body: Record<string, unknown>) => {
  const type = readString(body, "type", 40) as NotificationType;

  if (type === "order") return buildOrderMessage(body);
  if (type === "call") return buildCallMessage(body);
  if (type === "message") return buildChatMessage(body);

  return "";
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "telegram:notify",
    limit: 40,
    windowMs: 60_000,
  });

  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 24_000 });
  if (!bodyResult.ok) {
    const badBody = NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
    setRateLimitHeaders(badBody.headers, rateResult);
    return badBody;
  }

  const text = buildNotificationText(bodyResult.value);
  if (!text) {
    const invalid = NextResponse.json(
      { error: "Invalid notification payload" },
      { status: 400 }
    );
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const result = await sendTelegramNotification(text);
  if (!result.ok) {
    const failed = NextResponse.json(
      { error: result.error || "Failed to send Telegram notification" },
      { status: 502 }
    );
    setRateLimitHeaders(failed.headers, rateResult);
    return failed;
  }

  const response = NextResponse.json({
    success: true,
    skipped: result.skipped === true,
  });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
