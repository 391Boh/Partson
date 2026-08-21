import "server-only";

import { escapeTelegramHtml } from "app/lib/telegram-order-message";

// Single source of truth for the shop's real contact details — mirrors the
// same values already shown in app/components/footer.tsx and the
// LocalBusiness JSON-LD in app/layout.tsx, just reused here for the bot's
// /contacts card instead of being retyped.
const SHOP_PHONE_DISPLAY = "+38 (063) 421-18-51";
const SHOP_EMAIL = "romaniukbboogg@gmail.com";
const SHOP_ADDRESS_LINE = "вул. Перфецького, 8";
const SHOP_CITY_LINE = "Львів, Україна";

const SHOP_LAT = Number(process.env.NEXT_PUBLIC_STORE_LAT) || 49.8140387;
const SHOP_LNG = Number(process.env.NEXT_PUBLIC_STORE_LNG) || 23.9892492;

const GBP_URL = process.env.NEXT_PUBLIC_GBP_URL?.trim();
export const buildShopMapsUrl = () =>
  GBP_URL || `https://www.google.com/maps/search/?api=1&query=${SHOP_LAT},${SHOP_LNG}`;

export const getShopCoordinates = () => ({ lat: SHOP_LAT, lng: SHOP_LNG });

// Same Mon–Sat 08:00–18:00 / Sun 08:00–16:00 schedule the footer's own
// "Відкрито"/"Закрито" badge uses — computed in the shop's real timezone
// (not the server's) so it stays correct regardless of where this runs.
export const isShopOpenNow = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const h = hour + minute / 60;

  return weekday === "Sun" ? h >= 8 && h < 16 : h >= 8 && h < 18;
};

export const buildContactsCard = (siteUrl: string) => {
  const open = isShopOpenNow();
  const statusBadge = open ? "🟢 Зараз відкрито" : "🔴 Зараз зачинено";

  const text = [
    "<b>📍 Контакти PartsON</b>",
    "",
    `🏪 ${escapeTelegramHtml(SHOP_ADDRESS_LINE)}, ${escapeTelegramHtml(SHOP_CITY_LINE)}`,
    "",
    `🕐 Пн–Сб: 08:00–18:00 · Нд: 08:00–16:00`,
    statusBadge,
    "",
    `📞 ${SHOP_PHONE_DISPLAY}`,
    `✉️ ${SHOP_EMAIL}`,
  ].join("\n");

  // Telegram's inline button `url` field only accepts http(s)/tg:// links —
  // a tel: scheme gets the whole sendMessage call rejected — so the phone
  // stays as plain visible text above (Telegram auto-links phone-shaped text
  // to tap-to-call on its own) instead of a button here.
  //
  // The site button uses web_app (opens inside Telegram's own browser
  // instead of switching away) when siteUrl is https — Telegram rejects a
  // non-https web_app url outright, so this falls back to a plain link in
  // local/dev environments.
  const siteButton = siteUrl.startsWith("https://")
    ? { text: "🌍 Сайт", web_app: { url: siteUrl } }
    : { text: "🌍 Сайт", url: siteUrl };

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🗺 Маршрут на карті", url: buildShopMapsUrl() },
      ],
      [
        { text: "💬 Написати менеджеру", callback_data: "support:start" },
        siteButton,
      ],
      [{ text: "⬅️ Каталог", callback_data: "m" }],
    ],
  };

  return { text, keyboard };
};
