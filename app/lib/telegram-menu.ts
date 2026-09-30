export const buildBotHomeKeyboard = (siteUrl: string) => ({
  inline_keyboard: [
    [{ text: "🔎 Знайти деталь", callback_data: "home:find" }, { text: "📂 Каталог", callback_data: "m" }],
    [{ text: "🛒 Кошик", callback_data: "cart" }, { text: "📦 Мої замовлення", callback_data: "home:orders" }],
    [{ text: "👤 Мій профіль", callback_data: "home:profile" }, { text: "💬 Менеджер", callback_data: "support:start" }],
    [{ text: "📍 Контакти", callback_data: "contacts" }, { text: "ℹ️ Допомога", callback_data: "home:help" }],
    [siteUrl.startsWith("https://")
      ? { text: "🌐 Відкрити сайт", web_app: { url: `${siteUrl}/katalog` } }
      : { text: "🌐 Відкрити сайт", url: `${siteUrl}/katalog` }],
  ],
});

export const BOT_HOME_TEXT = [
  "<b>PartsON · Автозапчастини</b>",
  "Львів • доставка по Україні",
  "",
  "<b>Що шукаємо для вашого авто?</b>",
  "Надішліть назву або артикул деталі — або оберіть дію нижче.",
  "",
  "<i>/menu — головне меню · /cancel — завершити поточний діалог</i>",
].join("\n");

export const parseBotCommand = (text: string) => {
  const match = /^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), bot: match[2] || "", args: (match[3] || "").trim() } : null;
};
