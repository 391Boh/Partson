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

  return [
    `<b>${name}</b>`,
    product.producer && product.producer !== "-"
      ? escapeTelegramHtml(product.producer)
      : "",
    `Артикул: ${escapeTelegramHtml(product.article || product.code)}`,
    formatAvailability(product.quantity),
    `Ціна: <b>${price}</b>`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildProductKeyboard = (siteUrl: string, product: CatalogProduct) => ({
  inline_keyboard: [[{ text: "🛒 Переглянути на сайті", url: buildProductUrl(siteUrl, product) }]],
});
