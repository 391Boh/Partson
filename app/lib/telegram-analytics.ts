import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";

const COLLECTION = "telegramBotAnalytics";
const EVENT_PATTERN = /^[a-z0-9_]{1,64}$/u;

export const recordTelegramBotEvent = async (event: string) => {
  const normalizedEvent = event.trim().toLowerCase();
  if (!EVENT_PATTERN.test(normalizedEvent)) return;

  const date = new Date().toISOString().slice(0, 10);
  await getFirebaseAdminDb().collection(COLLECTION).doc(date).set(
    {
      date,
      totalEvents: FieldValue.increment(1),
      events: { [normalizedEvent]: FieldValue.increment(1) },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

export const getTelegramBotAnalytics = async (days = 30) => {
  const safeDays = Math.max(1, Math.min(90, Math.trunc(days)));
  const snapshot = await getFirebaseAdminDb()
    .collection(COLLECTION)
    .orderBy("date", "desc")
    .limit(safeDays)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      date: typeof data.date === "string" ? data.date : doc.id,
      totalEvents: typeof data.totalEvents === "number" ? data.totalEvents : 0,
      events:
        data.events && typeof data.events === "object"
          ? (data.events as Record<string, number>)
          : {},
    };
  });
};
