import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { dispatchInboundChatSideEffects } from "app/lib/chat-message";

export const runtime = "nodejs";

// Lean companion to the site chat widget: the widget now writes the message
// straight to Firestore (client SDK, latency-compensated — the message
// reads as "sent" instantly), then calls this fire-and-forget so the admin
// notification / auto-reply / bot reply-thread mapping still happen
// server-side. It deliberately does NOT write the message — that already
// happened on the client.
export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "chat:inbound-notify",
    limit: 40,
    windowMs: 60_000,
  });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 4096 });
  if (!bodyResult.ok) {
    return NextResponse.json({ ok: false, error: bodyResult.error }, { status: bodyResult.status });
  }

  const body = bodyResult.value;
  const userId = typeof body.userId === "string" ? body.userId.trim().slice(0, 160) : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1200) : "";
  const type = body.type === "image" ? "image" : "text";

  if (!userId || !text) {
    const invalid = NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  try {
    await dispatchInboundChatSideEffects({ userId, text, type });
  } catch (error) {
    console.error("Inbound chat notify failed:", error);
    const failed = NextResponse.json({ ok: false }, { status: 500 });
    setRateLimitHeaders(failed.headers, rateResult);
    return failed;
  }

  const response = NextResponse.json({ ok: true });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
