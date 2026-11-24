import "server-only";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramMessage, sendTelegramPhoto } from "app/lib/telegram-bot";
import {
  formatOrderBlock,
  getOrderPrimaryImageUrl,
  type OrderFields,
} from "app/lib/telegram-order-message";
import { getSiteUrl } from "app/lib/site-url";

// Customer-facing Telegram text per status. Statuses without a label are not
// announced (internal steps like "packing").
export const ORDER_STATUS_TELEGRAM_LABEL: Record<string, string> = {
  confirmed: "👍 Ваше замовлення підтверджено",
  shipped: "🚚 Ваше замовлення відправлено",
  arrived: "📦 Ваше замовлення прибуло у відділення Нової Пошти",
  completed: "✅ Ваше замовлення виконано",
};

// Best effort: most accounts have no linked Telegram chat, which is a silent
// no-op. Never throws.
export const notifyOrderStatusTelegram = async (
  orderId: string,
  status: string
): Promise<{ sent: boolean; error?: string }> => {
  const label = ORDER_STATUS_TELEGRAM_LABEL[status];
  if (!label) return { sent: false };
  try {
    const db = getFirebaseAdminDb();
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) return { sent: false };

    const order = orderSnap.data() as OrderFields & { uid?: string };
    const uid = typeof order.uid === "string" ? order.uid : "";
    if (!uid) return { sent: false };

    const userSnap = await db.collection("users").doc(uid).get();
    const chatId = userSnap.exists ? (userSnap.data()?.telegramChatId as string | undefined) : undefined;
    if (!chatId) return { sent: false };

    const siteUrl = getSiteUrl();
    const text = `<b>${label}</b>\n\n${formatOrderBlock(orderId, order, siteUrl)}`;
    const imageUrl = getOrderPrimaryImageUrl(order, siteUrl);

    const result = imageUrl
      ? await sendTelegramPhoto(chatId, imageUrl, text, { parseMode: "HTML" })
      : { ok: false as const };
    if (result.ok) return { sent: true };
    const fallback = await sendTelegramMessage(chatId, text, { parseMode: "HTML" });
    return fallback.ok ? { sent: true } : { sent: false, error: fallback.error };
  } catch (error) {
    console.error("Order status Telegram notification failed:", error);
    return { sent: false };
  }
};
