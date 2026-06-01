import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const TELEGRAM_AUTH_URL = "https://oauth.telegram.org/auth";
const COOKIE_MAX_AGE_SECONDS = 10 * 60;
const STATE_COOKIE = "partson_tg_oidc_state";
const VERIFIER_COOKIE = "partson_tg_oidc_verifier";

const base64Url = (value: Buffer) =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const getSiteOrigin = (req: NextRequest) => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
  if (configured) return configured.replace(/\/+$/g, "");

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `${proto}://${host}`;
};

const getClientId = () =>
  process.env.TELEGRAM_CLIENT_ID?.trim() ||
  process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID?.trim() ||
  process.env.TELEGRAM_BOT_TOKEN?.split(":")[0]?.trim() ||
  process.env.BOT_TOKEN?.split(":")[0]?.trim() ||
  "";

export async function GET(req: NextRequest) {
  const clientId = getClientId();
  if (!clientId) {
    return new NextResponse("Telegram client id is not configured", {
      status: 500,
    });
  }

  const siteOrigin = getSiteOrigin(req);
  const redirectUri = `${siteOrigin}/api/telegram/oidc/callback`;
  const state = base64Url(crypto.randomBytes(32));
  const codeVerifier = base64Url(crypto.randomBytes(64));
  const codeChallenge = base64Url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const authUrl = new URL(TELEGRAM_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl);
  const secure = siteOrigin.startsWith("https://");
  const cookieOptions = {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/api/telegram/oidc",
    sameSite: "lax" as const,
    secure,
  };

  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE, codeVerifier, cookieOptions);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
