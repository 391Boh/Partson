import { after, NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { readJsonObject } from "../../_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  ensureBotCommandsRegistered,
  ensureBotMenuButtonConfigured,
  sendTelegramLocation,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "app/lib/telegram-bot";
import {
  escapeTelegramHtml,
  formatOrderBlock,
  getOrderPrimaryImageUrl,
  type OrderFields,
} from "app/lib/telegram-order-message";
import { getSiteUrl } from "app/lib/site-url";
import { fetchCatalogProductsByQuery, fetchEuroRate } from "app/lib/catalog-server";
import { sendProductResults } from "app/lib/telegram-product-message";
import {
  answerTelegramCallback,
  deleteTelegramMessage,
  editTelegramMessageMedia,
  editTelegramMessageText,
} from "app/lib/telegram-callback";
import {
  buildBrandListMenu,
  buildBrandModelsMenu,
  buildChildMenu,
  buildGroupMenu,
  buildGroupsListMenu,
  buildModelMenu,
  buildProducerMenu,
  buildProducersListMenu,
  buildSubgroupMenu,
  buildTopMenu,
  resolveGroupProductFilter,
  resolveModelProductQuery,
  resolveProducerProductFilter,
  type NavButton,
  type NavMenu,
} from "app/lib/telegram-catalog-nav";
import { createChatMessageServer } from "app/lib/chat-message";
import { downloadTelegramPhotoToStorage } from "app/lib/telegram-file";
import { buildContactsCard, getShopCoordinates } from "app/lib/telegram-shop-info";
import { createStockWatch, findProductForWatch } from "app/lib/telegram-stock-watch";

export const runtime = "nodejs";

type TelegramUser = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id?: number;
  from?: TelegramUser;
  chat?: {
    id?: number | string;
    type?: string;
  };
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }[];
  contact?: {
    phone_number?: string;
    user_id?: number | string;
    first_name?: string;
    last_name?: string;
  };
};

type TelegramCallbackQuery = {
  id: string;
  from?: TelegramUser;
  data?: string;
  message?: TelegramMessage & { photo?: unknown[] };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const PROFILE_TOKEN_PREFIX = "profile_";

const normalizeId = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).replace(/^telegram_/u, "").trim()
    : "";

const normalizeText = (value: unknown, maxLength = 2000) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("380")) return `+${digits.slice(0, 12)}`;
  if (digits.startsWith("0")) return `+38${digits.slice(0, 10)}`;
  return `+380${digits.slice(-9)}`;
};

const isValidPhone = (value: string) => /^\+380\d{9}$/.test(value);

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());

