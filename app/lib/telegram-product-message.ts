import "server-only";

import type { CatalogProduct } from "app/lib/catalog-server";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { buildProductSeoImagePath } from "app/lib/product-image-path";
import { escapeTelegramHtml, formatOrderMoney } from "app/lib/telegram-order-message";
import { sendTelegramMediaGroup, sendTelegramMessage, sendTelegramPhoto } from "app/lib/telegram-bot";
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

const buildListEntry = (
  index: number,
  product: CatalogProduct,
  priceUah: number | null,
  siteUrl: string
) => {
  const name = escapeTelegramHtml(buildVisibleProductName(product.name));
  const price = priceUah != null ? formatOrderMoney(priceUah) : "ціна за запитом";
  const article = escapeTelegramHtml(product.article || product.code);

  return [
    `${index + 1}. <a href="${buildProductUrl(siteUrl, product)}"><b>${name}</b></a>`,
    `<code>${article}</code> · ${formatAvailability(product.quantity)} · <b>${price}</b>`,
  ].join("\n");
};

// Shared by /find and the catalog-navigation "🛒 Показати товари" buttons.
//
// A single result keeps the original full card (photo + details + buy
// button) — there's nothing to "flood" with just one message. Multiple
// results used to each get their own photo message, which for 5 results
// meant 5 back-to-back messages landing in the chat at once; now photos go
// out as one compact album (sendMediaGroup) and the details/links land in
// one consolidated list right after, so N results is 2 messages instead of
// N. Photos are always attempted regardless of the catalog's own hasPhoto
// flag — that flag comes from 1C and isn't reliably populated on every
// query path, so trusting Telegram's own fetch result is more accurate.
export const sendProductResults = async (
  chatId: string,
  products: CatalogProduct[],
  euroRate: number | null,
  siteUrl: string
) => {
  if (products.length === 0) return;

  const priced = products.map((product) => ({
    product,
    priceUah: euroRate != null ? toPriceUah(product.priceEuro ?? null, euroRate) : null,
  }));

  if (priced.length === 1) {
    const { product, priceUah } = priced[0];
    const caption = formatProductCaption(product, priceUah);
    const keyboard = buildProductKeyboard(siteUrl, product);
    const photoResult = await sendTelegramPhoto(
      chatId,
      buildProductImageUrl(siteUrl, product),
      caption,
      { parseMode: "HTML", replyMarkup: keyboard }
    );
    if (!photoResult.ok) {
      await sendTelegramMessage(chatId, caption, { parseMode: "HTML", replyMarkup: keyboard });
    }
    return;
  }

  const listText = priced
    .map(({ product, priceUah }, index) => buildListEntry(index, product, priceUah, siteUrl))
    .join("\n\n");
  await sendTelegramMessage(chatId, listText, { parseMode: "HTML" });

  const photoUrls = products.map((product) => buildProductImageUrl(siteUrl, product));
  if (photoUrls.length >= 2) {
    const grouped = await sendTelegramMediaGroup(chatId, photoUrls);
    if (!grouped.ok) {
      // One bad URL fails the whole album atomically — fall back to sending
      // each photo on its own so a single stale image doesn't hide the rest.
      for (const url of photoUrls) {
        await sendTelegramPhoto(chatId, url, "").catch(() => undefined);
      }
    }
  } else if (photoUrls.length === 1) {
    await sendTelegramPhoto(chatId, photoUrls[0], "").catch(() => undefined);
  }

  for (const { product } of priced) {
    if (product.quantity > 0 || !product.code) continue;
    await sendTelegramMessage(
      chatId,
      `🔔 ${escapeTelegramHtml(buildVisibleProductName(product.name))}`,
      {
        parseMode: "HTML",
        replyMarkup: {
          inline_keyboard: [
            [{ text: "🔔 Повідомити, коли з'явиться", callback_data: `watch:${product.code}` }],
          ],
        },
      }
    );
  }
};
