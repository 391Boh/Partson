import "server-only";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramMessage, sendTelegramPhoto } from "app/lib/telegram-bot";
import { escapeTelegramHtml, formatOrderMoney } from "app/lib/telegram-order-message";
import { getSiteUrl } from "app/lib/site-url";

export type ChatNotifyProduct = {
  name?: string;
  code?: string;
  article?: string;
  producer?: string;
  quantity?: number;
  price?: number;
  link?: string;
};

export type ChatNotifyPayload =
  | { type: "text"; text: string }
  | { type: "image"; text?: string; imageUrl: string }
  | { type: "product"; text?: string; product: ChatNotifyProduct };

const buildProductText = (product: ChatNotifyProduct) => {
  const siteUrl = getSiteUrl();
  const lines = [
    `<b>${escapeTelegramHtml(product.name || product.article || product.code || "Товар")}</b>`,
    product.producer ? escapeTelegramHtml(product.producer) : "",
    product.article || product.code
      ? `Артикул: ${escapeTelegramHtml(product.article || product.code || "")}`
      : "",
    typeof product.quantity === "number"
      ? product.quantity > 0
        ? `✅ В наявності (${product.quantity} шт.)`
        : "🕓 Під замовлення"
      : "",
    typeof product.price === "number" ? `Ціна: <b>${formatOrderMoney(product.price)}</b>` : "",
    product.link ? `${siteUrl}${product.link}` : "",
  ];
  return lines.filter(Boolean).join("\n");
};

// Relays a manager's reply from AdminChatPanel.tsx into Telegram — the
// counterpart of createChatMessageServer's customer→shop direction. Mirrors
// app/api/orders/notify-status/route.ts's contract: silent no-op whenever
// the account isn't linked, never throws for the caller to worry about.
export const notifyTelegramChatMessage = async (
  userId: string,
  payload: ChatNotifyPayload
): Promise<{ ok: boolean; skipped?: boolean }> => {
  try {
    const userSnap = await getFirebaseAdminDb().collection("users").doc(userId).get();
    const chatId = userSnap.exists ? (userSnap.data()?.telegramChatId as string | undefined) : undefined;
    if (!chatId) return { ok: true, skipped: true };

    const header = "<b>💬 Повідомлення від менеджера PartsON</b>";

    if (payload.type === "image") {
      const caption = [header, "", payload.text ? escapeTelegramHtml(payload.text) : ""]
        .filter(Boolean)
        .join("\n");
      const photoResult = await sendTelegramPhoto(chatId, payload.imageUrl, caption, {
        parseMode: "HTML",
      });
      if (photoResult.ok) return { ok: true };
      // Fall through to a text-only message if Telegram couldn't fetch the image.
    }

    const body =
      payload.type === "product"
        ? buildProductText(payload.product)
        : escapeTelegramHtml(payload.text || "");
    const result = await sendTelegramMessage(chatId, `${header}\n\n${body}`, { parseMode: "HTML" });
    if (!result.ok) return { ok: true, skipped: true };
    return { ok: true };
  } catch (error) {
    console.error("Telegram chat-message relay failed:", error);
    return { ok: true, skipped: true };
  }
};
