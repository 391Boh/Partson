"use client";

import { Send } from "lucide-react";

import { pushAnalyticsEvent } from "app/lib/gtm";
import { buildTelegramBotLink, type TelegramSource } from "app/lib/telegram-deeplink";

// "Open the bot" button with the entry source in the link (the bot counts it)
// and a GA4 telegram_open event (a micro-conversion for Google Ads).
export default function TelegramBotCta({
  source = "landing",
  placement,
  label = "Відкрити бота в Telegram",
  variant = "primary",
}: {
  source?: TelegramSource;
  placement: string;
  label?: string;
  variant?: "primary" | "light";
}) {
  return (
    <a
      href={buildTelegramBotLink(source)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => pushAnalyticsEvent("telegram_open", { placement, telegram_source: source })}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-base font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        variant === "primary"
          ? "bg-sky-500 text-white shadow-[0_12px_28px_-12px_rgb(14_165_233/70%)] hover:bg-sky-600 focus-visible:outline-sky-600"
          : "border border-white/30 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white"
      }`}
    >
      <Send size={18} aria-hidden="true" />
      {label}
    </a>
  );
}
