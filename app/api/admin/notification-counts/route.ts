import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 5_000;
type Counts = { messages: number; orders: number; calls: number; total: number };
let cached: { value: Counts; expires: number } | null = null;
let pending: Promise<Counts> | null = null;

const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function loadCounts(): Promise<Counts> {
  const db = getFirebaseAdminDb();
  const messages = db.collection("messages").where("sender", "==", "user");
  const orders = db.collection("orders");
  const calls = db.collection("zvyaz");
  // Subtract read=true from totals to include legacy documents whose read
  // field is absent, exactly as the previous browser-side reductions did.
  const snapshots = await Promise.all([
    messages.count().get(), messages.where("readByAdmin", "==", true).count().get(),
    orders.count().get(), orders.where("read", "==", true).count().get(),
    calls.count().get(), calls.where("read", "==", true).count().get(),
  ]);
  const unread = (index: number) => Math.max(0, snapshots[index].data().count - snapshots[index + 1].data().count);
  const value = { messages: unread(0), orders: unread(2), calls: unread(4), total: 0 };
  value.total = value.messages + value.orders + value.calls;
  return value;
}

export async function GET(request: NextRequest) {
  if (!await verifyAdminRequest(request)) return respond({ error: "Доступ заборонено" }, 403);
  const rate = checkRateLimit({ req: request, key: "admin-notification-counts", limit: 60, windowMs: 60_000 });
  if (!rate.ok) return respond({ error: "Забагато запитів" }, 429);
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (!refresh && cached && cached.expires > Date.now()) return respond(cached.value);
    if (!pending) {
      pending = loadCounts().then((value) => { cached = { value, expires: Date.now() + CACHE_TTL_MS }; return value; })
        .finally(() => { pending = null; });
    }
    return respond(await pending);
  } catch {
    return respond({ error: "Не вдалося оновити сповіщення" }, 503);
  }
}
