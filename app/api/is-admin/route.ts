import { NextRequest, NextResponse } from "next/server";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";

export const runtime = "nodejs";

const json = (payload: unknown, status = 200) =>
  new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Lets the client ask "is this user an admin" without ever holding the
// server-only admin-email allowlist or Firestore role logic itself — see
// verifyAdminRequest for the two ways a user can qualify (env allowlist or
// role: "admin" on their users/{uid} doc).
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ isAdmin: false }, 401);
  return json({ isAdmin: true });
}
