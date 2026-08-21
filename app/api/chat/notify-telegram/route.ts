import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { notifyTelegramChatMessage, type ChatNotifyPayload } from "app/lib/telegram-chat-notify";

export const runtime = "nodejs";

// Fires the Telegram half of a manager's chat reply (see AdminChatPanel.tsx's
// sendReply/sendProductCard, which call this right after their Firestore
// addDoc). Most accounts won't have a linked Telegram chat — that's a
// normal, silent no-op here, never an error, since this must never block or
// fail the admin's action.
const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function POST(req: NextRequest) {
  const rl = checkRateLimit({ req, key: "chat-notify-telegram", limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return new NextResponse(JSON.stringify({ ok: false, error: "Too many requests" }), {
      status: 429,
      headers,
    });
  }

  const admin = await verifyAdminRequest(req);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  const bodyResult = await readJsonObject(req, { maxBytes: 4096 });
  if (!bodyResult.ok) return json({ ok: false, error: bodyResult.error }, bodyResult.status);

  const body = bodyResult.value;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";
  if (!isNonEmptyString(userId, { minLength: 1, maxLength: 200 })) {
    return json({ ok: false, error: "userId is required" }, 400);
  }

  let payload: ChatNotifyPayload | null = null;
  if (type === "text" && typeof body.text === "string" && body.text.trim()) {
    payload = { type: "text", text: body.text.trim().slice(0, 3500) };
  } else if (type === "image" && typeof body.imageUrl === "string" && body.imageUrl.trim()) {
    payload = {
      type: "image",
      imageUrl: body.imageUrl.trim(),
      text: typeof body.text === "string" ? body.text.trim().slice(0, 900) : undefined,
    };
  } else if (type === "product" && body.product && typeof body.product === "object") {
    const p = body.product as Record<string, unknown>;
    payload = {
      type: "product",
      product: {
        name: typeof p.name === "string" ? p.name : undefined,
        code: typeof p.code === "string" ? p.code : undefined,
        article: typeof p.article === "string" ? p.article : undefined,
        producer: typeof p.producer === "string" ? p.producer : undefined,
        quantity: typeof p.quantity === "number" ? p.quantity : undefined,
        price: typeof p.price === "number" ? p.price : undefined,
        link: typeof p.link === "string" ? p.link : undefined,
      },
    };
  }

  if (!payload) return json({ ok: false, error: "Invalid notification payload" }, 400);

  try {
    const result = await notifyTelegramChatMessage(userId, payload);
    return json(result);
  } catch (error) {
    console.error("Chat Telegram notification failed:", error);
    // Never surface this as a failure to the admin UI — the Firestore write
    // already succeeded by the time this route is called.
    return json({ ok: true, skipped: true });
  }
}
