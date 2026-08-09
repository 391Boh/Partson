import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string }> };

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function POST(request: NextRequest, context: RouteContext) {
  const rl = checkRateLimit({
    req: request,
    key: "admin-users-role",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    const headers = new Headers({ "cache-control": "no-store" });
    setRateLimitHeaders(headers, rl);
    return new NextResponse(JSON.stringify({ ok: false, error: "Too many requests" }), {
      status: 429,
      headers,
    });
  }

  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ ok: false, error: "Unauthorized" }, 401);

  const { uid } = await context.params;
  if (!uid?.trim()) return json({ ok: false, error: "Missing uid" }, 400);

  const body = await readJsonObject(request, { maxBytes: 512 });
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);

  const role = body.value.role;
  if (role !== "admin" && role !== "user") {
    return json({ ok: false, error: "role must be \"admin\" or \"user\"" }, 400);
  }

  // Prevent an admin from demoting themselves — a self-lockout with no
  // other admin around to undo it would need direct Firestore console
  // access to fix. Demoting someone else is still allowed either way.
  if (uid === admin.uid && role === "user") {
    return json(
      { ok: false, error: "Не можна забрати адмін-роль у самого себе" },
      400
    );
  }

  const db = getFirebaseAdminDb();
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return json({ ok: false, error: "Користувача не знайдено" }, 404);

  await userRef.set({ role }, { merge: true });

  return json({ ok: true, uid, role });
}
