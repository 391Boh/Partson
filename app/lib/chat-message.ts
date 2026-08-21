import "server-only";

import { after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramNotification } from "app/lib/telegram-notify";

export type ChatMessageType = "text" | "image";

export type CreateChatMessageInput = {
  userId: string;
  text: string;
  type: ChatMessageType;
  imageUrl?: string;
  imageName?: string;
  clientMessageId?: string;
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

// Shared by /api/chat/message (site widget) and the Telegram bot's support
// mode, so both write into the exact same messages collection/shape and get
// the same auto-reply + shop-notify behavior.
export const createChatMessageServer = async (
  input: CreateChatMessageInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  const { userId, text, type, imageUrl, imageName, clientMessageId } = input;
  if (!userId || !type || !text) {
    return { ok: false, error: "Invalid chat message payload" };
  }
  if (type === "image" && !imageUrl) {
    return { ok: false, error: "Invalid image payload" };
  }

  const messageData: Record<string, unknown> = {
    text,
    sender: "user",
    userId,
    createdAt: FieldValue.serverTimestamp(),
    textRead: true,
    type,
  };
  if (clientMessageId) messageData.clientMessageId = clientMessageId;
  if (type === "image") {
    messageData.imageUrl = imageUrl;
    messageData.imageName = imageName || "Фото";
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

    return { ok: true, id: docRef.id };
  } catch (error) {
    console.error("Failed to create chat message:", error);
    return { ok: false, error: "Failed to create chat message" };
  }
};