const buildContactKeyboard = () => ({
  keyboard: [
    [
      {
        text: "📱 Поділитися телефоном",
        request_contact: true,
      },
    ],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
});

const removeKeyboard = () => ({
  remove_keyboard: true,
});

// web_app buttons open inside Telegram's own in-app browser instead of
// switching to an external one — a nicer, more "native app" feel for the
// main site CTA. Telegram rejects (and drops the whole keyboard for) a
// web_app button whose url isn't https — falls back to a plain link button
// in local/dev environments where getSiteUrl() may be http://localhost.
const buildSiteButton = (text: string, url: string) =>
  url.startsWith("https://") ? { text, web_app: { url } } : { text, url };

const buildCatalogKeyboard = (siteUrl: string) => ({
  inline_keyboard: [
    [{ text: "📂 Каталог у боті", callback_data: "m" }],
    [
      { text: "💬 Написати менеджеру", callback_data: "support:start" },
      { text: "📍 Контакти", callback_data: "contacts" },
    ],
    [buildSiteButton("🌐 Перейти на сайт", `${siteUrl}/katalog`)],
  ],
});

const getDisplayName = (user?: TelegramUser) =>
  [user?.first_name, user?.last_name]
    .map((value) => normalizeText(value, 80))
    .filter(Boolean)
    .join(" ")
    .trim() || normalizeText(user?.username, 80) || "Telegram користувач";

const getTelegramUserPatch = (from: TelegramUser, chatId: string) => ({
  telegramId: normalizeId(from.id),
  telegramChatId: chatId,
  telegramUsername: normalizeText(from.username, 120),
  name: getDisplayName(from),
  authProvider: "telegram",
  updatedAt: new Date().toISOString(),
});

const findUserByTelegramId = async (telegramId: string) => {
  const db = getFirebaseAdminDb();
  const directRef = db.collection("users").doc(`telegram_${telegramId}`);
  const directSnap = await directRef.get();
  if (directSnap.exists) return directRef;

  const querySnap = await db
    .collection("users")
    .where("telegramId", "==", telegramId)
    .limit(1)
    .get();
  return querySnap.empty ? null : querySnap.docs[0].ref;
};

const findUserByProfileToken = async (token: string) => {
  if (!token) return null;

  const db = getFirebaseAdminDb();
  const querySnap = await db
    .collection("users")
    .where("telegramProfileToken", "==", token)
    .limit(1)
    .get();
  if (querySnap.empty) return null;

  const docSnap = querySnap.docs[0];
  const expiresAt = normalizeText(docSnap.data().telegramProfileTokenExpiresAt, 80);
  if (expiresAt && Date.parse(expiresAt) < Date.now()) {
    await docSnap.ref.set(
      {
        telegramProfileToken: FieldValue.delete(),
        telegramProfileTokenExpiresAt: FieldValue.delete(),
      },
      { merge: true }
    );
    return null;
  }

  return docSnap.ref;
};

const NOT_LINKED_MESSAGE =
  "🔒 Спочатку увійдіть через Telegram на сайті PartsON, а потім спробуйте ще раз.";

const askPhone = (chatId: string | number) =>
  sendTelegramMessage(
    chatId,
    [
      "📱 Щоб завершити профіль PartsON, поділіться телефоном.",
      "Натисніть кнопку нижче або напишіть номер у форматі <code>+380XXXXXXXXX</code>.",
    ].join("\n"),
    { parseMode: "HTML", replyMarkup: buildContactKeyboard() }
  );

const askEmail = (chatId: string | number) =>
  sendTelegramMessage(
    chatId,
    "✅ Дякую! Тепер напишіть ваш <b>email</b> для профілю PartsON.",
    { parseMode: "HTML", replyMarkup: removeKeyboard() }
  );

const finishProfile = (chatId: string | number) =>
  sendTelegramMessage(
    chatId,
    "🎉 <b>Готово!</b> Телефон і email збережені в профілі PartsON.",
    { parseMode: "HTML", replyMarkup: removeKeyboard() }
  );

const sendWelcomeBack = (chatId: string | number, from: TelegramUser) =>
  sendTelegramMessage(
    chatId,
    [
      `<b>Привіт, ${escapeTelegramHtml(getDisplayName(from))}! 👋</b>`,
      "Просто напишіть назву чи артикул деталі — я знайду її в каталозі.",
      "",
      "<b>Команди:</b>",
      "<code>/catalog</code> — групи, марки авто, виробники",
      "<code>/find</code> — пошук товару",
      "<code>/orders</code> — ваші замовлення в PartsON",
      "<code>/profile</code> — ваш профіль",
      "<code>/support</code> — написати менеджеру",
      "<code>/contacts</code> — контакти й адреса магазину",
      "<code>/help</code> — довідка",
    ].join("\n"),
    { parseMode: "HTML", replyMarkup: buildCatalogKeyboard(getSiteUrl()) }
  );

const handleStart = async (
  message: TelegramMessage,
  from: TelegramUser,
  chatId: string,
  text: string
) => {
  const startPayload = text.split(/\s+/)[1] || "";
  const token = startPayload.startsWith(PROFILE_TOKEN_PREFIX)
    ? startPayload.slice(PROFILE_TOKEN_PREFIX.length)
    : "";
  const telegramId = normalizeId(from.id);
  const userRef = token
    ? await findUserByProfileToken(token)
    : await findUserByTelegramId(telegramId);

  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }

  // Every /start used to unconditionally kick off the phone → email
  // questionnaire again, even for a returning user whose profile is already
  // complete — annoying on every single re-open of the bot. Skip straight to
  // a greeting once both are already on file.
  const existingSnap = await userRef.get();
  const existingData = existingSnap.exists ? existingSnap.data() : null;
  const alreadyComplete = Boolean(existingData?.phone && existingData?.email);

  if (alreadyComplete && !token) {
    await userRef.set(getTelegramUserPatch(from, chatId), { merge: true });
    await sendWelcomeBack(message.chat?.id || chatId, from);
    return;
  }

  await userRef.set(
    {
      ...getTelegramUserPatch(from, chatId),
      telegramProfileToken: FieldValue.delete(),
      telegramProfileTokenExpiresAt: FieldValue.delete(),
      telegramProfileStep: "awaiting_phone",
    },
    { merge: true }
  );
  await askPhone(message.chat?.id || chatId);
};

