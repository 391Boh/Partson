export const buildBotHomeKeyboard = (_siteUrl: string, cartCount = 0) => ({
  inline_keyboard: [
    [{ text: "🔎 Підібрати деталь", callback_data: "f:start" }, { text: "📂 Каталог", callback_data: "m" }],
    [{ text: cartCount > 0 ? `🛒 Кошик (${cartCount})` : "🛒 Кошик", callback_data: "cart" }, { text: "⋯ Ще", callback_data: "home:more" }],
  ],
});

export const buildBotMoreKeyboard = (siteUrl: string) => ({
  inline_keyboard: [
    [{ text: "📦 Замовлення", callback_data: "home:orders" }, { text: "👤 Профіль", callback_data: "home:profile" }],
    [{ text: "💬 Менеджер", callback_data: "support:start" }, { text: "📍 Контакти", callback_data: "contacts" }],
    [siteUrl.startsWith("https://")
      ? { text: "🌐 Сайт", web_app: { url: `${siteUrl}/katalog` } }
      : { text: "🌐 Сайт", url: `${siteUrl}/katalog` },
    { text: "ℹ️ Допомога", callback_data: "home:help" }],
    [{ text: "⬅️ Назад", callback_data: "home:back" }],
  ],
});

export const BOT_HOME_TEXT = [
  "<b>PartsON</b> · автозапчастини у Львові",
  "Напишіть назву чи артикул або підберіть деталь за авто й категорією.",
].join("\n");

export const parseBotCommand = (text: string) => {
  const match = /^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), bot: match[2] || "", args: (match[3] || "").trim() } : null;
};
