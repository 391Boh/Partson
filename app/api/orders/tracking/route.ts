import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "app/api/_lib/admin-auth";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { isNovaPoshtaDelivery, isValidTrackingNumber, normalizeTrackingNumber } from "app/lib/order-tracking";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function POST(req: NextRequest) {
  const admin = await verifyAdminRequest(req);
  if (!admin) return json({ ok: false, error: "Потрібні права адміністратора." }, 401);
  const parsed = await readJsonObject(req, { maxBytes: 2048 });
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status);
  const { orderId, trackingNumber } = parsed.value;
  if (typeof orderId !== "string" || !orderId.trim() || orderId.length > 200 || orderId.includes("/")) {
    return json({ ok: false, error: "Некоректний номер замовлення." }, 400);
  }
  if (typeof trackingNumber !== "string" || trackingNumber.length > 64) {
    return json({ ok: false, error: "Введіть номер ТТН." }, 400);
  }
  const normalized = normalizeTrackingNumber(trackingNumber);
  if (normalized && !isValidTrackingNumber(normalized)) {
    return json({ ok: false, error: "Номер ТТН має містити 14 цифр." }, 400);
  }
  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection("orders").doc(orderId.trim());
    const result = await db.runTransaction(async (transaction) => {
      const order = await transaction.get(ref);
      if (!order.exists) return 404;
      if (!isNovaPoshtaDelivery(order.data()?.deliveryMethod)) return 409;
      transaction.update(ref, {
        trackingNumber: normalized || null,
        trackingUpdatedAt: FieldValue.serverTimestamp(),
        trackingUpdatedBy: admin.uid,
      });
      return 200;
    });
    if (result === 404) return json({ ok: false, error: "Замовлення не знайдено." }, 404);
    if (result === 409) return json({ ok: false, error: "ТТН доступна лише для доставки Новою Поштою." }, 409);
    return json({ ok: true, trackingNumber: normalized || null });
  } catch (error) {
    console.error("Order tracking update failed:", error);
    return json({ ok: false, error: "Не вдалося зберегти ТТН. Спробуйте ще раз." }, 500);
  }
}
