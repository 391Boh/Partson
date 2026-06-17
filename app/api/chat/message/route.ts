import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramNotification } from "app/lib/telegram-notify";

type ChatMessageType = "text" | "image";

const readString = (source: Record<string, unknown>, key: string, max = 500) => {
  const value = source[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

const readMessageType = (source: Record<string, unknown>): ChatMessageType | null => {
  const type = readString(source, "type", 40);
  if (type === "text" || type === "image") return type;
  return null;
};

const buildTelegramMessage = ({
  userId,
  text,
  type,
}: {
  userId: string;
  text: string;
  type: ChatMessageType;
}) =>
  [
    "Нове повідомлення в чаті PartsON",
    `Користувач: ${userId}`,
    `Тип: ${type === "image" ? "фото" : "текст"}`,
    text ? `Повідомлення: ${text}` : "",
  ]
    .filter(Boolean)
    .join("\n");

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "chat:message",
    limit: 25,
    windowMs: 60_000,
  });

  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 1_100_000 });
  if (!bodyResult.ok) {
    const badBody = NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
    setRateLimitHeaders(badBody.headers, rateResult);
    return badBody;
  }

  const body = bodyResult.value;
  const userId = readString(body, "userId", 160);
  const text = readString(body, "text", 1200);
  const type = readMessageType(body);

  if (!userId || !type || !text) {
    const invalid = NextResponse.json(
      { error: "Invalid chat message payload" },
      { status: 400 }
    );
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const messageData: Record<string, unknown> = {
    text,
    sender: "user",
    userId,
    createdAt: FieldValue.serverTimestamp(),
    textRead: true,
    type,
  };

  if (type === "image") {
    const imageUrl = readString(body, "imageUrl", 950_000);
    const imageName = readString(body, "imageName", 180) || "Фото";

    if (!imageUrl.startsWith("data:image/")) {
      const invalidImage = NextResponse.json(
        { error: "Invalid image payload" },
        { status: 400 }
      );
      setRateLimitHeaders(invalidImage.headers, rateResult);
      return invalidImage;
    }

    messageData.imageUrl = imageUrl;
    messageData.imageName = imageName;
  }

  try {
    const docRef = await getFirebaseAdminDb().collection("messages").add(messageData);
    const notification = await sendTelegramNotification(
      buildTelegramMessage({ userId, text, type })
    );

    if (!notification.ok) {
      console.error("Telegram chat notification failed:", notification.error);
    }

    const response = NextResponse.json({
      success: true,
      id: docRef.id,
      notified: notification.ok && notification.skipped !== true,
      notificationSkipped: notification.skipped === true,
    });
    setRateLimitHeaders(response.headers, rateResult);
    return response;
  } catch (error) {
    console.error("Failed to create chat message:", error);
    const failed = NextResponse.json(
      { error: "Failed to create chat message" },
      { status: 500 }
    );
    setRateLimitHeaders(failed.headers, rateResult);
    return failed;
  }
}
