import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramMessage, sendTelegramPhoto } from "app/lib/telegram-bot";
import {
  fetchCatalogProductsByQuery,
  fetchEuroRate,
  toPriceUah,
  type CatalogProduct,
} from "app/lib/catalog-server";
import { escapeTelegramHtml } from "app/lib/telegram-order-message";
import {
  buildProductImageUrl,
  buildProductKeyboard,
  buildProductUrl,
} from "app/lib/telegram-product-message";
import { getSiteUrl } from "app/lib/site-url";

// A customer taps "🔔 Повідомити, коли з'явиться" on an out-of-stock product
// card in the bot — this collection is what a periodic checker (see
// checkAndNotifyStockWatches below) scans to find products that came back
// in stock since. Doc id is deterministic (uid+code) so re-tapping the same
// button is a harmless no-op instead of creating duplicate watches.
const WATCH_COLLECTION = "stockWatches";

const watchDocId = (uid: string, code: string) => `${uid}_${code}`;

export const createStockWatch = async (input: {
  uid: string;
  telegramChatId: string;
  code: string;
  article: string;
  name: string;
}) => {
  const db = getFirebaseAdminDb();
  await db
    .collection(WATCH_COLLECTION)
    .doc(watchDocId(input.uid, input.code))
    .set(
      {
        uid: input.uid,
        telegramChatId: input.telegramChatId,
        code: input.code,
        article: input.article,
        name: input.name,
        createdAt: FieldValue.serverTimestamp(),
        notifiedAt: null,
      },
      { merge: true }
    );
};

// One product's current stock, looked up the same way a bot /find result
// would be — used both when a customer first taps "watch" (to confirm the
// product exists and grab its name) and by the periodic checker below.
const lookupProductByCode = async (code: string): Promise<CatalogProduct | null> => {
  const result = await fetchCatalogProductsByQuery({
    page: 1,
    limit: 3,
    searchQuery: code,
    searchFilter: "code",
    sortOrder: "none",
    forceAllgoodsSource: true,
    includePriceEnrichment: false,
    preferLegacySource: false,
    timeoutMs: 4000,
    retries: 1,
    retryDelayMs: 200,
    cacheTtlMs: 1000 * 60 * 2,
  }).catch(() => ({ items: [] as CatalogProduct[] }));

  return result.items.find((item) => item.code === code) ?? result.items[0] ?? null;
};

export const findProductForWatch = lookupProductByCode;

const CHECK_BATCH_LIMIT = 25;

// Scans pending watches for products that are back in stock and notifies
// each customer once, then marks the watch as done. Meant to be triggered
// periodically (e.g. a cron job hitting /api/telegram/check-stock-watches)
// — see that route for the trigger contract. Bounded to CHECK_BATCH_LIMIT
// per call so a single run never becomes an unbounded, slow 1C-hammering
// loop; a cron running every few minutes will work through a larger queue
// over successive calls.
export const checkAndNotifyStockWatches = async () => {
  const db = getFirebaseAdminDb();
  const pendingSnap = await db
    .collection(WATCH_COLLECTION)
    .where("notifiedAt", "==", null)
    .limit(CHECK_BATCH_LIMIT)
    .get();

  const siteUrl = getSiteUrl();
  const euroRate = await fetchEuroRate().catch(() => null);
  let notified = 0;

  for (const doc of pendingSnap.docs) {
    const watch = doc.data() as {
      telegramChatId?: string;
      code?: string;
      name?: string;
    };
    if (!watch.telegramChatId || !watch.code) {
      await doc.ref.delete().catch(() => undefined);
      continue;
    }

    const product = await lookupProductByCode(watch.code);
    if (!product || product.quantity <= 0) continue;

    const caption = [
      "<b>🔔 Товар знову в наявності!</b>",
      "",
      `<b>${escapeTelegramHtml(product.name || watch.name || "Товар")}</b>`,
    ].join("\n");
    const priceUah = euroRate != null ? toPriceUah(product.priceEuro ?? null, euroRate) : null;
    const keyboard = buildProductKeyboard(siteUrl, product, priceUah);
    const imageUrl = buildProductImageUrl(siteUrl, product);

    const photoResult =
      product.hasPhoto !== false
        ? await sendTelegramPhoto(watch.telegramChatId, imageUrl, caption, {
            parseMode: "HTML",
            replyMarkup: keyboard,
          })
        : { ok: false as const };
    if (!photoResult.ok) {
      await sendTelegramMessage(watch.telegramChatId, `${caption}\n${buildProductUrl(siteUrl, product)}`, {
        parseMode: "HTML",
        replyMarkup: keyboard,
      });
    }

    await doc.ref.set({ notifiedAt: FieldValue.serverTimestamp() }, { merge: true });
    notified += 1;
  }

  return { checked: pendingSnap.size, notified };
};