const handleOrders = async (from: TelegramUser, chatId: string) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);
  const siteUrl = getSiteUrl();

  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }

  const db = getFirebaseAdminDb();
  const ordersSnap = await db
    .collection("orders")
    .where("uid", "==", userRef.id)
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  if (ordersSnap.empty) {
    await sendTelegramMessage(chatId, "📦 У вас ще немає замовлень.\nОберіть щось у каталозі:", {
      replyMarkup: buildCatalogKeyboard(siteUrl),
    });
    return;
  }

  await sendTelegramMessage(
    chatId,
    `<b>📦 Ваші останні замовлення</b> (${ordersSnap.size})`,
    { parseMode: "HTML" }
  );

  const docs = ordersSnap.docs;
  for (const [index, doc] of docs.entries()) {
    const order = doc.data() as OrderFields;
    const caption = formatOrderBlock(doc.id, order, siteUrl);
    const imageUrl = getOrderPrimaryImageUrl(order, siteUrl);
    // Only the last card carries the "browse more" button — repeating it on
    // every order would just be noise.
    const isLast = index === docs.length - 1;
    const keyboard = isLast ? buildCatalogKeyboard(siteUrl) : undefined;

    if (imageUrl) {
      const photoResult = await sendTelegramPhoto(chatId, imageUrl, caption, {
        parseMode: "HTML",
        replyMarkup: keyboard,
      });
      if (photoResult.ok) continue;
    }

    await sendTelegramMessage(chatId, caption, { parseMode: "HTML", replyMarkup: keyboard });
  }
};

const handleProfile = async (from: TelegramUser, chatId: string) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);

  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }

  const snap = await userRef.get();
  const data = snap.exists ? snap.data() : null;
  const name = escapeTelegramHtml(normalizeText(data?.name, 120) || getDisplayName(from));
  const phone = normalizeText(data?.phone, 40);
  const email = normalizeText(data?.email, 120);

  await sendTelegramMessage(
    chatId,
    [
      `<b>👤 Профіль PartsON</b>`,
      "",
      `Ім'я: <b>${name}</b>`,
      `📞 Телефон: ${phone ? `<code>${escapeTelegramHtml(phone)}</code>` : "не вказано"}`,
      `✉️ Email: ${email ? `<code>${escapeTelegramHtml(email)}</code>` : "не вказано"}`,
    ].join("\n"),
    { parseMode: "HTML", replyMarkup: buildCatalogKeyboard(getSiteUrl()) }
  );
};

const FIND_RESULT_LIMIT = 5;

