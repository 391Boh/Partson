import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { checkRateLimit, setRateLimitHeaders } from "../../_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "../../_lib/requestValidation";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  buildTelegramBotDeepLink,
  isTelegramBotConfigured,
  sendTelegramMessage,
} from "app/lib/telegram-bot";

const PROFILE_TOKEN_TTL_MS = 15 * 60 * 1000;

const readString = (source: Record<string, unknown>, key: string, max = 4000) => {
  const value = source[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

const normalizeTelegramId = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).replace(/^telegram_/u, "").trim()
    : "";

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

const createProfileToken = () => crypto.randomBytes(24).toString("base64url");

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "telegram:profile-request",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 24_000 });
  if (!bodyResult.ok) {
    const badBody = NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
    setRateLimitHeaders(badBody.headers, rateResult);
    return badBody;
  }

  const idToken = readString(bodyResult.value, "idToken", 20_000);
  if (!isNonEmptyString(idToken, { maxLength: 20_000 })) {
    const invalid = NextResponse.json({ error: "Missing Firebase ID token" }, { status: 400 });
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  let decodedToken: Awaited<ReturnType<ReturnType<typeof getFirebaseAdminAuth>["verifyIdToken"]>>;
  try {
    decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Failed to verify Firebase ID token for Telegram profile:", error);
    const unauthorized = NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    setRateLimitHeaders(unauthorized.headers, rateResult);
    return unauthorized;
  }

  if (!isTelegramBotConfigured()) {
    const response = NextResponse.json({
      success: false,
      sent: false,
      botLink: "",
      error: "Telegram bot is not configured",
    });
    setRateLimitHeaders(response.headers, rateResult);
    return response;
  }

  const db = getFirebaseAdminDb();
  const userRef = db.collection("users").doc(decodedToken.uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const telegramId =
    normalizeTelegramId(userData.telegramId) ||
    normalizeTelegramId(decodedToken.telegram_id) ||
    normalizeTelegramId(decodedToken.uid);
  const telegramChatId =
    normalizeTelegramId(userData.telegramChatId) || telegramId;
  const profileToken = createProfileToken();
  const profileTokenExpiresAt = new Date(Date.now() + PROFILE_TOKEN_TTL_MS).toISOString();
  const botLink = buildTelegramBotDeepLink(`profile_${profileToken}`);

  await userRef.set(
    {
      telegramProfileToken: profileToken,
      telegramProfileTokenExpiresAt: profileTokenExpiresAt,
      updatedAt: new Date().toISOString(),
      ...(telegramId ? { telegramId } : {}),
    },
    { merge: true }
  );

  let sent = false;
  let sendError = "";
  if (telegramChatId) {
    const result = await sendTelegramMessage(
      telegramChatId,
      [
        "PartsON: завершуємо профіль.",
        "Натисніть кнопку нижче, щоб поділитися телефоном. Потім я попрошу email.",
      ].join("\n"),
      { replyMarkup: buildContactKeyboard() }
    );
    sent = result.ok;
    sendError = result.error || "";

    if (sent) {
      await userRef.set(
        {
          telegramChatId,
          telegramProfileStep: "awaiting_phone",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  }

  const response = NextResponse.json({
    success: true,
    sent,
    botLink,
    error: sent ? "" : sendError,
  });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
