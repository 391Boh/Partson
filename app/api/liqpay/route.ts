import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { checkRateLimit, setRateLimitHeaders } from "../_lib/rateLimit";
import { isNonEmptyString, readJsonObject } from "../_lib/requestValidation";

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
  const resultUrl = readString(body, "result_url");
  const serverUrl = readString(body, "server_url");

  if (
    amount == null ||
    !isNonEmptyString(orderId, { maxLength: 128 }) ||
    !isNonEmptyString(description, { maxLength: 255 }) ||
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

  if (readBooleanEnv(process.env.LIQPAY_SANDBOX)) {
    payload.sandbox = 1;
  }

  const data = encodeData(payload);
  const signature = sha1Base64(normalizedPrivateKey + data + normalizedPrivateKey);
  const response = NextResponse.json({ data, signature });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