const handleFind = async (chatId: string, rawQuery: string) => {
  const query = normalizeText(rawQuery, 200);
  const siteUrl = getSiteUrl();

  if (!query) {
    await sendTelegramMessage(
      chatId,
      "🔍 Напишіть, що шукаємо — наприклад: <code>/find гальмівні колодки</code> або <code>/find AD030213</code>.",
      { parseMode: "HTML" }
    );
    return;
  }

  const [result, euroRate] = await Promise.all([
    fetchCatalogProductsByQuery({
      page: 1,
      limit: FIND_RESULT_LIMIT,
      searchQuery: query,
      searchFilter: "all",
      sortOrder: "none",
      forceAllgoodsSource: true,
      includePriceEnrichment: false,
      preferLegacySource: false,
      timeoutMs: 4500,
      retries: 1,
      retryDelayMs: 200,
      cacheTtlMs: 1000 * 60 * 5,
    }).catch(() => ({ items: [], hasMore: false, nextCursor: "", cursorField: null })),
    fetchEuroRate().catch(() => null),
  ]);

  if (result.items.length === 0) {
    await sendTelegramMessage(
      chatId,
      `😕 Нічого не знайдено за запитом «<b>${escapeTelegramHtml(query)}</b>». Спробуйте іншу назву або артикул.`,
      { parseMode: "HTML", replyMarkup: buildCatalogKeyboard(siteUrl) }
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    `🔍 Знайдено <b>${result.items.length}</b> ${result.items.length === 1 ? "товар" : "товари"} за запитом «${escapeTelegramHtml(query)}»:`,
    { parseMode: "HTML" }
  );
  await sendProductResults(chatId, result.items, euroRate, siteUrl);
};

const handleHelp = (chatId: string) =>
  sendTelegramMessage(
    chatId,
    [
      "<b>ℹ️ Команди PartsON</b>",
      "",
      "<code>/catalog</code> — групи, марки авто, виробники",
      "<code>/find</code> &lt;назва або артикул&gt; — пошук товару",
      "<code>/orders</code> — ваші замовлення",
      "<code>/profile</code> — ваш профіль (телефон, email)",
      "<code>/support</code> — написати менеджеру",
      "<code>/contacts</code> — контакти й адреса магазину",
      "<code>/help</code> — ця довідка",
      "",
      "Або просто напишіть назву чи артикул деталі — знайду без команди.",
    ].join("\n"),
    { parseMode: "HTML", replyMarkup: buildCatalogKeyboard(getSiteUrl()) }
  );

const SUPPORT_END_KEYBOARD = { inline_keyboard: [[{ text: "✅ Завершити", callback_data: "support:end" }]] };

const startSupportMode = async (
  userRef: FirebaseFirestore.DocumentReference,
  chatId: string
) => {
  await userRef.set({ supportMode: true }, { merge: true });
  await sendTelegramMessage(
    chatId,
    [
      "💬 Ви на зв'язку з менеджером PartsON.",
      "Напишіть повідомлення (можна кілька) або надішліть фото — я одразу передам це менеджеру.",
      "Коли завершите розмову, натисніть «✅ Завершити».",
    ].join("\n"),
    { replyMarkup: SUPPORT_END_KEYBOARD }
  );
};

const handleSupport = async (from: TelegramUser, chatId: string) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);
  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }
  await startSupportMode(userRef, chatId);
};

const endSupportMode = async (from: TelegramUser, chatId: string) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);
  if (userRef) await userRef.set({ supportMode: false }, { merge: true }).catch(() => undefined);
  await sendTelegramMessage(chatId, "👋 <b>Чат з менеджером завершено.</b> Дякуємо!", {
    parseMode: "HTML",
    replyMarkup: buildCatalogKeyboard(getSiteUrl()),
  });
};

const relaySupportText = async (userId: string, chatId: string, text: string) => {
  const result = await createChatMessageServer({ userId, text, type: "text" });
  await sendTelegramMessage(
    chatId,
    result.ok
      ? "✅ <b>Надіслано менеджеру.</b> Очікуйте відповідь тут."
      : "⚠️ Не вдалося надіслати повідомлення. Спробуйте ще раз.",
    { parseMode: "HTML" }
  );
};

const relaySupportPhoto = async (userId: string, chatId: string, fileId: string, caption: string) => {
  const imageUrl = await downloadTelegramPhotoToStorage(fileId, userId);
  if (!imageUrl) {
    await sendTelegramMessage(chatId, "⚠️ Не вдалося завантажити фото. Спробуйте ще раз.");
    return;
  }
  const result = await createChatMessageServer({
    userId,
    text: caption || "Фото",
    type: "image",
    imageUrl,
    imageName: "Фото",
  });
  await sendTelegramMessage(
    chatId,
    result.ok
      ? "✅ <b>Фото надіслано менеджеру.</b> Очікуйте відповідь тут."
      : "⚠️ Не вдалося надіслати фото. Спробуйте ще раз.",
    { parseMode: "HTML" }
  );
};

const handleCatalog = async (chatId: string) => {
  const menu = buildTopMenu();
  await sendTelegramMessage(chatId, menu.caption, {
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: menu.keyboard },
  });
};

// Sends a native map pin first (Telegram renders it as a real, pannable
// map right in the chat) followed by the address/hours/phone card — the
// pin alone has no room for text, so the two together are what make this
// actually useful rather than just a dot on a map.
const handleContacts = async (chatId: string) => {
  const { lat, lng } = getShopCoordinates();
  await sendTelegramLocation(chatId, lat, lng).catch(() => undefined);

  const { text, keyboard } = buildContactsCard(getSiteUrl());
  await sendTelegramMessage(chatId, text, { parseMode: "HTML", replyMarkup: keyboard });
};

