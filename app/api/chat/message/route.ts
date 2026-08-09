import { after, NextRequest, NextResponse } from "next/server";
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

// A customer's first message after a gap this long starts a "fresh session" —
// only fresh sessions get the automatic reply, so it doesn't repeat on every
// message in an ongoing conversation.
const AUTO_REPLY_SESSION_GAP_MS = 20 * 60 * 1000;

const sendAutoReplyIfDue = async (userId: string) => {
  try {
    const db = getFirebaseAdminDb();
    const settingsSnap = await db.collection("chatSettings").doc("autoReply").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    const text = typeof settings?.text === "string" ? settings.text.trim() : "";
    if (!settings?.enabled || !text) return;

    const recentSnap = await db
      .collection("messages")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(2)
      .get();

    // Most recent doc is the message that was just written by this request;
    // the one before it (if any) tells us whether this is a fresh session.
    const previous = recentSnap.docs[1];
    const previousCreatedAt = previous?.get("createdAt") as
      | FirebaseFirestore.Timestamp
      | undefined;
    const isFreshSession =
      !previousCreatedAt ||
      Date.now() - previousCreatedAt.toMillis() > AUTO_REPLY_SESSION_GAP_MS;
    if (!isFreshSession) return;

    await db.collection("messages").add({
      text,
      sender: "manager",
      userId,
      createdAt: FieldValue.serverTimestamp(),
      textRead: false,
      readByUser: false,
      type: "text",
      autoReply: true,
    });
  } catch (error) {
    console.error("Auto-reply failed:", error);
  }
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
  const clientMessageId = readString(body, "clientMessageId", 120);

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

  if (clientMessageId) {
    messageData.clientMessageId = clientMessageId;
  }

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

    after(async () => {
      const notification = await sendTelegramNotification(
        buildTelegramMessage({ userId, text, type })
      );

      if (!notification.ok) {
        console.error("Telegram chat notification failed:", notification.error);
      }
    });

    after(() => sendAutoReplyIfDue(userId));

    const response = NextResponse.json({
      success: true,
      id: docRef.id,
      notificationQueued: true,
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
