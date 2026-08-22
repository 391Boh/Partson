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
    ...(product.quantity > 0 && product.code
      ? [[{ text: "➕ Додати в кошик", callback_data: `cadd:${product.code}` }]]
      : []),
    [{ text: "🛒 Замовити на сайті", url: buildProductUrl(siteUrl, product) }],
    ...(product.quantity <= 0 && product.code
      ? [[{ text: "🔔 Повідомити, коли з'явиться", callback_data: `watch:${product.code}` }]]
      : []),
  ],
});

export type ProductResultsPagination = {
  page: number;
  hasMore: boolean;
  buildCallbackData: (page: number) => string;
};

const buildPagerRow = (pagination?: ProductResultsPagination) => {
  if (!pagination) return null;
  const { page, hasMore, buildCallbackData } = pagination;
  const row: { text: string; callback_data: string }[] = [];
  if (page > 1) row.push({ text: "⬅️ Попередні", callback_data: buildCallbackData(page - 1) });
  row.push({ text: `Стор. ${page}`, callback_data: "noop" });
  if (hasMore) row.push({ text: "➡️ Ще товари", callback_data: buildCallbackData(page + 1) });
  return row.length > 1 ? row : null;
};

// Shared by /find and the catalog-navigation "🛒 Показати товари" buttons.
//
// Each product is its own photo+caption message — a Telegram album
// (sendMediaGroup) plus a separate consolidated text list was tried here,
// but Telegram doesn't show per-photo captions in an album's compact chat
// view, so the photos and their details read as two disconnected things
// with no way to tell which picture belongs to which product. A plain
// photo message keeps the image and its own name/price/button bound
// together as one bubble, which is what actually stays "matched" per
// product. Flooding is bounded instead by pagination (5 per page, via
// `pagination` below) rather than by cramming everything into one album.
// Photos are always attempted regardless of the catalog's own hasPhoto
// flag — that flag comes from 1C and isn't reliably populated on every
// query path, so trusting Telegram's own fetch result is more accurate.
export const sendProductResults = async (
  chatId: string,
  products: CatalogProduct[],
  euroRate: number | null,
  siteUrl: string,
  pagination?: ProductResultsPagination
) => {
  if (products.length === 0) return;

  const priced = products.map((product) => ({
    product,
    priceUah: euroRate != null ? toPriceUah(product.priceEuro ?? null, euroRate) : null,
  }));
  const pagerRow = buildPagerRow(pagination);

  for (const [index, { product, priceUah }] of priced.entries()) {
    const caption = formatProductCaption(product, priceUah);
    const keyboard = buildProductKeyboard(siteUrl, product);
    const isLast = index === priced.length - 1;
    if (isLast && pagerRow) keyboard.inline_keyboard.push(pagerRow);

    const photoResult = await sendTelegramPhoto(
      chatId,
      buildProductImageUrl(siteUrl, product),
      caption,
      { parseMode: "HTML", replyMarkup: keyboard }
    );
    if (!photoResult.ok) {
      await sendTelegramMessage(chatId, caption, { parseMode: "HTML", replyMarkup: keyboard });
    }
  }
};
