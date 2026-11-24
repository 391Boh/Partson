import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { checkRateLimit } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  getOrderStatus,
  isOrderStatus,
  legacyFlagsForStatus,
  MANUAL_ORDER_STATUSES,
  ORDER_NOTE_MAX_LENGTH,
  type OrderHistoryEntry,
  type OrderStatus,
} from "app/lib/order-status";
import { notifyOrderStatusTelegram } from "app/lib/order-status-notify";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Display name of the admin for "who did it" labels: the users/{uid} profile
// name (what the Users tab shows), else the e-mail.
const adminNameCache = new Map<string, { name: string; expiresAt: number }>();
const readAdminName = async (uid: string, email: string) => {
  const cached = adminNameCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  let name = "";
  try {
    const snap = await getFirebaseAdminDb().collection("users").doc(uid).get();
    const value = snap.data()?.name;
    if (typeof value === "string") name = value.trim();
  } catch {
    // Fall back to the e-mail below.
  }
  name = name || email || "Адміністратор";
  adminNameCache.set(uid, { name, expiresAt: Date.now() + 10 * 60_000 });
  return name;
};

const BY_NAME_FIELD: Partial<Record<OrderStatus, string>> = {
  shipped: "shippedByName",
  completed: "completedByName",
};

// POST { orderId, status?, note?, viewed?, notify? }
// - viewed: marks the order as opened by this admin (first time only)
// - status: one of MANUAL_ORDER_STATUSES; keeps legacy booleans in sync and
//   appends a history entry; announces it to the customer via Telegram
//   unless notify === false
// - note: a manager comment appended to the history (internal, not shown to
//   the customer)
// Goes through the Admin SDK so it works regardless of the client Firestore
// rules (which block client-side order updates).
export async function POST(req: NextRequest) {
  const admin = await verifyAdminRequest(req);
  if (!admin) return json({ ok: false, error: "Потрібні права адміністратора." }, 401);
  const rate = checkRateLimit({ req, key: "admin-order-status", limit: 120, windowMs: 60_000 });
  if (!rate.ok) return json({ ok: false, error: "Забагато запитів." }, 429);

  const parsed = await readJsonObject(req, { maxBytes: 4096 });
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status);
  const body = parsed.value;

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || orderId.length > 200 || orderId.includes("/")) {
    return json({ ok: false, error: "Некоректний номер замовлення." }, 400);
  }
  const nextStatus = body.status;
  if (nextStatus !== undefined && (!isOrderStatus(nextStatus) || !MANUAL_ORDER_STATUSES.includes(nextStatus))) {
    return json({ ok: false, error: "Некоректний статус." }, 400);
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > ORDER_NOTE_MAX_LENGTH) {
    return json({ ok: false, error: `Коментар довший за ${ORDER_NOTE_MAX_LENGTH} символів.` }, 400);
  }
  const viewed = body.viewed === true;
  if (!nextStatus && !note && !viewed) return json({ ok: false, error: "Нічого змінювати." }, 400);

  const byName = await readAdminName(admin.uid, admin.email);
  const db = getFirebaseAdminDb();
  const ref = db.collection("orders").doc(orderId);

  try {
    const outcome = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { code: 404 as const };
      const data = snap.data() ?? {};
      const current = getOrderStatus(data);
      if (current === "cancelled" && nextStatus) return { code: 409 as const };

      const update: Record<string, unknown> = {};
      const history: OrderHistoryEntry[] = [];
      const now = Date.now();

      if ((viewed || nextStatus || note) && data.read !== true) {
        update.read = true;
        update.viewedByName = byName;
      }
      let changed = false;
      if (nextStatus && nextStatus !== current) {
        changed = true;
        Object.assign(update, legacyFlagsForStatus(nextStatus), {
          status: nextStatus,
          statusUpdatedAt: FieldValue.serverTimestamp(),
          statusUpdatedByName: byName,
        });
        const byField = BY_NAME_FIELD[nextStatus];
        if (byField) update[byField] = byName;
        if (nextStatus === "completed" && !data.shippedByName) update.shippedByName = byName;
        history.push({ status: nextStatus, byName, byUid: admin.uid, source: "admin", at: now });
      }
      if (note) {
        history.push({ note, byName, byUid: admin.uid, source: "admin", at: now });
        update.lastNote = note;
      }
      if (history.length) update.history = FieldValue.arrayUnion(...history);
      if (Object.keys(update).length) transaction.update(ref, update);
      return { code: 200 as const, changed, status: changed ? nextStatus! : current };
    });

    if (outcome.code === 404) return json({ ok: false, error: "Замовлення не знайдено." }, 404);
    if (outcome.code === 409) return json({ ok: false, error: "Замовлення скасоване клієнтом." }, 409);

    let notified = false;
    if (outcome.changed && body.notify !== false) {
      notified = (await notifyOrderStatusTelegram(orderId, outcome.status)).sent;
    }
    return json({ ok: true, status: outcome.status, notified, byName });
  } catch (error) {
    console.error("Admin order status update failed:", error);
    return json({ ok: false, error: "Не вдалося зберегти. Спробуйте ще раз." }, 500);
  }
}
