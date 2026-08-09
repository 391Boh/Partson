import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Registered users are modest in number for this shop — one page covers the
// whole list. Raise this (and add real cursor pagination) if that stops
// being true.
const MAX_USERS = 500;

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function GET(request: NextRequest) {
  const rl = checkRateLimit({
    req: request,
    key: "admin-users-list",
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

  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(MAX_USERS)
    .get();

  const users = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const role = data.role === "admin" ? "admin" : "user";
    return {
      uid: doc.id,
      name: typeof data.name === "string" ? data.name : "",
      email: typeof data.email === "string" ? data.email : "",
      phone: typeof data.phone === "string" ? data.phone : "",
      role,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    };
  });

  return json({ ok: true, users, currentUid: admin.uid });
}
