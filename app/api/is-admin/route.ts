import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

export const runtime = "nodejs";

// Same admin-email allowlist already used server-side by product-update,
// cache-clear, etc. Reading NEXT_PUBLIC_ADMIN_EMAILS here is safe despite the
// name — this file is server-only (never bundled for the client) — which is
// exactly the point: LayoutHost.tsx used to compare against this list
// directly, and being a "use client" component meant the real admin
// email(s) got inlined into the shipped JS bundle for anyone to read. This
// route lets the client ask "is this user an admin" without ever holding
// the list itself.
const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json({ isAdmin: false }, 401);

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    return json({ isAdmin: email.length > 0 && ADMIN_EMAILS.has(email) });
  } catch {
    return json({ isAdmin: false }, 401);
  }
}