// callback_data prefixes match app/lib/telegram-catalog-nav.ts's scheme —
// see the plan doc for the full table. "noop" is the non-actionable page
// indicator button (e.g. "2/5").
const resolveNavMenu = async (siteUrl: string, data: string): Promise<NavMenu | null> => {
  if (data === "noop") return null;
  if (data === "m") return buildTopMenu();
  if (data === "g") return buildGroupsListMenu();

  const [prefix, ...rest] = data.split(":");

  if (prefix === "g") return buildGroupMenu(siteUrl, rest[0]);
  if (prefix === "gs") return buildSubgroupMenu(siteUrl, rest[0], Number(rest[1]));
  if (prefix === "gc") return buildChildMenu(siteUrl, rest[0], Number(rest[1]), Number(rest[2]));
  if (prefix === "a") return buildBrandListMenu(Number(rest[0]));
  if (prefix === "ab") return buildBrandModelsMenu(siteUrl, rest[0], Number(rest[1]));
  if (prefix === "am") return buildModelMenu(siteUrl, rest[0], Number(rest[1]));
  if (prefix === "p") return buildProducersListMenu(Number(rest[0]));
  if (prefix === "pd") return buildProducerMenu(siteUrl, rest[0]);

  return null;
};

const PRODUCTS_CALLBACK_LIMIT = 5;

// "gp:"/"pp:"/"mp:" don't resolve to a NavMenu edit like the browse levels
// do — they trigger a fresh batch of product cards (same rendering as
// /find, via the shared sendProductResults helper) sent below the leaf card.
const handleProductsCallback = async (chatId: string, data: string) => {
  const siteUrl = getSiteUrl();
  const [prefix, ...rest] = data.split(":");

  let query: { searchQuery?: string; group?: string; subcategory?: string; producer?: string } | null = null;
  if (prefix === "gp") {
    const childIndex = rest.length > 2 ? Number(rest[2]) : undefined;
    query = await resolveGroupProductFilter(rest[0], Number(rest[1]), childIndex);
  } else if (prefix === "pp") {
    query = await resolveProducerProductFilter(rest[0]);
  } else if (prefix === "mp") {
    query = await resolveModelProductQuery(rest[0], Number(rest[1]));
  }

  if (!query) {
    await sendTelegramMessage(chatId, "⚠️ Не вдалося знайти товари для цього розділу.");
    return;
  }

  const [result, euroRate] = await Promise.all([
    fetchCatalogProductsByQuery({
      page: 1,
      limit: PRODUCTS_CALLBACK_LIMIT,
      searchQuery: query.searchQuery,
      searchFilter: query.searchQuery ? "description" : "all",
      group: query.group ?? null,
      subcategory: query.subcategory ?? null,
      producer: query.producer ?? null,
      expandHierarchy: true,
      forceAllgoodsSource: true,
      sortOrder: "none",
      includePriceEnrichment: false,
      preferLegacySource: false,
      timeoutMs: 4500,
      retries: 1,
      retryDelayMs: 200,
      cacheTtlMs: 1000 * 60 * 5,
    }).catch(() => ({ items: [], hasMore: false, nextCursor: "", cursorField: null })),
    fetchEuroRate().catch(() => null),
  ]);

  if (result.items.length === 0) {
    await sendTelegramMessage(chatId, "😕 Товарів у цьому розділі поки не знайдено.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    `🛒 Знайдено <b>${result.items.length}</b> ${result.items.length === 1 ? "товар" : "товари"}:`,
    { parseMode: "HTML" }
  );
  await sendProductResults(chatId, result.items, euroRate, siteUrl);
};

// Gated behind onboarding, same as /orders and /support — the watch has to
// be tied to a real linked account so the periodic checker knows where to
// send the notification later.
const handleWatchCallback = async (chatId: string, code: string, from?: TelegramUser) => {
  if (!code || !from) return;

  const userRef = await findUserByTelegramId(normalizeId(from.id));
  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }

  const product = await findProductForWatch(code);
  if (!product) {
    await sendTelegramMessage(chatId, "⚠️ Не вдалося знайти цей товар.");
    return;
  }

  await createStockWatch({
    uid: userRef.id,
    telegramChatId: chatId,
    code: product.code,
    article: product.article,
    name: product.name,
  });

  await sendTelegramMessage(
    chatId,
    `🔔 Готово! Повідомимо вас тут, щойно <b>${escapeTelegramHtml(product.name)}</b> з'явиться в наявності.`,
    { parseMode: "HTML" }
  );
};

