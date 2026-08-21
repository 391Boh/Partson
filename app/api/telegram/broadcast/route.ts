import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getFirebaseAdminBucket, getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramMessage, sendTelegramPhoto } from "app/lib/telegram-bot";
import { escapeTelegramHtml } from "app/lib/telegram-order-message";

export const runtime = "nodejs";

// Manual, admin-triggered broadcast to every customer who has linked the bot
// (has a telegramChatId on their users/{uid} doc — set the moment they ever
// hit /start). Sent in small concurrent batches, well under Telegram's
// ~30 messages/sec global rate limit, so a large recipient list doesn't
// trip Telegram's flood control.
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1100;
const MAX_TEXT_LENGTH = 3500;
// Telegram's photo caption cap is much shorter than a plain message's.
const MAX_CAPTION_LENGTH = 1000;
const MAX_TITLE_LENGTH = 100;
const DEFAULT_TITLE = "PartsON";
const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
const DATA_URI_REGEX =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/\r\n=]+)$/i;

const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One-time upload of the broadcast image (same token-URL Storage pattern as
// app/api/product-gallery/route.ts) so every recipient's sendPhoto call can
// reuse the same public URL instead of re-uploading per chat.
const uploadBroadcastImage = async (imageDataUrl: string): Promise<string | null> => {
  const match = DATA_URI_REGEX.exec(imageDataUrl);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2].replace(/[\r\n\s]/g, "");
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "jpg";

  const buffer = Buffer.from(base64Data, "base64");
  const objectPath = `broadcasts/${Date.now().toString(36)}-${randomUUID()}.${ext}`;
  const bucket = getFirebaseAdminBucket();
  const downloadToken = randomUUID();

  await bucket.file(objectPath).save(buffer, {
    contentType: mimeType,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
    resumable: false,
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
};

export async function POST(req: NextRequest) {
  const rl = checkRateLimit({ req, key: "telegram-broadcast", limit: 5, windowMs: 60_000 });
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

  const rawBody = await req.text().catch(() => "");
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "Payload too large (max ~3 MB)" }, 413);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const rawText = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!rawText) return json({ ok: false, error: "text is required" }, 400);

  const rawTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const title = (rawTitle || DEFAULT_TITLE).slice(0, MAX_TITLE_LENGTH);

  const imageDataUrl = typeof parsed.imageDataUrl === "string" ? parsed.imageDataUrl.trim() : "";

  try {
    let imageUrl: string | null = null;
    if (imageDataUrl) {
      imageUrl = await uploadBroadcastImage(imageDataUrl);
      if (!imageUrl) {
        return json(
          { ok: false, error: "imageDataUrl must be a valid data URI (jpeg/png/webp/gif)" },
          400
        );
      }
    }

    const maxLength = imageUrl ? MAX_CAPTION_LENGTH : MAX_TEXT_LENGTH;
    const body = `<b>📢 ${escapeTelegramHtml(title)}</b>\n\n${escapeTelegramHtml(rawText.slice(0, maxLength))}`;

    const db = getFirebaseAdminDb();
    const snap = await db
      .collection("users")
      .where("telegramChatId", ">", "")
      .select("telegramChatId")
      .get();

    const chatIds = Array.from(
      new Set(
        snap.docs
          .map((doc) => doc.data().telegramChatId as string | undefined)
          .filter((value): value is string => Boolean(value))
      )
    );

    let sent = 0;
    for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
      const batch = chatIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((chatId) =>
          imageUrl
            ? sendTelegramPhoto(chatId, imageUrl, body, { parseMode: "HTML" })
            : sendTelegramMessage(chatId, body, { parseMode: "HTML" })
        )
      );
      sent += results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
      if (i + BATCH_SIZE < chatIds.length) await sleep(BATCH_DELAY_MS);
    }

    return json({ ok: true, sent, total: chatIds.length });
  } catch (error) {
    console.error("Telegram broadcast failed:", error);
    return json({ ok: false, error: "Broadcast failed" }, 500);
  }
}
