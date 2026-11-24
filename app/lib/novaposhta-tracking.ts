import "server-only";
import { FieldValue } from "firebase-admin/firestore";

import { loadOrdersInRange } from "app/lib/admin-orders-query";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  getOrderStatus,
  isClosedOrderStatus,
  legacyFlagsForStatus,
  type OrderHistoryEntry,
  type OrderStatus,
} from "app/lib/order-status";
import { notifyOrderStatusTelegram } from "app/lib/order-status-notify";
import { isValidTrackingNumber } from "app/lib/order-tracking";

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";
const BATCH = 100;
const LOOKBACK_DAYS = 45;

type NpStatusRow = {
  Number?: string;
  StatusCode?: string | number;
  Status?: string;
  WarehouseRecipient?: string;
  DateFirstDayStorage?: string;
  RecipientDateTime?: string;
};

// Nova Poshta StatusCode → order status it implies. Anything else (created,
// not found, address change…) leaves the order alone.
const IN_TRANSIT = new Set(["4", "41", "5", "6", "101"]);
const ARRIVED = new Set(["7", "8"]);
const RECEIVED = new Set(["9", "10", "11", "106"]);
const RETURNING = new Set(["102", "103", "105", "108"]);

const impliedStatus = (code: string): OrderStatus | null => {
  if (IN_TRANSIT.has(code)) return "shipped";
  if (ARRIVED.has(code)) return "arrived";
  if (RECEIVED.has(code)) return "completed";
  if (RETURNING.has(code)) return "returned";
  return null;
};

// Order of the workflow, so a late/duplicate NP status never moves an order
// backwards (e.g. "in transit" arriving after "arrived").
const RANK: Record<OrderStatus, number> = {
  new: 0, confirmed: 1, awaiting_payment: 1, packing: 2, shipped: 3, arrived: 4,
  completed: 5, returned: 5, cancelled: 6,
};

const fetchStatuses = async (documents: Array<{ DocumentNumber: string; Phone: string }>) => {
  const apiKey = process.env.NP_API_KEY;
  if (!apiKey) throw new Error("NP_API_KEY is not set");
  const response = await fetch(NP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      modelName: "TrackingDocument",
      calledMethod: "getStatusDocuments",
      methodProperties: { Documents: documents },
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nova Poshta HTTP ${response.status}`);
  const payload = (await response.json()) as { success?: boolean; data?: NpStatusRow[]; errors?: string[] };
  if (!payload.success) throw new Error(`Nova Poshta: ${(payload.errors || []).join("; ") || "request failed"}`);
  return payload.data ?? [];
};

export type NpSyncResult = {
  checked: number;
  updated: number;
  statusChanged: number;
  notified: number;
  errors: string[];
  finishedAt: number;
};

let running: Promise<NpSyncResult> | null = null;
let lastResult: NpSyncResult | null = null;

export const getLastNpSyncResult = () => lastResult;

// Pulls Nova Poshta statuses for every open order with a TTN from the last
// LOOKBACK_DAYS and moves the order forward (shipped → arrived → completed /
// returned). Concurrent calls share one run.
export const syncNovaPoshtaOrderStatuses = (): Promise<NpSyncResult> => {
  if (running) return running;
  running = (async () => {
    const result: NpSyncResult = { checked: 0, updated: 0, statusChanged: 0, notified: 0, errors: [], finishedAt: 0 };
    const orders = (await loadOrdersInRange(Date.now() - LOOKBACK_DAYS * 86_400_000)).filter((order) => {
      const ttn = typeof order.trackingNumber === "string" ? order.trackingNumber : "";
      return isValidTrackingNumber(ttn) && !isClosedOrderStatus(getOrderStatus(order));
    });
    const db = getFirebaseAdminDb();

    for (let start = 0; start < orders.length; start += BATCH) {
      const chunk = orders.slice(start, start + BATCH);
      let rows: NpStatusRow[];
      try {
        rows = await fetchStatuses(
          chunk.map((order) => ({
            DocumentNumber: String(order.trackingNumber),
            Phone: typeof order.phone === "string" ? order.phone.replace(/\D/g, "").slice(-12) : "",
          }))
        );
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      const byNumber = new Map(rows.map((row) => [String(row.Number ?? ""), row]));

      for (const order of chunk) {
        const row = byNumber.get(String(order.trackingNumber));
        if (!row) continue;
        result.checked += 1;
        const code = String(row.StatusCode ?? "");
        const text = String(row.Status ?? "").trim();
        if (!code) continue;

        const current = getOrderStatus(order);
        const implied = impliedStatus(code);
        const advance = implied && RANK[implied] > RANK[current] ? implied : null;
        const sameNpState = String(order.npStatusCode ?? "") === code && String(order.npStatus ?? "") === text;
        if (sameNpState && !advance) continue;

        const update: Record<string, unknown> = {
          npStatus: text,
          npStatusCode: code,
          npStatusAt: FieldValue.serverTimestamp(),
        };
        if (row.WarehouseRecipient) update.npWarehouse = String(row.WarehouseRecipient);
        if (row.DateFirstDayStorage) update.npPaidStorageFrom = String(row.DateFirstDayStorage);
        if (ARRIVED.has(code) && !order.npArrivedAt) update.npArrivedAt = FieldValue.serverTimestamp();
        if (advance) {
          const entry: OrderHistoryEntry = {
            status: advance,
            note: `Нова Пошта: ${text}`,
            byName: "Нова Пошта",
            source: "novaposhta",
            at: Date.now(),
          };
          Object.assign(update, legacyFlagsForStatus(advance), {
            status: advance,
            statusUpdatedAt: FieldValue.serverTimestamp(),
            statusUpdatedByName: "Нова Пошта",
            history: FieldValue.arrayUnion(entry),
          });
        }
        try {
          await db.collection("orders").doc(order.id).update(update);
          result.updated += 1;
          if (advance) {
            result.statusChanged += 1;
            if ((await notifyOrderStatusTelegram(order.id, advance)).sent) result.notified += 1;
          }
        } catch (error) {
          result.errors.push(`${order.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    result.finishedAt = Date.now();
    lastResult = result;
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
};