const handleCallbackQuery = async (callback: TelegramCallbackQuery) => {
  const data = (callback.data || "").trim();
  const message = callback.message;
  const chatId = normalizeId(message?.chat?.id);
  const messageId = message?.message_id;

  if (!data || !chatId) {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    return;
  }

  if (data === "support:start") {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    const from = callback.from;
    if (!from) return;
    const userRef = await findUserByTelegramId(normalizeId(from.id));
    if (!userRef) {
      await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
      return;
    }
    await startSupportMode(userRef, chatId);
    return;
  }

  if (data === "support:end") {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    if (callback.from) await endSupportMode(callback.from, chatId);
    return;
  }

  if (data === "contacts") {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    await handleContacts(chatId);
    return;
  }

  if (data.startsWith("gp:") || data.startsWith("pp:") || data.startsWith("mp:")) {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    await handleProductsCallback(chatId, data).catch((error) => {
      console.error("Products callback failed:", error);
    });
    return;
  }

  if (data.startsWith("watch:")) {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    await handleWatchCallback(chatId, data.slice("watch:".length), callback.from).catch((error) => {
      console.error("Stock watch callback failed:", error);
    });
    return;
  }

  if (!messageId) {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    return;
  }

  const siteUrl = getSiteUrl();
  const menu = await resolveNavMenu(siteUrl, data).catch(() => null);

  if (!menu) {
    await answerTelegramCallback(callback.id).catch(() => undefined);
    return;
  }

  await answerTelegramCallback(callback.id).catch(() => undefined);

  const replyMarkup = { inline_keyboard: menu.keyboard as NavButton[][] };
  const hadPhoto = Boolean(message?.photo?.length);

  // Telegram can't turn a text message into a photo message (or back) via
  // edit — only same-kind-to-same-kind edits work. Falling outside that,
  // replace the message instead of erroring out.
  if (hadPhoto && menu.imageUrl) {
    const result = await editTelegramMessageMedia(chatId, messageId, menu.imageUrl, menu.caption, {
      parseMode: "HTML",
      replyMarkup,
    });
    if (result.ok) return;
  } else if (!hadPhoto && !menu.imageUrl) {
    const result = await editTelegramMessageText(chatId, messageId, menu.caption, {
      parseMode: "HTML",
      replyMarkup,
    });
    if (result.ok) return;
  }

  // Mixed transition (text→photo, photo→text) or the same-kind edit above
  // failed (e.g. the image URL Telegram had cached became unreachable) —
  // replace the message outright.
  await deleteTelegramMessage(chatId, messageId).catch(() => undefined);
  if (menu.imageUrl) {
    const sent = await sendTelegramPhoto(chatId, menu.imageUrl, menu.caption, {
      parseMode: "HTML",
      replyMarkup,
    });
    if (sent.ok) return;
  }
  await sendTelegramMessage(chatId, menu.caption, { parseMode: "HTML", replyMarkup });
};

const handlePhone = async (
  message: TelegramMessage,
  from: TelegramUser,
  chatId: string,
  phone: string
) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);

  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }

  await userRef.set(
    {
      ...getTelegramUserPatch(from, chatId),
      phone,
      telegramProfileStep: "awaiting_email",
    },
    { merge: true }
  );
  await askEmail(chatId);
};

const handleEmail = async (
  from: TelegramUser,
  chatId: string,
  email: string
) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);

  if (!userRef) {
    await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
    return;
  }

  await userRef.set(
    {
      ...getTelegramUserPatch(from, chatId),
      email: email.toLowerCase(),
      telegramProfileStep: FieldValue.delete(),
      telegramProfileCompletedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  await finishProfile(chatId);
};

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (incomingSecret !== secret) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 64_000 });
  if (!bodyResult.ok) {
    return NextResponse.json({ ok: false, error: bodyResult.error }, { status: bodyResult.status });
  }

  const update = bodyResult.value as TelegramUpdate;

  // Telegram expects a fast HTTP response and retries the same update if it
  // doesn't get one promptly — 1C-backed lookups (product search, category
  // product listings) have been observed taking 30-60s+ under load, which
  // would otherwise both stall this response and risk Telegram redelivering
  // the identical update (double-processing: a duplicate reply, or the
  // same support message relayed twice). Acknowledge immediately and do the
  // actual work in the background via after() instead.
  after(() =>
    processUpdate(update).catch((error) => {
      console.error("Telegram update processing failed:", error);
    })
  );

  return NextResponse.json({ ok: true });
}

