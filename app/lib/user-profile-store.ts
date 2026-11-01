"use client";

export type UserProfileData = Record<string, unknown>;
type Subscriber = { next: (data: UserProfileData | null) => void; error?: (error: unknown) => void };
type Entry = {
  subscribers: Set<Subscriber>;
  data: UserProfileData | null;
  hasValue: boolean;
  updatedAt: number;
  generation: number;
  starting: boolean;
  stop?: () => void;
  releaseTimer?: ReturnType<typeof setTimeout>;
};

const entries = new Map<string, Entry>();
const CACHE_TTL_MS = 30_000;
const RELEASE_DELAY_MS = 10_000;
const MAX_IDLE_PROFILES = 20;
let dependencies: Promise<{
  db: typeof import("app/lib/firebase-firestore").db;
  doc: typeof import("firebase/firestore").doc;
  onSnapshot: typeof import("firebase/firestore").onSnapshot;
}> | null = null;

const loadDependencies = () => {
  dependencies ??= Promise.all([import("app/lib/firebase-firestore"), import("firebase/firestore")])
    .then(([{ db }, { doc, onSnapshot }]) => ({ db, doc, onSnapshot }))
    .catch((error: unknown) => { dependencies = null; throw error; });
  return dependencies;
};

function publish(entry: Entry, data: UserProfileData | null) {
  entry.data = data;
  entry.hasValue = true;
  entry.updatedAt = Date.now();
  for (const subscriber of entry.subscribers) subscriber.next(data);
}

function start(uid: string, entry: Entry) {
  if (entry.stop || entry.starting) return;
  entry.starting = true;
  const generation = ++entry.generation;
  void loadDependencies().then(({ db, doc, onSnapshot }) => {
    if (entry.generation !== generation) return;
    let failed = false;
    const stop = onSnapshot(doc(db, "users", uid), (snapshot) => {
      if (entry.generation === generation) publish(entry, snapshot.exists() ? snapshot.data() : null);
    }, (error) => {
      if (entry.generation !== generation) return;
      failed = true;
      entry.stop?.();
      entry.stop = undefined;
      entry.starting = false;
      for (const subscriber of entry.subscribers) subscriber.error?.(error);
    });
    if (failed || entry.generation !== generation) stop();
    else entry.stop = stop;
  }).catch((error: unknown) => {
    if (entry.generation === generation) for (const subscriber of entry.subscribers) subscriber.error?.(error);
  }).finally(() => { if (entry.generation === generation) entry.starting = false; });
}

/** Hero, role detection and profile windows share one live users/{uid} read.
 * The short handoff window also avoids reopening it during page/modal changes. */
export function subscribeUserProfile(
  uid: string,
  next: Subscriber["next"],
  error?: Subscriber["error"]
): () => void {
  let entry = entries.get(uid);
  if (!entry) {
    entry = { subscribers: new Set(), data: null, hasValue: false, updatedAt: 0, generation: 0, starting: false };
    entries.set(uid, entry);
  }
  clearTimeout(entry.releaseTimer);
  entry.releaseTimer = undefined;
  const subscriber = { next, error };
  entry.subscribers.add(subscriber);
  if (entry.hasValue && (entry.stop || entry.starting || Date.now() - entry.updatedAt <= CACHE_TTL_MS)) next(entry.data);
  start(uid, entry);
  const subscribedEntry = entry;
  return () => {
    if (!subscribedEntry.subscribers.delete(subscriber) || subscribedEntry.subscribers.size) return;
    subscribedEntry.releaseTimer = setTimeout(() => {
      if (subscribedEntry.subscribers.size) return;
      subscribedEntry.generation++;
      subscribedEntry.stop?.();
      subscribedEntry.stop = undefined;
      subscribedEntry.starting = false;
      subscribedEntry.releaseTimer = undefined;
      // Retain a small, short-lived memory preview, always scoped to its uid.
      const idle = [...entries].filter(([, value]) => !value.subscribers.size && !value.stop && !value.starting)
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      let excess = Math.max(0, idle.length - MAX_IDLE_PROFILES);
      for (const [key, value] of idle) {
        if (Date.now() - value.updatedAt > CACHE_TTL_MS || excess > 0) { entries.delete(key); excess = Math.max(0, excess - 1); }
      }
    }, RELEASE_DELAY_MS);
  };
}

/** First snapshot, not a separate getDoc followed by another live read. */
export function readUserProfile(uid: string): Promise<UserProfileData | null> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    let settled = false;
    stop = subscribeUserProfile(uid, (data) => { settled = true; resolve(data); stop(); }, (error) => { settled = true; reject(error); stop(); });
    if (settled) stop();
  });
}

/** Optimistic edits notify every mounted view; Firestore reconfirms/rolls back. */
export function updateUserProfileCache(uid: string, update: (data: UserProfileData) => UserProfileData) {
  const entry = entries.get(uid);
  if (entry?.hasValue && entry.data) publish(entry, update(entry.data));
}
