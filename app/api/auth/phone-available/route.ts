import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Phone uniqueness for sign-up and profile edits. Firestore rules let a
// visitor read only their own profile, so the browser cannot query other
// users' phones — the check runs here with the Admin SDK and returns only a
// yes/no. An optional Bearer ID token excludes the caller's own profile (a
// signed-in user re-saving their number).
const PHONE_RE = /^\+380\d{9}$/;

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({ req, key: "auth:phone-available", limit: 20, windowMs: 60_000 });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 512 });
  if (!bodyResult.ok) {
    return NextResponse.json({ ok: false, error: bodyResult.error }, { status: bodyResult.status });
  }
  const phone = typeof bodyResult.value.phone === "string" ? bodyResult.value.phone.trim() : "";
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ ok: false, error: "Invalid phone" }, { status: 400 });
  }

  let callerUid = "";
  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) {
    try {
      callerUid = (await getFirebaseAdminAuth().verifyIdToken(header.slice(7).trim())).uid;
    } catch {}
  }

  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .where("phone", "==", phone)
    .select()
    .limit(2)
    .get();
  const available = snapshot.docs.every((doc) => doc.id === callerUid);

  const response = NextResponse.json({ ok: true, available });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
