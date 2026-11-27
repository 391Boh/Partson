import { NextRequest, NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Chat identity migration (27.11.2026). The site chat used to key a guest's
// thread by a random id kept in localStorage ("user_<uuid>"), which Firestore
// rules cannot verify — so `messages` had to be world-readable. Chats are now
// keyed by the visitor's Firebase uid (anonymous for guests, the account uid
// once signed in). This route moves an earlier thread onto the caller's uid:
// its messages, the Telegram support-thread mapping (manager replies from
// Telegram), the profile's chatUserId and the presence doc.
//
//   action "status": does `legacyId` have any messages? (no auth; lets a
//                    returning guest skip anonymous sign-in when it has none)
//   action "claim":  move `legacyId` to the caller (Bearer ID token)
//
// A legacy id is accepted when it is an old guest id ("user_…"), an anonymous
// Firebase account, or the chatUserId already stored on the caller's own
// profile. The old guest id was the thread's only secret before, so this
// grants nothing a holder of that id could not already read.
const MAX_ID = 160;
const BATCH = 400;

const readId = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, MAX_ID) : "";

const isAnonymousAccount = async (uid: string) => {
  try {
    const record = await getFirebaseAdminAuth().getUser(uid);
    return record.providerData.length === 0 && !record.email && !record.phoneNumber;
  } catch {
    return false;
  }
};

const rewriteField = async (refs: DocumentReference[], field: string, value: string) => {
  const db = getFirebaseAdminDb();
  for (let start = 0; start < refs.length; start += BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + BATCH)) batch.update(ref, { [field]: value });
    await batch.commit();
  }
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({ req, key: "chat:claim", limit: 20, windowMs: 60_000 });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 1024 });
  if (!bodyResult.ok) {
    return NextResponse.json({ ok: false, error: bodyResult.error }, { status: bodyResult.status });
  }
  const legacyId = readId(bodyResult.value.legacyId);
  const action = bodyResult.value.action === "status" ? "status" : "claim";
  if (!legacyId || !/^[A-Za-z0-9_-]+$/.test(legacyId)) {
    return NextResponse.json({ ok: false, error: "Invalid legacyId" }, { status: 400 });
  }

  const db = getFirebaseAdminDb();

  if (action === "status") {
    const snap = await db.collection("messages").where("userId", "==", legacyId).limit(1).get();
    return NextResponse.json({ ok: true, hasMessages: !snap.empty });
  }

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let uid = "";
  try {
    uid = (await getFirebaseAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (legacyId === uid) return NextResponse.json({ ok: true, moved: 0 });

  let allowed = legacyId.startsWith("user_");
  if (!allowed) {
    const profile = await db.collection("users").doc(uid).get();
    allowed = profile.exists && readId(profile.get("chatUserId")) === legacyId;
  }
  if (!allowed) allowed = await isAnonymousAccount(legacyId);
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const [messages, threads, profiles, presence] = await Promise.all([
    db.collection("messages").where("userId", "==", legacyId).get(),
    db.collection("telegramSupportThreads").where("userId", "==", legacyId).get(),
    db.collection("users").where("chatUserId", "==", legacyId).get(),
    db.collection("chatPresence").doc(legacyId).get(),
  ]);

  await rewriteField(messages.docs.map((doc) => doc.ref), "userId", uid);
  await rewriteField(threads.docs.map((doc) => doc.ref), "userId", uid);
  await rewriteField(profiles.docs.map((doc) => doc.ref), "chatUserId", uid);
  if (presence.exists) {
    await db.collection("chatPresence").doc(uid).set(presence.data() ?? {}, { merge: true });
    await presence.ref.delete();
  }

  const response = NextResponse.json({ ok: true, moved: messages.size });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
