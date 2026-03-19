import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit, setRateLimitHeaders } from "../../_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "../../_lib/requestValidation";

const DEFAULT_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;

type TelegramAuthPayload = {
  id?: number | string;
  first_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number | string;
  hash?: string;
  [key: string]: unknown;
};

function toInteger(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function timingSafeHexEqual(leftHex: string, rightHex: string) {
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function buildCheckString(data: TelegramAuthPayload) {
  return Object.keys(data)
    .filter((key) => key !== "hash" && data[key] != null)
    .sort()
    .map((key) => `${key}=${String(data[key])}`)
    .join("\n");
}

function verifyTelegramAuth(payload: TelegramAuthPayload, token: string) {
  const incomingHash = typeof payload.hash === "string" ? payload.hash.trim() : "";
  if (!/^[a-fA-F0-9]{64}$/.test(incomingHash)) return false;

  const checkString = buildCheckString(payload);
  const secret = crypto.createHash("sha256").update(token).digest();
  const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  return timingSafeHexEqual(hmac, incomingHash.toLowerCase());
}

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "telegram:auth",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const botTokenRaw = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!isNonEmptyString(botTokenRaw, { maxLength: 256 })) {
    const misconfigured = NextResponse.json(
      { error: "Telegram bot token is not configured" },
      { status: 500 }
    );
    setRateLimitHeaders(misconfigured.headers, rateResult);
    return misconfigured;
  }
  const botToken = String(botTokenRaw);

  const bodyResult = await readJsonObject(req, { maxBytes: 12_000 });
  if (!bodyResult.ok) {
    const badBody = NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
    setRateLimitHeaders(badBody.headers, rateResult);
    return badBody;
  }

  const payload = bodyResult.value as TelegramAuthPayload;
  const authDate = toInteger(payload.auth_date);
  const userId = toInteger(payload.id);
  const firstName =
    typeof payload.first_name === "string" ? payload.first_name.trim() : "";
  const hash = typeof payload.hash === "string" ? payload.hash.trim() : "";

  if (!authDate || !userId || !firstName || !hash) {
    const invalid = NextResponse.json(
      { error: "Invalid Telegram payload" },
      { status: 400 }
    );
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAgeRaw = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS);
  const maxAgeSeconds =
    Number.isFinite(maxAgeRaw) && maxAgeRaw > 0
      ? Math.floor(maxAgeRaw)
      : DEFAULT_AUTH_MAX_AGE_SECONDS;

  if (now - authDate > maxAgeSeconds) {
    const expired = NextResponse.json(
      { error: "Telegram auth payload is expired" },
      { status: 403 }
    );
    setRateLimitHeaders(expired.headers, rateResult);
    return expired;
  }

  if (!verifyTelegramAuth(payload, botToken)) {
    const forbidden = NextResponse.json(
      { error: "Invalid Telegram signature" },
      { status: 403 }
    );
    setRateLimitHeaders(forbidden.headers, rateResult);
    return forbidden;
  }

  const response = NextResponse.json({
    success: true,
    user: {
      id: userId,
      first_name: firstName,
      username:
        typeof payload.username === "string" ? payload.username : undefined,
      photo_url:
        typeof payload.photo_url === "string" ? payload.photo_url : undefined,
    },
    link:
      typeof process.env.TELEGRAM_AUTH_REDIRECT_LINK === "string"
        ? process.env.TELEGRAM_AUTH_REDIRECT_LINK
        : null,
  });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
