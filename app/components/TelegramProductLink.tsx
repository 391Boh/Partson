"use client";

import { Send } from "lucide-react";

import { pushAnalyticsEvent } from "app/lib/gtm";
import { buildTelegramBotLink } from "app/lib/telegram-deeplink";

// Opens this product's card in the Telegram bot (photo, price, "add to
// cart"). Out of stock the bot also offers its back-in-stock alert. Styled as
// a pill next to the reviews link on the product overview, whose height is
// fixed — it must not add a row there.
export default function TelegramProductLink({ code, inStock }: { code: string; inStock: boolean }) {
  if (!code) return null;
  const source = inStock ? "product" : "outofstock";
  return (
    <a
      href={buildTelegramBotLink(source, code)}
      target="_blank"
      rel="noopener noreferrer"
      title={inStock ? "Відкрити товар у Telegram-боті й замовити в чаті" : "Отримати повідомлення в Telegram, коли товар з'явиться"}
      onClick={() => pushAnalyticsEvent("telegram_open", { placement: "product_page", telegram_source: source })}
      className="product-review-button"
    >
      <Send size={14} className="text-sky-600" aria-hidden="true" />
      <span>{inStock ? "Замовити в Telegram" : "Сповістити в Telegram"}</span>
    </a>
  );
}
