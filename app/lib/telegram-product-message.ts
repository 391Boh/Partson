import "server-only";

import type { CatalogProduct } from "app/lib/catalog-server";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { buildProductSeoImagePath } from "app/lib/product-image-path";
import { escapeTelegramHtml, formatOrderMoney } from "app/lib/telegram-order-message";
import { sendTelegramMessage, sendTelegramPhoto } from "app/lib/telegram-bot";
import { toPriceUah } from "app/lib/catalog-server";

// Same in-stock/on-order language the catalog product card
// (app/components/ProductCard.tsx) already uses, so a result found through
// the bot reads exactly like it does on the site.
export const formatAvailability = (quantity: number) =>
  quantity > 0 ? `✅ В наявності (${quantity} шт.)` : "🕓 Під замовлення";

export const buildProductUrl = (siteUrl: string, product: CatalogProduct) =>
  `${siteUrl}${buildProductPath({
    code: product.code,
    article: product.article,
    name: product.name,
    producer: product.producer,
    group: product.group,
    subGroup: product.subGroup,
    category: product.category,
  })}`;

export const buildProductImageUrl = (siteUrl: string, product: CatalogProduct) =>
  `${siteUrl}${buildProductSeoImagePath(product.code, product.article)}`;

export const formatProductCaption = (
  product: CatalogProduct,
  priceUah: number | null
) => {
  const name = escapeTelegramHtml(buildVisibleProductName(product.name));
  const price =
    priceUah != null ? formatOrderMoney(priceUah) : "ціна за запитом";
  // <code> makes the article tap-to-copy in Telegram — genuinely useful when
  // a customer wants to paste it into /find, send it to the manager, or look
  // it up elsewhere, not just decoration.
  const article = `<code>${escapeTelegramHtml(product.article || product.code)}</code>`;

  return [
    `<b>${name}</b>`,
    product.producer && product.producer !== "-"
      ? `<i>${escapeTelegramHtml(product.producer)}</i>`
      : "",
    `Артикул: ${article} · ${formatAvailability(product.quantity)}`,
    `\nЦіна: <b>${price}</b>`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildProductKeyboard = (siteUrl: string, product: CatalogProduct) => ({
  inline_keyboard: [
    [{ text: "🛒 Замовити на сайті", url: buildProductUrl(siteUrl, product) }],
    ...(product.quantity <= 0 && product.code
      ? [[{ text: "🔔 Повідомити, коли з'явиться", callback_data: `watch:${product.code}` }]]
      : []),
  ],
});

// Shared by /find and the catalog-navigation "🛒 Показати товари" buttons —
// same try-photo/fall-back-to-text send loop, just fed a different result set.
export const sendProductResults = async (
  chatId: string,
  products: CatalogProduct[],
  euroRate: number | null,
  siteUrl: string
) => {
  for (const product of products) {
    const priceUah = euroRate != null ? toPriceUah(product.priceEuro ?? null, euroRate) : null;
    const caption = formatProductCaption(product, priceUah);
    const keyboard = buildProductKeyboard(siteUrl, product);

    if (product.hasPhoto !== false) {
      const photoResult = await sendTelegramPhoto(
        chatId,
        buildProductImageUrl(siteUrl, product),
        caption,
        { parseMode: "HTML", replyMarkup: keyboard }
      );
      if (photoResult.ok) continue;
      // Telegram couldn't fetch/decode this particular image (e.g. a stale
      // catalog entry) — fall through to a text-only card instead of
      // silently dropping the result.
    }

    await sendTelegramMessage(chatId, caption, { parseMode: "HTML", replyMarkup: keyboard });
  }
};
