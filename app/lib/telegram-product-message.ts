import "server-only";

import type { CatalogProduct } from "app/lib/catalog-server";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { buildProductSeoImagePath } from "app/lib/product-image-path";
import { escapeTelegramHtml, formatOrderMoney } from "app/lib/telegram-order-message";

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
    `Артикул: ${article}`,
    formatAvailability(product.quantity),
    `\nЦіна: <b>${price}</b>`,
  ]
    .filter(Boolean)
    .join("\n");
};

// When priceUah is null the product has no known price ("ціна за запитом" in
// the caption) — same signal app/components/ProductCard.tsx uses to swap its
// cart button for "Уточнити ціну". Adding a priceless item to the bot's cart
// would silently price it at 0 UAH, so offer the price-ask flow instead.
export const buildProductKeyboard = (
  siteUrl: string,
  product: CatalogProduct,
  priceUah: number | null
) => ({
  inline_keyboard: [
    ...(product.code && priceUah == null
      ? [[{ text: "🔎 Уточнити ціну", callback_data: `priceask:${product.code}` }]]
      : product.quantity > 0 && product.code
        ? [[{ text: "➕ Додати в кошик", callback_data: `cadd:${product.code}` }]]
        : []),
    [{ text: "🛒 Замовити на сайті", url: buildProductUrl(siteUrl, product) }],
    ...(product.quantity <= 0 && product.code
      ? [[{ text: "🔔 Повідомити, коли з'явиться", callback_data: `watch:${product.code}` }]]
      : []),
  ],
});
