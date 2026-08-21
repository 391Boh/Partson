import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { readJsonObject } from "../../_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  ensureBotCommandsRegistered,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "app/lib/telegram-bot";
import {
  escapeTelegramHtml,
  formatOrderBlock,
  type OrderFields,
} from "app/lib/telegram-order-message";
import { getSiteUrl } from "app/lib/site-url";
import { fetchCatalogProductsByQuery, toPriceUah, fetchEuroRate } from "app/lib/catalog-server";
import {
  buildProductImageUrl,
  buildProductKeyboard,
  formatProductCaption,
} from "app/lib/telegram-product-message";

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
  contact?: {
    phone_number?: string;
    user_id?: number | string;
    first_name?: string;
    last_name?: string;
  };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
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
        text: "Поділитися телефоном",
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

const buildCatalogKeyboard = (siteUrl: string) => ({
  inline_keyboard: [[{ text: "🛍 Перейти в каталог", url: `${siteUrl}/katalog` }]],
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
  "Спочатку увійдіть через Telegram на сайті PartsON, а потім спробуйте ще раз.";

const askPhone = (chatId: string | number) =>
  sendTelegramMessage(
    chatId,
    [
      "Щоб завершити профіль PartsON, поділіться телефоном.",
      "Натисніть кнопку нижче або напишіть номер у форматі +380XXXXXXXXX.",
    ].join("\n"),
    { replyMarkup: buildContactKeyboard() }
  );

const askEmail = (chatId: string | number) =>
  sendTelegramMessage(
    chatId,
    "Дякую. Тепер напишіть ваш email для профілю PartsON.",
    { replyMarkup: removeKeyboard() }
  );

const finishProfile = (chatId: string | number) =>
  sendTelegramMessage(
    chatId,
    "Готово. Телефон і email збережені в профілі PartsON.",
    { replyMarkup: removeKeyboard() }
  );

const sendWelcomeBack = (chatId: string | number, from: TelegramUser) =>
  sendTelegramMessage(
    chatId,
    [
      `Привіт, ${getDisplayName(from)}! 👋`,
      "",
      "Просто напишіть назву чи артикул деталі — я знайду її в каталозі.",
      "",
      "Команди:",
      "/find — пошук товару",
      "/orders — ваші замовлення в PartsON",
      "/profile — ваш профіль",
      "/help — довідка",
    ].join("\n"),
    { replyMarkup: buildCatalogKeyboard(getSiteUrl()) }
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
    await sendTelegramMessage(chatId, "У вас ще немає замовлень.", {
      replyMarkup: buildCatalogKeyboard(siteUrl),
    });
    return;
  }

  const blocks = ordersSnap.docs.map((doc) =>
    formatOrderBlock(doc.id, doc.data() as OrderFields, siteUrl)
  );

  await sendTelegramMessage(chatId, `<b>Ваші останні замовлення</b>\n\n${blocks.join("\n\n")}`, {
    parseMode: "HTML",
    replyMarkup: buildCatalogKeyboard(siteUrl),
  });
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
  const phone = escapeTelegramHtml(normalizeText(data?.phone, 40)) || "не вказано";
  const email = escapeTelegramHtml(normalizeText(data?.email, 120)) || "не вказано";

  await sendTelegramMessage(
    chatId,
    [
      `<b>Профіль PartsON</b>`,
      `Ім'я: ${name}`,
      `Телефон: ${phone}`,
      `Email: ${email}`,
    ].join("\n"),
    { parseMode: "HTML" }
  );
};

const FIND_RESULT_LIMIT = 5;

const handleFind = async (chatId: string, rawQuery: string) => {
  const query = normalizeText(rawQuery, 200);
  const siteUrl = getSiteUrl();

  if (!query) {
    await sendTelegramMessage(
      chatId,
      "Напишіть, що шукаємо — наприклад: <code>/find гальмівні колодки</code> або <code>/find AD030213</code>.",
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
      `Нічого не знайдено за запитом «${escapeTelegramHtml(query)}». Спробуйте іншу назву або артикул.`,
      { replyMarkup: buildCatalogKeyboard(siteUrl) }
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    `🔍 Знайдено ${result.items.length} ${result.items.length === 1 ? "товар" : "товари"} за запитом «${escapeTelegramHtml(query)}»:`
  );

  for (const product of result.items) {
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

const handleHelp = (chatId: string) =>
  sendTelegramMessage(
    chatId,
    [
      "Команди PartsON:",
      "/find <назва або артикул> — пошук товару в каталозі",
      "/orders — ваші замовлення",
      "/profile — ваш профіль (телефон, email)",
      "/help — ця довідка",
      "",
      "Або просто напишіть назву чи артикул деталі — знайду без команди.",
    ].join("\n"),
    { replyMarkup: buildCatalogKeyboard(getSiteUrl()) }
  );

const handlePhone = async (
  message: TelegramMessage,
  from: TelegramUser,
  chatId: string,
  phone: string
) => {
  const telegramId = normalizeId(from.id);
  const userRef = await findUserByTelegramId(telegramId);

  if (!userRef) {
    await sendTelegramMessage(
      chatId,
      "Не знайшов профіль PartsON. Спочатку увійдіть через Telegram на сайті.",
      { replyMarkup: removeKeyboard() }
    );
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
    await sendTelegramMessage(
      chatId,
      "Не знайшов профіль PartsON. Спочатку увійдіть через Telegram на сайті.",
      { replyMarkup: removeKeyboard() }
    );
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
  const message = update.message;
  const from = message?.from;
  const chatId = normalizeId(message?.chat?.id);
  const fromId = normalizeId(from?.id);

  if (!message || !from || !chatId || !fromId) {
    return NextResponse.json({ ok: true });
  }

  // Fire-and-forget — Telegram only cares that the webhook responds quickly,
  // and this is a no-op after the first call in this process (see
  // ensureBotCommandsRegistered).
  ensureBotCommandsRegistered();

  const text = normalizeText(message.text, 1200);

  if (text.startsWith("/start")) {
    await handleStart(message, from, chatId, text);
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/orders")) {
    await handleOrders(from, chatId);
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/profile")) {
    await handleProfile(from, chatId);
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/find")) {
    await handleFind(chatId, text.slice("/find".length).trim());
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/help")) {
    await handleHelp(chatId);
    return NextResponse.json({ ok: true });
  }

  const contact = message.contact;
  if (contact?.phone_number) {
    const contactUserId = normalizeId(contact.user_id);
    if (contactUserId && contactUserId !== fromId) {
      await sendTelegramMessage(
        chatId,
        "Будь ласка, поділіться саме своїм номером телефону.",
        { replyMarkup: buildContactKeyboard() }
      );
      return NextResponse.json({ ok: true });
    }

    const phone = normalizePhone(contact.phone_number);
    if (!isValidPhone(phone)) {
      await askPhone(chatId);
      return NextResponse.json({ ok: true });
    }

    await handlePhone(message, from, chatId, phone);
    return NextResponse.json({ ok: true });
  }

  if (text) {
    const phone = normalizePhone(text);
    if (isValidPhone(phone)) {
      await handlePhone(message, from, chatId, phone);
      return NextResponse.json({ ok: true });
    }

    if (isValidEmail(text)) {
      await handleEmail(from, chatId, text.trim());
      return NextResponse.json({ ok: true });
    }
  }

  // Stray text from an already-onboarded user (profile complete) — treat it
  // as a product search instead of re-demanding phone/email they've already
  // given. This is what makes /find optional in practice: just typing a
  // part name or article works.
  const telegramId = normalizeId(from.id);
  const existingUserRef = await findUserByTelegramId(telegramId);
  const existingSnap = existingUserRef ? await existingUserRef.get() : null;
  const existingData = existingSnap?.exists ? existingSnap.data() : null;
  if (existingData?.phone && existingData?.email) {
    await handleFind(chatId, text);
    return NextResponse.json({ ok: true });
  }

  await sendTelegramMessage(
    chatId,
    "Для завершення профілю поділіться телефоном, а потім напишіть email.",
    { replyMarkup: buildContactKeyboard() }
  );
  return NextResponse.json({ ok: true });
}
