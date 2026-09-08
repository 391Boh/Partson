import "server-only";

import { after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendAdminInboundNotification } from "app/lib/telegram-bot";
import { notifyTelegramChatMessage, type ChatNotifyPayload } from "app/lib/telegram-chat-notify";

export type ChatMessageType = "text" | "image";

export type CreateChatMessageInput = {
  userId: string;
  text: string;
  type: ChatMessageType;
  imageUrl?: string;
  imageName?: string;
  clientMessageId?: string;
  // Run the admin notification / auto-reply / bot reply-thread mapping
  // inline (awaited) instead of via next/server `after()`. The Telegram bot
  // webhook already does its work inside `after()`, and a nested `after()`
  // there is not guaranteed to run — so the bot's support relay passes this
  // to make sure the admin still gets a replyable notification for a
  // message that came in through Telegram.
  runSideEffectsInline?: boolean;
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

// Lean on purpose. The reply UX is the "✍️ Відповісти клієнту" button under
// this message (sendAdminInboundNotification); a native Telegram Reply on
// it also works.
const buildTelegramMessage = ({
  text,
  type,
}: {
  text: string;
  type: ChatMessageType;
}) =>
  [
    "💬 Нове повідомлення від клієнта",
    "",
    text || (type === "image" ? "🖼 Фото" : "(без тексту)"),
    "",
    "Щоб відповісти — натисніть кнопку нижче або зробіть Reply на це повідомлення.",
  ].join("\n");

// Manager → customer, written from the Telegram bot's admin-reply flow
// (app/api/telegram/bot/route.ts handleAdminReply). Same message shape as
// AdminChatPanel.tsx's sendReply, plus the Telegram relay to the customer.
export const createManagerChatMessageServer = async (input: {
  userId: string;
  text: string;
  type?: ChatMessageType;
  imageUrl?: string;
  imageName?: string;
}): Promise<
  | { ok: true; id: string; telegramDelivered: boolean }
  | { ok: false; error: string }
> => {
  const { userId, text, type = "text", imageUrl, imageName } = input;
  if (!userId || !text) return { ok: false, error: "Invalid manager message" };
  if (type === "image" && !imageUrl) return { ok: false, error: "Invalid image payload" };

  const messageData: Record<string, unknown> = {
    userId,
    text,
    sender: "manager",
    createdAt: FieldValue.serverTimestamp(),
    readByAdmin: true,
    readByUser: false,
    textRead: false,
    type,
  };
  if (type === "image") {
    messageData.imageUrl = imageUrl;
    messageData.imageName = imageName || "Фото";
  }

  try {
    const docRef = await getFirebaseAdminDb().collection("messages").add(messageData);
    // Awaited inline, not via `after()`: the only caller is the Telegram bot
    // webhook's handleAdminReply, which already runs inside `after()` — and a
    // nested `after()` there is not guaranteed to run, which would leave the
    // customer's Telegram without the manager's reply.
    const payload: ChatNotifyPayload =
      type === "image" && imageUrl
        ? { type: "image", imageUrl, text }
        : { type: "text", text };
    const relay = await notifyTelegramChatMessage(userId, payload).catch(() => ({
      ok: false as const,
      skipped: true,
    }));
    return {
      ok: true,
      id: docRef.id,
      telegramDelivered: Boolean(relay.ok) && !relay.skipped,
    };
  } catch (error) {
    console.error("Failed to create manager chat message:", error);
    return { ok: false, error: "Failed to create manager chat message" };
  }
};

// The side effects that must fire when a customer message lands: notify the
// admin chat, remember which notification maps to this customer (for
// bot/route.ts handleAdminReply), and send the auto-reply if due. Split out
// so the site widget can write the message itself (client Firestore SDK,
// latency-compensated — instant "sent") and then trigger only this over a
// lean fire-and-forget endpoint, instead of waiting on a server round-trip
// that writes the message for it.
export const dispatchInboundChatSideEffects = async (input: {
  userId: string;
  text: string;
  type: ChatMessageType;
}): Promise<void> => {
  const { userId, text, type } = input;

  const deliveries = (
    await sendAdminInboundNotification(buildTelegramMessage({ text, type }))
  ).filter((d) => d.messageId > 0);

  if (deliveries.length > 0) {
    const db = getFirebaseAdminDb();
    await Promise.all(
      deliveries.map((delivery) =>
        db
          .collection("telegramSupportThreads")
          .doc(`${delivery.chatId}:${delivery.messageId}`)
          .set(
            {
              chatId: delivery.chatId,
              messageId: delivery.messageId,
              userId,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => undefined)
      )
    );
  } else {
    console.error("Admin inbound notification was not delivered");
  }

  await sendAutoReplyIfDue(userId);
};

// Shared by /api/chat/message (legacy / non-JS fallback) and the Telegram
// bot's support mode, so both write into the exact same messages
// collection/shape and get the same auto-reply + shop-notify behavior.
export const createChatMessageServer = async (
  input: CreateChatMessageInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  const { userId, text, type, imageUrl, imageName, clientMessageId, runSideEffectsInline } =
    input;
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

    if (runSideEffectsInline) {
      await dispatchInboundChatSideEffects({ userId, text, type }).catch((error) => {
        console.error("Inbound chat side effects failed:", error);
      });
    } else {
      after(() =>
        dispatchInboundChatSideEffects({ userId, text, type }).catch((error) => {
          console.error("Inbound chat side effects failed:", error);
        })
      );
    }

    return { ok: true, id: docRef.id };
  } catch (error) {
    console.error("Failed to create chat message:", error);
    return { ok: false, error: "Failed to create chat message" };
  }
};
