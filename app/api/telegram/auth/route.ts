import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit, setRateLimitHeaders } from "../../_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "../../_lib/requestValidation";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

const DEFAULT_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_JWKS_URL = `${TELEGRAM_OIDC_ISSUER}/.well-known/jwks.json`;
const TELEGRAM_JWKS_CACHE_MS = 60 * 60 * 1000;

type TelegramAuthPayload = {
  id?: number | string;
  first_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number | string;
  hash?: string;
  id_token?: string;
  user?: {
    id?: number | string;
    name?: string;
    username?: string;
    preferred_username?: string;
    picture?: string;
    photo_url?: string;
  };
  [key: string]: unknown;
};

type TelegramOidcClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  id?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  picture?: unknown;
};

type TelegramJwk = crypto.JsonWebKey & {
  kid?: string;
  alg?: string;
};

let jwksCache: { keys: TelegramJwk[]; expiresAt: number } | null = null;

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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function decodeJwtPart<T>(value: string) {
  return JSON.parse(decodeBase64Url(value).toString("utf8")) as T;
}

function getTelegramAudiences() {
  return [
    process.env.TELEGRAM_CLIENT_ID,
    process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID,
    process.env.TELEGRAM_BOT_TOKEN?.split(":")[0],
    process.env.BOT_TOKEN?.split(":")[0],
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

async function getTelegramJwks() {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const response = await fetch(TELEGRAM_JWKS_URL, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!response.ok) {
    throw new Error("Telegram JWKS request failed");
  }

  const data = (await response.json()) as { keys?: TelegramJwk[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = {
    keys,
    expiresAt: now + TELEGRAM_JWKS_CACHE_MS,
  };
  return keys;
}

function verifyJwtSignature(
  signingInput: string,
  signature: Buffer,
  jwk: TelegramJwk,
  alg: string
) {
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const payload = Buffer.from(signingInput);

  if (alg === "RS256") {
    return crypto.verify("RSA-SHA256", payload, key, signature);
  }

  if (alg === "ES256" || alg === "ES256K") {
    return crypto.verify(
      "SHA256",
      payload,
      { key, dsaEncoding: "ieee-p1363" },
      signature
    );
  }

  if (alg === "EdDSA") {
    return crypto.verify(null, payload, key, signature);
  }

  throw new Error(`Unsupported Telegram id_token algorithm: ${alg}`);
}

async function verifyTelegramOidcToken(idToken: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid Telegram id_token");
  }

  const header = decodeJwtPart<{ alg?: string; kid?: string }>(encodedHeader);
  if (!header.alg || !header.kid) {
    throw new Error("Unsupported Telegram id_token signature");
  }

  const keys = await getTelegramJwks();
  const jwk = keys.find(
    (key) => key.kid === header.kid && (!key.alg || key.alg === header.alg)
  );
  if (!jwk) {
    throw new Error("Telegram signing key not found");
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signatureIsValid = verifyJwtSignature(
    signingInput,
    decodeBase64Url(encodedSignature),
    jwk,
    header.alg
  );
  if (!signatureIsValid) {
    throw new Error("Invalid Telegram id_token signature");
  }

  const claims = decodeJwtPart<TelegramOidcClaims>(encodedPayload);
  const audiences = getTelegramAudiences();
  const tokenAudiences = Array.isArray(claims.aud)
    ? claims.aud.map(String)
    : [String(claims.aud || "")];
  const now = Math.floor(Date.now() / 1000);

  if (claims.iss !== TELEGRAM_OIDC_ISSUER) {
    throw new Error("Invalid Telegram id_token issuer");
  }
  if (!audiences.length || !audiences.some((aud) => tokenAudiences.includes(aud))) {
    throw new Error("Invalid Telegram id_token audience");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new Error("Telegram id_token is expired");
  }

  const telegramId = String(claims.id || claims.sub || "").trim();
  if (!telegramId) {
    throw new Error("Telegram id_token has no user id");
  }

  return {
    id: telegramId,
    first_name:
      typeof claims.name === "string" && claims.name.trim()
        ? claims.name.trim()
        : "Telegram користувач",
    username:
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : "",
    photo_url: typeof claims.picture === "string" ? claims.picture : "",
  };
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

  const bodyResult = await readJsonObject(req, { maxBytes: 32_000 });
  if (!bodyResult.ok) {
    const badBody = NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
    setRateLimitHeaders(badBody.headers, rateResult);
    return badBody;
  }

  const payload = bodyResult.value as TelegramAuthPayload;

  const idToken = typeof payload.id_token === "string" ? payload.id_token : "";
  if (isNonEmptyString(idToken, { maxLength: 20_000 })) {
    let telegramUser: Awaited<ReturnType<typeof verifyTelegramOidcToken>>;
    try {
      telegramUser = await verifyTelegramOidcToken(idToken);
    } catch (error) {
      console.error("Failed to verify Telegram OIDC token:", error);
      const invalidOidc = NextResponse.json(
        { error: "Invalid Telegram login token" },
        { status: 403 }
      );
      setRateLimitHeaders(invalidOidc.headers, rateResult);
      return invalidOidc;
    }

    let firebaseToken = "";
    try {
      firebaseToken = await getFirebaseAdminAuth().createCustomToken(
        `telegram_${telegramUser.id}`,
        {
          provider: "telegram",
          telegram_id: String(telegramUser.id),
          telegram_username: telegramUser.username,
        }
      );
    } catch (error) {
      console.error("Failed to create Telegram Firebase custom token:", error);
      const failed = NextResponse.json(
        { error: "Firebase Admin is not configured for Telegram auth" },
        { status: 500 }
      );
      setRateLimitHeaders(failed.headers, rateResult);
      return failed;
    }

    const response = NextResponse.json({
      success: true,
      firebaseToken,
      user: telegramUser,
      link:
        typeof process.env.TELEGRAM_AUTH_REDIRECT_LINK === "string"
          ? process.env.TELEGRAM_AUTH_REDIRECT_LINK
          : null,
    });
    setRateLimitHeaders(response.headers, rateResult);
    return response;
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

  let firebaseToken = "";
  try {
    firebaseToken = await getFirebaseAdminAuth().createCustomToken(
      `telegram_${userId}`,
      {
        provider: "telegram",
        telegram_id: String(userId),
        telegram_username:
          typeof payload.username === "string" ? payload.username : "",
      }
    );
  } catch (error) {
    console.error("Failed to create Telegram Firebase custom token:", error);
    const failed = NextResponse.json(
      { error: "Firebase Admin is not configured for Telegram auth" },
      { status: 500 }
    );
    setRateLimitHeaders(failed.headers, rateResult);
    return failed;
  }

  const response = NextResponse.json({
    success: true,
    firebaseToken,
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
