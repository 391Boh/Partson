import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { readJsonObject } from "../../_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramMessage } from "app/lib/telegram-bot";

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
    await sendTelegramMessage(
      chatId,
      "Спочатку увійдіть через Telegram на сайті PartsON, а потім відкрийте це посилання ще раз.",
      { replyMarkup: removeKeyboard() }
    );
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

  const text = normalizeText(message.text, 1200);

  if (text.startsWith("/start")) {
    await handleStart(message, from, chatId, text);
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

  await sendTelegramMessage(
    chatId,
    "Для завершення профілю поділіться телефоном, а потім напишіть email.",
    { replyMarkup: buildContactKeyboard() }
  );
  return NextResponse.json({ ok: true });
}
