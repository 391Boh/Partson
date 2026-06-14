import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_TOKEN_URL = "https://oauth.telegram.org/token";
const STATE_COOKIE = "partson_tg_oidc_state";
const VERIFIER_COOKIE = "partson_tg_oidc_verifier";

type TelegramTokenResponse = {
  id_token?: unknown;
  error?: unknown;
  error_description?: unknown;
};

const pickForwardedValue = (value: string | null) =>
  (value || "").split(",")[0]?.trim();

const getSiteOrigin = (req: NextRequest) => {
  const configured =
    (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/g, "");

  const forwardedProto = pickForwardedValue(req.headers.get("x-forwarded-proto"));
  const forwardedHost = pickForwardedValue(req.headers.get("x-forwarded-host"));
  const host = forwardedHost || pickForwardedValue(req.headers.get("host"));
  const proto = forwardedProto || req.nextUrl.protocol.replace(/:$/g, "") || "https";

  if (host) return `${proto}://${host}`.replace(/\/+$/g, "");

  return "";
};

const getClientId = () =>
  process.env.TELEGRAM_CLIENT_ID?.trim() ||
  process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID?.trim() ||
  process.env.TELEGRAM_BOT_TOKEN?.split(":")[0]?.trim() ||
  process.env.BOT_TOKEN?.split(":")[0]?.trim() ||
  "";

const getClientSecret = () => process.env.TELEGRAM_CLIENT_SECRET?.trim() || "";

const popupResponse = (
  siteOrigin: string,
  payload: Record<string, string>,
  status = 200
) =>
  new NextResponse(
    `<!doctype html>
<html lang="uk">
<head><meta charset="utf-8"><title>Telegram Login</title></head>
<body>
<p id="status">Завершуємо Telegram-вхід...</p>
<script>
  (function () {
    var payload = ${JSON.stringify({
      source: "partson:telegram-login",
      ...payload,
    })};
    try {
      localStorage.setItem("partson:telegram-login", JSON.stringify(payload));
    } catch (error) {}
    try {
      var channel = new BroadcastChannel("partson:telegram-login");
      channel.postMessage(payload);
      setTimeout(function () { channel.close(); }, 800);
    } catch (error) {}
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, ${JSON.stringify(siteOrigin)});
    }
    setTimeout(function () {
      window.close();
      var status = document.getElementById("status");
      if (status) status.textContent = "Вхід завершено. Можна закрити це вікно.";
    }, 900);
  })();
</script>
<p>Якщо вікно не закрилось автоматично, поверніться на сайт.</p>
</body>
</html>`,
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );

export async function GET(req: NextRequest) {
  const siteOrigin = getSiteOrigin(req);
  const searchParams = req.nextUrl.searchParams;
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const codeVerifier = req.cookies.get(VERIFIER_COOKIE)?.value;
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const redirectUri = `${siteOrigin}/api/telegram/oidc/callback`;

  const clearCookies = (response: NextResponse) => {
    response.cookies.set(STATE_COOKIE, "", {
      maxAge: 0,
      path: "/api/telegram/oidc",
    });
    response.cookies.set(VERIFIER_COOKIE, "", {
      maxAge: 0,
      path: "/api/telegram/oidc",
    });
    return response;
  };

  if (error) {
    return clearCookies(
      popupResponse(siteOrigin, { error: "telegram_cancelled" }, 400)
    );
  }

  if (!code || !state || !expectedState || !codeVerifier || state !== expectedState) {
    return clearCookies(
      popupResponse(siteOrigin, { error: "telegram_state_invalid" }, 400)
    );
  }

  if (!clientId || !clientSecret) {
    return clearCookies(
      popupResponse(siteOrigin, { error: "telegram_oidc_not_configured" }, 500)
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  let tokenData: TelegramTokenResponse = {};
  try {
    const tokenResponse = await fetch(TELEGRAM_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    tokenData = (await tokenResponse.json().catch(() => ({}))) as TelegramTokenResponse;
    if (!tokenResponse.ok || typeof tokenData.id_token !== "string") {
      console.error("Telegram OIDC token exchange failed:", tokenData);
      return clearCookies(
        popupResponse(siteOrigin, { error: "telegram_token_exchange_failed" }, 403)
      );
    }
  } catch (exchangeError) {
    console.error("Telegram OIDC token exchange error:", exchangeError);
    return clearCookies(
      popupResponse(siteOrigin, { error: "telegram_token_exchange_failed" }, 500)
    );
  }

  return clearCookies(
    popupResponse(siteOrigin, { id_token: tokenData.id_token })
  );
}