const processUpdate = async (update: TelegramUpdate) => {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message;
  const from = message?.from;
  const chatId = normalizeId(message?.chat?.id);
  const fromId = normalizeId(from?.id);

  if (!message || !from || !chatId || !fromId) {
    return;
  }

  ensureBotCommandsRegistered();
  ensureBotMenuButtonConfigured();

  const text = normalizeText(message.text, 1200);

  // Any recognized command exits support mode, so a fresh /find or /catalog
  // isn't accidentally swallowed as a message to the manager on the next
  // stray-text message. Best-effort, never blocks the command itself.
  if (text.startsWith("/") && !text.startsWith("/support")) {
    void findUserByTelegramId(fromId)
      .then((ref) => ref?.set({ supportMode: false }, { merge: true }))
      .catch(() => undefined);
  }

  if (text.startsWith("/start")) {
    await handleStart(message, from, chatId, text);
    return;
  }

  if (text.startsWith("/catalog")) {
    await handleCatalog(chatId);
    return;
  }

  if (text.startsWith("/orders")) {
    await handleOrders(from, chatId);
    return;
  }

  if (text.startsWith("/profile")) {
    await handleProfile(from, chatId);
    return;
  }

  if (text.startsWith("/find")) {
    await handleFind(chatId, text.slice("/find".length).trim());
    return;
  }

  if (text.startsWith("/help")) {
    await handleHelp(chatId);
    return;
  }

  if (text.startsWith("/support")) {
    await handleSupport(from, chatId);
    return;
  }

  if (text.startsWith("/contacts")) {
    await handleContacts(chatId);
    return;
  }

  // A photo has no other meaning in the bot (unlike stray text, which needs
  // supportMode to disambiguate from /find) — so any photo from an
  // onboarded user goes straight to the manager, no /support step needed
  // first. Only the account link itself is required, same gate as
  // /orders, /profile, /support.
  const photos = message.photo;
  if (photos?.length) {
    const telegramId = normalizeId(from.id);
    const userRef = await findUserByTelegramId(telegramId);
    const snap = userRef ? await userRef.get() : null;
    const data = snap?.exists ? snap.data() : null;

    if (!userRef || !data?.phone || !data?.email) {
      await sendTelegramMessage(chatId, NOT_LINKED_MESSAGE, { replyMarkup: removeKeyboard() });
      return;
    }

    const largest = photos[photos.length - 1];
    await relaySupportPhoto(userRef.id, chatId, largest.file_id, normalizeText(message.caption, 1200));
    return;
  }

  const contact = message.contact;
  if (contact?.phone_number) {
    const contactUserId = normalizeId(contact.user_id);
    if (contactUserId && contactUserId !== fromId) {
      await sendTelegramMessage(
        chatId,
        "⚠️ Будь ласка, поділіться саме своїм номером телефону.",
        { replyMarkup: buildContactKeyboard() }
      );
      return;
    }

    const phone = normalizePhone(contact.phone_number);
    if (!isValidPhone(phone)) {
      await askPhone(chatId);
      return;
    }

    await handlePhone(message, from, chatId, phone);
    return;
  }

  if (text) {
    const phone = normalizePhone(text);
    if (isValidPhone(phone)) {
      await handlePhone(message, from, chatId, phone);
      return;
    }

    if (isValidEmail(text)) {
      await handleEmail(from, chatId, text.trim());
      return;
    }
  }

  // Stray text from an already-onboarded user (profile complete) — treat it
  // as a product search instead of re-demanding phone/email they've already
  // given. This is what makes /find optional in practice: just typing a
  // part name or article works. Unless they're mid support-conversation, in
  // which case the same stray text goes to the manager instead.
  const telegramId = normalizeId(from.id);
  const existingUserRef = await findUserByTelegramId(telegramId);
  const existingSnap = existingUserRef ? await existingUserRef.get() : null;
  const existingData = existingSnap?.exists ? existingSnap.data() : null;
  if (existingUserRef && existingData?.supportMode && text) {
    await relaySupportText(existingUserRef.id, chatId, text);
    return;
  }
  if (existingData?.phone && existingData?.email) {
    await handleFind(chatId, text);
    return;
  }

  await sendTelegramMessage(
    chatId,
    "📱 Для завершення профілю поділіться телефоном, а потім напишіть email.",
    { replyMarkup: buildContactKeyboard() }
  );
};
