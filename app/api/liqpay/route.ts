import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const PUBLIC_KEY =
  process.env.LIQPAY_PUBLIC_KEY || process.env.NEXT_PUBLIC_LIQPAY_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY || "";
const IS_SANDBOX =
  /^(1|true|yes)$/i.test(process.env.LIQPAY_SANDBOX || "") ||
  /^(1|true|yes)$/i.test(process.env.NEXT_PUBLIC_LIQPAY_SANDBOX || "");

function base64(str: string) {
  return Buffer.from(str).toString("base64");
}

function sha1(str: string) {
  return crypto.createHash("sha1").update(str).digest("base64");
}

export async function POST(req: NextRequest) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    return NextResponse.json(
      { error: "LiqPay keys are not configured on the server" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!body?.amount || !body?.order_id) {
    return NextResponse.json(
      { error: "Invalid LiqPay payload: amount and order_id are required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = {
    ...body,
    public_key: PUBLIC_KEY,
    ...(IS_SANDBOX ? { sandbox: 1 } : {}),
  };

  const data = base64(JSON.stringify(payload));
  const signature = sha1(PRIVATE_KEY + data + PRIVATE_KEY);

  return NextResponse.json(
    { data, signature },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
