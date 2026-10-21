import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { clearCatalogPageRouteCache } from "app/lib/catalog-page-route-cache";
import {
  fetchExactCatalogProductByLookup,
  patchFullCatalogSnapshotProduct,
} from "app/lib/catalog-server";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { setProductEditOverride } from "app/lib/product-edit-overrides";
import { buildProductPath } from "app/lib/product-url";

// Writes an order's sale (Реалізація) to 1C once, then makes the site show the
// new balance immediately. 1C alone was not enough: product pages render from
// the sitemap snapshot and an hour of ISR, so a sold-out item kept showing its
// old stock and stayed orderable. This mirrors what product-update/route.ts
// does after an admin stock movement (re-read, override, snapshot, ISR).
//
// The items come from the stored order, never from the caller, and a
// Firestore claim makes it idempotent: one order deducts once, however many
// times checkout, a retry or the Telegram bot asks.

// Same endpoint and default as the admin stock movement in
// product-update/route.ts. The old "ОбновитьТовар" default is not a route the
// 1C service answers, so no order had ever been deducted.
const ONEC_PRODUCT_UPDATE_ENDPOINT = (
  process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit"
).trim();
// Card orders are stored as "pending" before LiqPay confirms them.
const DEDUCTIBLE_PAYMENT_STATUSES = new Set(["paid", "cash_on_delivery"]);

export type OrderStockLine = {
  code: string;
  quantity: number;
  ok: boolean;
  stockAfter: number | null;
  error?: string;
};
export type OrderStockResult =
  | { status: "done" | "partial"; items: OrderStockLine[] }
  | { status: "already"; items: OrderStockLine[] }
  | { status: "not_found" }
  | { status: "not_payable" }
  | { status: "cancelled" }
  | { status: "empty" };
export type OrderStockReturnResult =
  | { status: "done" | "partial"; items: OrderStockLine[] }
  | { status: "already" | "not_deducted" | "not_cancelled" | "not_found" };

type StoredOrderItem = { code?: unknown; quantity?: unknown };

const readOrderLines = (cartItems: unknown) => {
  const totals = new Map<string, number>();
  if (!Array.isArray(cartItems)) return totals;
  for (const item of cartItems as StoredOrderItem[]) {
    const code = typeof item?.code === "string" ? item.code.trim() : "";
    const quantity = typeof item?.quantity === "number" ? Math.floor(item.quantity) : 0;
    if (code && quantity > 0) totals.set(code, (totals.get(code) || 0) + quantity);
  }
  return totals;
};

const isOneCSaleAccepted = (status: number, text: string) => {
  if (status < 200 || status >= 300) return false;
  try {
    const parsed = JSON.parse(text) as {
      success?: boolean;
      updated?: boolean;
      found?: boolean;
      error?: string;
      error_message?: string;
      quantity_result?: { success?: boolean };
    };
    if (!parsed || typeof parsed !== "object") return true;
    return !(
      parsed.success === false ||
      parsed.updated === false ||
      parsed.found === false ||
      parsed.error ||
      parsed.error_message ||
      parsed.quantity_result?.success === false
    );
  } catch {
    return true;
  }
};

// "Реалізація" writes the order's sale; "Поступлення" (a receipt, as an admin
// stock intake) returns a cancelled order's goods.
type StockMovement = "Реалізація" | "Поступлення";

const moveLine = async (
  code: string,
  quantity: number,
  movement: StockMovement
): Promise<OrderStockLine> => {
  // No "article" key: ОбновитьТовар reads it as a catalog-number change and
  // rejects a quantity-only update.
  const sale = await oneCRequest(ONEC_PRODUCT_UPDATE_ENDPOINT, {
    method: "POST",
    body: { Код: code, [movement]: quantity },
    timeoutMs: 20_000,
    retries: 0,
    cacheTtlMs: 0,
  }).catch((error: unknown) => ({ status: 0, text: String((error as Error)?.message || error) }));
  if (!isOneCSaleAccepted(sale.status, sale.text || "")) {
    // Kept on the order (stockDeduction.items[].error) so a failure is visible.
    return { code, quantity, ok: false, stockAfter: null, error: `${sale.status}: ${(sale.text || "").slice(0, 300)}` };
  }

  // The sale reply echoes the movement, not the balance: read it back.
  const fresh = await fetchExactCatalogProductByLookup(code, {
    cacheTtlMs: 0,
    retries: 1,
    timeoutMs: 4_000,
  }).catch(() => null);
  const stockAfter =
    fresh && fresh.code.trim().toLowerCase() === code.toLowerCase() &&
    Number.isSafeInteger(fresh.quantity) && fresh.quantity >= 0
      ? fresh.quantity
      : null;

  if (stockAfter !== null) {
    setProductEditOverride(code, { quantity: stockAfter });
    patchFullCatalogSnapshotProduct(code, { quantity: stockAfter });
  }
  if (fresh) {
    try {
      revalidatePath(buildProductPath(fresh), "page");
    } catch {
      // Outside a request context (scripts/tests).
    }
  }
  return { code, quantity, ok: true, stockAfter };
};

