import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { clearAllOneCCache } from "app/api/_lib/oneC";
import { getFirebaseAdminAuth } from "app/lib/firebase-admin";

export const runtime = "nodejs";

const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
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
  if (!token) return json({ error: "unauthorized" }, 401);

  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    if (!ADMIN_EMAILS.has(email)) return json({ error: "forbidden" }, 403);
  } catch {
    return json({ error: "unauthorized" }, 401);
  }

  const cleared = clearAllOneCCache();
  revalidatePath("/katalog", "page");
  revalidatePath("/", "layout");

  return json({ ok: true, cleared });
}
