import "server-only";
import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { kyivDayKey } from "app/lib/admin-orders-query";

// Search queries that found nothing, counted per Kyiv day in
// adminStats/searchMisses_<YYYY-MM-DD> as { counts: { "<query>": n } }.
// Buffered in memory and flushed once a minute so a burst of searches costs
// one Firestore write, never a request's latency.
const COLLECTION = "adminStats";
const FLUSH_MS = 60_000;
const MAX_BUFFER_KEYS = 500;
const MAX_QUERY_LENGTH = 80;

let buffer = new Map<string, number>();
let bufferDay = "";
let timer: ReturnType<typeof setTimeout> | null = null;

const normalize = (query: string) =>
  query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

const flush = async () => {
  timer = null;
  if (!buffer.size) return;
  const counts = buffer;
  const day = bufferDay;
  buffer = new Map();
  const increments: Record<string, FieldValue> = {};
  for (const [query, count] of counts) increments[query] = FieldValue.increment(count);
  try {
    await getFirebaseAdminDb()
      .collection(COLLECTION)
      .doc(`searchMisses_${day}`)
      .set({ day, counts: increments, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    console.warn("[search-miss-log] flush failed:", error instanceof Error ? error.message : error);
  }
};

export const recordSearchMiss = (query: string) => {
  const key = normalize(query);
  // Single characters and pure punctuation are typing noise, not demand.
  if (key.length < 3 || !/[\p{L}\p{N}]/u.test(key)) return;
  const day = kyivDayKey(Date.now());
  if (bufferDay && bufferDay !== day) void flush();
  bufferDay = day;
  if (!buffer.has(key) && buffer.size >= MAX_BUFFER_KEYS) return;
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
  if (!timer) {
    timer = setTimeout(() => void flush(), FLUSH_MS);
    (timer as { unref?: () => void }).unref?.();
  }
};

export type SearchMissRow = { query: string; count: number; days: number; lastDay: string };

// Top missed queries over the last `days` Kyiv days.
export const listSearchMisses = async (days: number, limit = 100): Promise<SearchMissRow[]> => {
  const db = getFirebaseAdminDb();
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) keys.push(kyivDayKey(Date.now() - i * 86_400_000));
  const snaps = await db.getAll(...keys.map((day) => db.collection(COLLECTION).doc(`searchMisses_${day}`)));
  const totals = new Map<string, SearchMissRow>();
  snaps.forEach((snap, index) => {
    const counts = (snap.data()?.counts ?? {}) as Record<string, unknown>;
    for (const [query, value] of Object.entries(counts)) {
      const count = Number(value) || 0;
      if (!count) continue;
      const row = totals.get(query) ?? { query, count: 0, days: 0, lastDay: keys[index] };
      row.count += count;
      row.days += 1;
      if (keys[index] > row.lastDay) row.lastDay = keys[index];
      totals.set(query, row);
    }
  });
  // Pending (not yet flushed) misses of today too.
  for (const [query, count] of buffer) {
    const row = totals.get(query) ?? { query, count: 0, days: 1, lastDay: bufferDay };
    row.count += count;
    totals.set(query, row);
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || b.days - a.days).slice(0, limit);
};
