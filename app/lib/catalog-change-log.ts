import "server-only";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";

// Journal of changes made to the 1C nomenclature through the site (admin
// product/price/photo/description edits, groups, producers) and by the VITOL
// supplier sync. Shown in the admin "Каталог → Журнал змін" tab.
// Edits made directly in the 1C desktop client never pass through here.

export const CATALOG_CHANGE_LOG_COLLECTION = "catalogChangeLog";

export type CatalogChangeAction =
  | "product.create"
  | "product.update"
  | "product.price"
  | "product.description"
  | "product.photo"
  | "products.move"
  | "group.create"
  | "group.rename"
  | "group.delete"
  | "producer.create"
  | "producer.rename"
  | "producer.delete"
  | "supplier.sync";

export type CatalogChangeEntry = {
  action: CatalogChangeAction;
  /** Who did it: admin email, or "VITOL" for the sync. */
  actor: string;
  /** What it is about: product name / group name / producer name. */
  target?: string;
  /** 1C code or article, when there is one. */
  code?: string;
  /** Short human-readable summary of the change (Ukrainian). */
  details?: string;
  /** How many items the change covered (moves, sync runs). */
  count?: number;
};

export type CatalogChangeRecord = CatalogChangeEntry & { id: string; at: number };

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : undefined;

/** Fire-and-forget: a journal write must never fail or slow the change itself. */
export function recordCatalogChange(entry: CatalogChangeEntry): Promise<void> {
  return writeCatalogChange(entry).catch((error) => {
    console.warn("[catalog-change-log] write failed:", error instanceof Error ? error.message : error);
  });
}

export async function writeCatalogChange(entry: CatalogChangeEntry) {
  const record: Record<string, unknown> = {
    action: entry.action,
    actor: clip(entry.actor, 120) || "невідомо",
    at: Date.now(),
  };
  const target = clip(entry.target, 200);
  const code = clip(entry.code, 64);
  const details = clip(entry.details, 600);
  if (target) record.target = target;
  if (code) record.code = code;
  if (details) record.details = details;
  if (typeof entry.count === "number" && Number.isFinite(entry.count)) record.count = entry.count;
  await getFirebaseAdminDb().collection(CATALOG_CHANGE_LOG_COLLECTION).add(record);
}

export async function listCatalogChanges(options: { limit?: number; before?: number } = {}) {
  const limit = Math.min(Math.max(Math.floor(options.limit || 100), 1), 300);
  let query = getFirebaseAdminDb()
    .collection(CATALOG_CHANGE_LOG_COLLECTION)
    .orderBy("at", "desc")
    .limit(limit + 1);
  if (options.before && Number.isFinite(options.before)) query = query.where("at", "<", options.before);
  const snapshot = await query.get();
  const items = snapshot.docs.slice(0, limit).map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CatalogChangeRecord, "id">) }));
  return { items, hasMore: snapshot.docs.length > limit };
}
