// The site as a Telegram Mini App: the full catalog with photos and filters,
// opened inside Telegram (see app/lib/telegram-webapp-bootstrap.ts). Telegram
// accepts web_app buttons only for https URLs; plain links elsewhere.
const shopButton = (siteUrl: string) =>
  siteUrl.startsWith("https://")
    ? { text: "🛍 Магазин у Telegram", web_app: { url: `${siteUrl}/katalog` } }
    : { text: "🛍 Магазин на сайті", url: `${siteUrl}/katalog` };

export const buildBotHomeKeyboard = (siteUrl: string, cartCount = 0) => ({
  inline_keyboard: [
    [shopButton(siteUrl)],
    [{ text: "🔎 Підібрати деталь", callback_data: "f:start" }],
    [{ text: "📂 Каталог", callback_data: "m" }, { text: "🆕 Новинки", callback_data: "f:new" }],
    [{ text: "🔥 Акції", callback_data: "f:promo" }, { text: cartCount > 0 ? `🛒 Кошик · ${cartCount}` : "🛒 Кошик", callback_data: "cart" }],
    [{ text: "📦 Замовлення", callback_data: "home:orders" }, { text: "⋯ Ще", callback_data: "home:more" }],
  ],
});

export const buildBotMoreKeyboard = (siteUrl: string) => ({
  inline_keyboard: [
    [{ text: "👤 Профіль", callback_data: "home:profile" }, { text: "💬 Менеджер", callback_data: "support:start" }],
    // Same https Viber link as the site footer (viber:// is not allowed in buttons).
    [{ text: "📍 Контакти", callback_data: "contacts" }, { text: "💜 Viber", url: "https://viber.me/380634211851" }],
    [siteUrl.startsWith("https://")
      ? { text: "🌐 Сайт", web_app: { url: `${siteUrl}/katalog` } }
      : { text: "🌐 Сайт", url: `${siteUrl}/katalog` },
    { text: "ℹ️ Допомога", callback_data: "home:help" }],
    [{ text: "⬅️ Назад", callback_data: "home:back" }],
  ],
});

export const BOT_HOME_TEXT = [
  "🔧 <b>PartsON</b> · автозапчастини у Львові",
  "",
  "🔎 <b>Підбір</b> — за авто, категорією й виробником",
  "🆕 <b>Новинки</b> і 🔥 <b>акції</b> — свіжі надходження та знижки",
  "🚚 Нова Пошта по Україні · самовивіз у Львові",
  "",
  "✍️ Або просто напишіть назву чи артикул деталі.",
].join("\n");

export const parseBotCommand = (text: string) => {
  const match = /^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), bot: match[2] || "", args: (match[3] || "").trim() } : null;
};

// Persistent quick buttons under the message field. Their texts arrive as
// ordinary messages, so the bot treats them like commands (QUICK_ACTIONS).
export const QUICK_ACTIONS = {
  "🔎 Підбір": "find",
  "🆕 Новинки": "new",
  "🔥 Акції": "promo",
  "🛒 Кошик": "cart",
  "🏠 Меню": "menu",
} as const;

export type QuickAction = (typeof QUICK_ACTIONS)[keyof typeof QUICK_ACTIONS];

export const readQuickAction = (text: string): QuickAction | null =>
  (QUICK_ACTIONS as Record<string, QuickAction>)[text.trim()] ?? null;

export const buildQuickReplyKeyboard = () => ({
  keyboard: [
    [{ text: "🔎 Підбір" }, { text: "🆕 Новинки" }, { text: "🔥 Акції" }],
    [{ text: "🛒 Кошик" }, { text: "🏠 Меню" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Назва або артикул деталі…",
});
