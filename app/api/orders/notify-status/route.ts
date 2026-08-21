import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { isNonEmptyString, readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramMessage } from "app/lib/telegram-bot";
import { formatOrderBlock, type OrderFields } from "app/lib/telegram-order-message";
import { getSiteUrl } from "app/lib/site-url";

export const runtime = "nodejs";

// Fires the Telegram half of an order-status change made in the admin panel
// (see AdminChatPanel.tsx's markOrderShipped/markOrderCompleted, which call
// this right after their Firestore updateDoc). Most accounts won't have a
// linked Telegram chat — that's a normal, silent no-op here, never an error,
// since this must never block or fail the admin's action.
const STATUS_LABEL: Record<string, string> = {
  shipped: "🚚 Ваше замовлення відправлено",
  completed: "✅ Ваше замовлення виконано",
};

const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function POST(req: NextRequest) {
  const rl = checkRateLimit({ req, key: "orders-notify-status", limit: 60, windowMs: 60_000 });
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

  const bodyResult = await readJsonObject(req, { maxBytes: 2048 });
  if (!bodyResult.ok) return json({ ok: false, error: bodyResult.error }, bodyResult.status);

  const orderId =
    typeof bodyResult.value.orderId === "string" ? bodyResult.value.orderId.trim() : "";
  const status =
    typeof bodyResult.value.status === "string" ? bodyResult.value.status.trim() : "";
  if (!isNonEmptyString(orderId, { minLength: 1, maxLength: 200 }) || !STATUS_LABEL[status]) {
    return json({ ok: false, error: "orderId and a valid status are required" }, 400);
  }

  try {
    const db = getFirebaseAdminDb();
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) return json({ ok: true, skipped: true });

    const order = orderSnap.data() as OrderFields & { uid?: string };
    const uid = typeof order.uid === "string" ? order.uid : "";
    if (!uid) return json({ ok: true, skipped: true });

    const userSnap = await db.collection("users").doc(uid).get();
    const chatId = userSnap.exists ? (userSnap.data()?.telegramChatId as string | undefined) : undefined;
    if (!chatId) return json({ ok: true, skipped: true });

    const text = `<b>${STATUS_LABEL[status]}</b>\n\n${formatOrderBlock(orderId, order, getSiteUrl())}`;
    const result = await sendTelegramMessage(chatId, text, { parseMode: "HTML" });
    if (!result.ok) return json({ ok: true, skipped: true, error: result.error });

    return json({ ok: true });
  } catch (error) {
    console.error("Order status Telegram notification failed:", error);
    // Never surface this as a failure to the admin UI — the Firestore status
    // update already succeeded by the time this route is called.
    return json({ ok: true, skipped: true });
  }
}