export async function deductOrderStock(orderId: string): Promise<OrderStockResult> {
  const orderRef = getFirebaseAdminDb().collection("orders").doc(orderId);

  const claim = await getFirebaseAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) return { status: "not_found" as const };
    const order = snapshot.data() || {};
    const previous = order.stockDeduction as { status?: string; items?: OrderStockLine[] } | undefined;
    if (previous?.status) {
      return { status: "already" as const, items: Array.isArray(previous.items) ? previous.items : [] };
    }
    // Cancelled before the sale was written: nothing to sell, nothing to return.
    if (order.cancelled === true) return { status: "cancelled" as const };
    if (!DEDUCTIBLE_PAYMENT_STATUSES.has(String(order.paymentStatus || ""))) {
      return { status: "not_payable" as const };
    }
    const lines = readOrderLines(order.cartItems);
    if (lines.size === 0) return { status: "empty" as const };
    transaction.update(orderRef, {
      stockDeduction: { status: "pending", startedAt: FieldValue.serverTimestamp() },
    });
    return { status: "claimed" as const, lines };
  });

  if (claim.status !== "claimed") return claim;

  const items = await Promise.all(
    Array.from(claim.lines, ([code, quantity]) => moveLine(code, quantity, "Реалізація"))
  );

  refreshCatalogAfterStockMovement();

  const status = items.every((item) => item.ok) ? "done" : "partial";
  await orderRef
    .update({
      stockDeduction: { status, items, finishedAt: FieldValue.serverTimestamp() },
    })
    .catch((error) => console.error(`Order ${orderId} stock deduction status write failed:`, error));
  if (status === "partial") {
    console.error(
      `Order ${orderId} stock deduction incomplete:`,
      items.filter((item) => !item.ok).map((item) => `${item.code}×${item.quantity}`).join(", ")
    );
  }

  // The customer cancelled while the sale was being written: return it now.
  const after = await orderRef.get().catch(() => null);
  if (after?.data()?.cancelled === true) {
    await returnOrderStock(orderId).catch((error) =>
      console.error(`Order ${orderId} stock return after late deduction failed:`, error)
    );
  }
  return { status, items };
}

const refreshCatalogAfterStockMovement = () => {
  clearAllOneCCache();
  clearCatalogPageRouteCache();
  try {
    revalidateTag("product-page-data", { expire: 0 });
  } catch {
    // Outside a request context (scripts/tests).
  }
};

// Puts a cancelled order's sold goods back with a receipt ("Поступлення") of
// exactly what the sale wrote off — only the lines 1C accepted. Once per
// order, like the deduction: a Firestore claim makes repeats no-ops.
export async function returnOrderStock(orderId: string): Promise<OrderStockReturnResult> {
  const orderRef = getFirebaseAdminDb().collection("orders").doc(orderId);

  const claim = await getFirebaseAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) return { status: "not_found" as const };
    const order = snapshot.data() || {};
    if (order.cancelled !== true) return { status: "not_cancelled" as const };
    if ((order.stockReturn as { status?: string } | undefined)?.status) {
      return { status: "already" as const };
    }
    const deduction = order.stockDeduction as { status?: string; items?: OrderStockLine[] } | undefined;
    // "pending": deductOrderStock returns it itself once its sale is written.
    if (deduction?.status !== "done" && deduction?.status !== "partial") {
      return { status: "not_deducted" as const };
    }
    const lines = (Array.isArray(deduction.items) ? deduction.items : []).filter(
      (item) => item?.ok === true && typeof item.code === "string" && item.quantity > 0
    );
    transaction.update(orderRef, {
      stockReturn: { status: "pending", startedAt: FieldValue.serverTimestamp() },
    });
    return { status: "claimed" as const, lines };
  });

  if (claim.status !== "claimed") return claim;

  const items = await Promise.all(
    claim.lines.map((line) => moveLine(line.code, line.quantity, "Поступлення"))
  );
  refreshCatalogAfterStockMovement();

  const status = items.every((item) => item.ok) ? "done" : "partial";
  await orderRef
    .update({ stockReturn: { status, items, finishedAt: FieldValue.serverTimestamp() } })
    .catch((error) => console.error(`Order ${orderId} stock return status write failed:`, error));
  if (status === "partial") {
    console.error(
      `Order ${orderId} stock return incomplete:`,
      items.filter((item) => !item.ok).map((item) => `${item.code}×${item.quantity}`).join(", ")
    );
  }
  return { status, items };
}
