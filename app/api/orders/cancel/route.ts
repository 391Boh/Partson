import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { returnOrderStock } from "app/api/_lib/order-stock";
import { invalidatePartnerStatus } from "app/api/_lib/partner-auth";
import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";
import { sendTelegramNotification } from "app/lib/telegram-notify";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// Only orders paid on delivery: a prepaid (LiqPay) order needs a refund,
// which stays with the manager.
const SELF_CANCELLABLE_PAYMENT_STATUS = "cash_on_delivery";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const sameHash = (left: string, right: string) => {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

const readUid = async (req: NextRequest) => {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return "";
  try {
    return (await getFirebaseAdminAuth().verifyIdToken(token)).uid || "";
  } catch {
    return "";
  }
};

// The customer cancels an order the manager has not opened yet. Owners prove
// themselves with their Firebase session; guests with the cancel token their
// browser created with the order (only its hash is stored on the order).
export async function POST(req: NextRequest) {
  const rl = checkRateLimit({ req, key: "orders:cancel", limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    const res = json({ ok: false, error: "Забагато спроб. Спробуйте за хвилину." }, 429);
    setRateLimitHeaders(res.headers, rl);
    return res;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 1024 });
  if (!bodyResult.ok) return json({ ok: false, error: bodyResult.error }, bodyResult.status);
  const orderId = typeof bodyResult.value.orderId === "string" ? bodyResult.value.orderId.trim() : "";
  const cancelToken =
    typeof bodyResult.value.cancelToken === "string" ? bodyResult.value.cancelToken.trim().slice(0, 128) : "";
  if (!orderId || orderId.length > 128 || orderId.includes("/")) {
    return json({ ok: false, error: "orderId is required" }, 400);
  }

  const uid = await readUid(req);
  const orderRef = getFirebaseAdminDb().collection("orders").doc(orderId);

  type Outcome =
    | { kind: "cancelled"; order: FirebaseFirestore.DocumentData }
    | { kind: "already" }
    | { kind: "error"; status: number; code: string; error: string };

  const outcome: Outcome = await getFirebaseAdminDb().runTransaction(async (transaction): Promise<Outcome> => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) {
      return { kind: "error", status: 404, code: "not_found", error: "Замовлення не знайдено." };
    }
    const order = snapshot.data() || {};

    const ownerUid = typeof order.uid === "string" ? order.uid : "";
    const storedHash = typeof order.cancelTokenHash === "string" ? order.cancelTokenHash : "";
    const isOwner = Boolean(uid && ownerUid && uid === ownerUid);
    const hasToken = Boolean(cancelToken && storedHash && sameHash(sha256(cancelToken), storedHash));
    if (!isOwner && !hasToken) {
      return { kind: "error", status: 403, code: "forbidden", error: "Немає доступу до цього замовлення." };
    }

    if (order.cancelled === true) return { kind: "already" };
    if (order.paymentStatus !== SELF_CANCELLABLE_PAYMENT_STATUS) {
      return {
        kind: "error",
        status: 409,
        code: "prepaid",
        error: "Оплачене замовлення скасовує менеджер. Напишіть нам у чат або зателефонуйте.",
      };
    }
    if (order.read === true || order.shipped === true || order.completed === true) {
      return {
        kind: "error",
        status: 409,
        code: "in_progress",
        error: "Менеджер уже опрацьовує замовлення. Щоб скасувати, напишіть нам у чат або зателефонуйте.",
      };
    }

    transaction.update(orderRef, {
      cancelled: true,
      cancelledBy: "customer",
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { kind: "cancelled", order };
  }).catch((error: unknown) => {
    console.error(`Order ${orderId} cancel failed:`, error);
    return { kind: "error" as const, status: 500, code: "failed", error: "Не вдалося скасувати замовлення. Спробуйте ще раз." };
  });

  if (outcome.kind === "error") {
    return json({ ok: false, code: outcome.code, error: outcome.error }, outcome.status);
  }
  if (outcome.kind === "already") return json({ ok: true, alreadyCancelled: true });

  // Goods already written off in 1C go back as a receipt. A deduction still
  // in flight returns them itself when it finishes (order-stock.ts).
  const stockReturn = await returnOrderStock(orderId).catch((error) => {
    console.error(`Order ${orderId} stock return failed:`, error);
    return null;
  });

  const order = outcome.order;
  // The cancelled amount no longer counts towards the partner threshold.
  if (typeof order.uid === "string" && order.uid) invalidatePartnerStatus(order.uid);
  const total = Number(order.totalAmount || order.total || 0);
  const stockLine =
    stockReturn?.status === "done"
      ? "Товар повернуто на склад (Поступлення в 1С)."
      : stockReturn?.status === "partial"
        ? "⚠️ Частину товару не вдалося повернути в 1С — перевірте залишки."
        : stockReturn === null
          ? "⚠️ Повернення в 1С не вдалося — перевірте залишки."
          : "Товар ще не списувався з залишку.";
  void sendTelegramNotification(
    [
      `❌ Клієнт скасував замовлення №${order.orderId || orderId}`,
      [order.name, order.phone].filter(Boolean).join(", "),
      Number.isFinite(total) && total > 0 ? `Сума: ${total} грн` : "",
      stockLine,
    ]
      .filter(Boolean)
      .join("\n")
  ).catch(() => undefined);

  return json({ ok: true, stockReturned: stockReturn?.status === "done" });
}
