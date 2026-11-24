import "server-only";
import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { toMillis } from "app/lib/order-status";

export type AdminOrderDoc = Record<string, unknown> & {
  id: string;
  createdAtMs: number;
  // Declared so the doc satisfies the all-optional OrderStatusFields /
  // getOrderTotal parameter types.
  status?: unknown;
  read?: unknown;
  shipped?: unknown;
  completed?: unknown;
  cancelled?: unknown;
  totalAmount?: unknown;
  total?: unknown;
};

// Orders created in [fromMs, toMs), newest first. Every order writer stores
// createdAt as a Firestore Timestamp, so a range query covers them all.
export const loadOrdersInRange = async (fromMs: number, toMs = Date.now() + 60_000, max = 5000) => {
  const snap = await getFirebaseAdminDb()
    .collection("orders")
    .where("createdAt", ">=", Timestamp.fromMillis(fromMs))
    .where("createdAt", "<", Timestamp.fromMillis(toMs))
    .orderBy("createdAt", "desc")
    .limit(max)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return { ...data, id: doc.id, createdAtMs: toMillis(data.createdAt) } as AdminOrderDoc;
  });
};

const KYIV_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// YYYY-MM-DD in Kyiv time.
export const kyivDayKey = (ms: number) => KYIV_DAY.format(new Date(ms));

// Kyiv-midnight of the given YYYY-MM-DD as epoch millis.
export const kyivDayStartMs = (dayKey: string) => {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d);
  // Kyiv is UTC+2 or UTC+3; pick the offset whose local date matches.
  for (const offsetHours of [3, 2]) {
    const candidate = utcGuess - offsetHours * 3_600_000;
    if (kyivDayKey(candidate) === dayKey && kyivDayKey(candidate - 1) !== dayKey) return candidate;
  }
  return utcGuess - 2 * 3_600_000;
};

export const isDayKey = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
