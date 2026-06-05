import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { checkRateLimit, setRateLimitHeaders } from "../_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "../_lib/requestValidation";

const normalizeOrigin = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
};

const getRequestHostOrigin = (req: NextRequest): string => {
  const host = req.headers.get("host") || "";
  if (!host) return "";

  const forwardedProto = req.headers.get("x-forwarded-proto") || "";
  const requestProtocol = req.nextUrl.protocol.replace(/:$/, "");
  const proto = forwardedProto || requestProtocol || "https";

  return normalizeOrigin(`${proto}://${host}`);
};

const getAllowedOrigins = (req?: NextRequest): Set<string> => {
  const origins = new Set<string>();

  if (req) {
    const requestHostOrigin = getRequestHostOrigin(req);
    if (requestHostOrigin) origins.add(requestHostOrigin);

    const requestOrigin = normalizeOrigin(req.headers.get("origin") || "");
    if (requestOrigin) origins.add(requestOrigin);
  }

  for (const raw of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!raw) continue;
    const origin = normalizeOrigin(raw);
    if (origin) origins.add(origin);
  }

  return origins;
};

const isAllowedLiqPayUrl = (value: string, req?: NextRequest): boolean => {
  const allowedOrigins = getAllowedOrigins(req);
  if (allowedOrigins.size === 0) return false;

  try {
    return allowedOrigins.has(new URL(value).origin);
  } catch {
    return false;
  }
};

const getFallbackOrigin = (req?: NextRequest): string => {
  if (req) {
    const requestHostOrigin = getRequestHostOrigin(req);
    if (requestHostOrigin) return requestHostOrigin;

    const requestOrigin = normalizeOrigin(req.headers.get("origin") || "");
    if (requestOrigin) return requestOrigin;
  }

  for (const raw of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!raw) continue;
    const origin = normalizeOrigin(raw);
    if (origin) return origin;
  }

  return "";
};

const buildSameOriginUrl = (
  value: string,
  fallbackPath: string,
  req?: NextRequest
) => {
  const fallbackOrigin = getFallbackOrigin(req);
  if (fallbackOrigin) {
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.origin === fallbackOrigin
        ? parsedUrl.toString()
        : new URL(fallbackPath, fallbackOrigin).toString();
    } catch {
      return new URL(fallbackPath, fallbackOrigin).toString();
    }
  }

  if (isAllowedLiqPayUrl(value, req)) return value;

  try {
    return new URL(fallbackPath, fallbackOrigin).toString();
  } catch {
    return value;
  }
};

const sha1Base64 = (value: string) =>
  crypto.createHash("sha1").update(value).digest("base64");

const encodeData = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload)).toString("base64");

const readBooleanEnv = (value: string | undefined) => {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const readString = (
  body: Record<string, unknown>,
  key: string,
  fallback = ""
) => {
  const value = body[key];
  return typeof value === "string" ? value.trim() : fallback;
};

const readAmount = (value: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(numeric.toFixed(2));
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "liqpay:init",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const publicKey = process.env.LIQPAY_PUBLIC_KEY;
  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  if (
    !isNonEmptyString(publicKey, { maxLength: 256 }) ||
    !isNonEmptyString(privateKey, { maxLength: 256 })
  ) {
    const misconfigured = NextResponse.json(
      { error: "LiqPay keys are not configured" },
      { status: 500 }
    );
    setRateLimitHeaders(misconfigured.headers, rateResult);
    return misconfigured;
  }
  const normalizedPublicKey = publicKey!.trim();
  const normalizedPrivateKey = privateKey!.trim();
  const isSandboxMode = readBooleanEnv(process.env.LIQPAY_SANDBOX);
  const hasSandboxKeys =
    normalizedPublicKey.startsWith("sandbox_") ||
    normalizedPrivateKey.startsWith("sandbox_");

  if (!isSandboxMode && hasSandboxKeys) {
    const misconfigured = NextResponse.json(
      {
        error:
          "LiqPay live mode requires production keys. Replace sandbox_ keys and keep LIQPAY_SANDBOX=0.",
      },
      { status: 500 }
    );
    setRateLimitHeaders(misconfigured.headers, rateResult);
    return misconfigured;
  }

  const parsed = await readJsonObject(req, { maxBytes: 8_192 });
  if (!parsed.ok) {
    const invalid = NextResponse.json({ error: parsed.error }, { status: parsed.status });
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const body = parsed.value;
  const amount = readAmount(body.amount);
  const orderId = readString(body, "order_id");
  const description = readString(body, "description", `Оплата замовлення ${orderId}`);
  const requestedResultUrl = readString(body, "result_url");
  const requestedServerUrl = readString(body, "server_url");
  const resultUrl = buildSameOriginUrl(requestedResultUrl, "/success", req);
  const serverUrl = buildSameOriginUrl(
    requestedServerUrl,
    "/api/liqpay/callback",
    req
  );

  if (
    amount == null ||
    !isNonEmptyString(orderId, { maxLength: 128 }) ||
    !isNonEmptyString(description, { maxLength: 255 }) ||
    !isNonEmptyString(requestedResultUrl, { maxLength: 2048 }) ||
    !isNonEmptyString(requestedServerUrl, { maxLength: 2048 }) ||
    !isNonEmptyString(resultUrl, { maxLength: 2048 }) ||
    !isNonEmptyString(serverUrl, { maxLength: 2048 })
  ) {
    const invalid = NextResponse.json(
      { error: "Invalid LiqPay payment payload" },
      { status: 400 }
    );
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  if (!isAllowedLiqPayUrl(resultUrl, req) || !isAllowedLiqPayUrl(serverUrl, req)) {
    const forbidden = NextResponse.json(
      { error: "result_url and server_url must belong to the site origin" },
      { status: 400 }
    );
    setRateLimitHeaders(forbidden.headers, rateResult);
    return forbidden;
  }

  const payload: Record<string, unknown> = {
    version: 3,
    public_key: normalizedPublicKey,
    action: readString(body, "action", "pay") || "pay",
    amount,
    currency: readString(body, "currency", "UAH") || "UAH",
    description,
    order_id: orderId,
    language: readString(body, "language", "uk") || "uk",
    result_url: resultUrl,
    server_url: serverUrl,
  };

  const info = readString(body, "info");
  if (info) {
    payload.info = info;
  }

  if (isSandboxMode) {
    payload.sandbox = 1;
  }

  const data = encodeData(payload);
  const signature = sha1Base64(normalizedPrivateKey + data + normalizedPrivateKey);
  const response = NextResponse.json({ data, signature });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
