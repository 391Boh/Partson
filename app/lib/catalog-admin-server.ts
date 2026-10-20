import "server-only";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";

import { clearAllOneCCache, oneCRequest } from "app/api/_lib/oneC";
import { clearCatalogPageRouteCache } from "app/lib/catalog-page-route-cache";
import { invalidateFullCatalogSnapshot } from "app/lib/catalog-server";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";

// 1C runs catalog admin actions through the product edit endpoint with a
// "Дія" field (see ВыполнитьАдминДию in ОбщегоНазначения), so updating 1C
// only means replacing that module's text.
const ONEC_EDIT_ENDPOINT = (process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").trim();

export const CATALOG_NAME_MAX_LENGTH = 100;

export class CatalogAdminError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export type CatalogGroup = { code: string; name: string; parentCode: string; products: number };
export type CatalogProducer = { id: string; name: string; products: number };

// Same normalization 1C applies (НормалізуватиНазвуДовідника), so the site
// rejects what 1C would reject before a round trip.
export const normalizeCatalogName = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

type OneCActionResult = Record<string, unknown> & {
  success?: boolean;
  error_message?: string;
  details?: string;
};

const runOneCAction = async (action: string, params: Record<string, unknown> = {}) => {
  const response = await oneCRequest(ONEC_EDIT_ENDPOINT, {
    method: "POST",
    body: { Дія: action, ...params },
    timeoutMs: 15_000,
    retries: 0,
    cacheTtlMs: 0,
  });
  let parsed: OneCActionResult | null = null;
  try {
    parsed = JSON.parse(response.text) as OneCActionResult;
  } catch {
    parsed = null;
  }
  if (response.status < 200 || response.status >= 300 || !parsed) {
    throw new CatalogAdminError("1С не відповіла на запит");
  }
  if (parsed.success !== true) {
    const message = [parsed.error_message, parsed.details].filter(Boolean).join(": ");
    // An un-updated 1C treats {"Дія"} as a product edit without a code.
    if (/Не передан Код/i.test(message)) {
      throw new CatalogAdminError("1С ще не підтримує цю дію: оновіть модуль ОбщегоНазначения", 501);
    }
    throw new CatalogAdminError(message || "1С повернула помилку", 422);
  }
  return parsed;
};

const readNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const listCatalogGroups = async (): Promise<CatalogGroup[]> => {
  const result = await runOneCAction("СписокГруп");
  const items = Array.isArray(result.items) ? result.items : [];
  return items.map((item: Record<string, unknown>) => ({
    code: readString(item.code),
    name: readString(item.name),
    parentCode: readString(item.parent_code),
    products: readNumber(item.products),
  })).filter((group) => group.code);
};

export const listCatalogProducers = async (): Promise<CatalogProducer[]> => {
  const result = await runOneCAction("СписокВиробників");
  const items = Array.isArray(result.items) ? result.items : [];
  return items.map((item: Record<string, unknown>) => ({
    id: readString(item.id),
    name: readString(item.name),
    products: readNumber(item.products),
  })).filter((producer) => producer.name);
};

export const PRODUCER_NAMES_TAG = "catalog-producer-names";

// Producer names for public autocomplete. [] while 1C lacks the action, so
// callers keep their own static list.
export const getCatalogProducerNames = unstable_cache(
  async () => (await listCatalogProducers().catch(() => [])).map((producer) => producer.name),
  ["catalog-producer-names-v1"],
  { revalidate: 60 * 10, tags: [PRODUCER_NAMES_TAG] }
);

// Every cache that holds group or producer names: the 1C response cache,
// catalog pages, the full catalog snapshot, the category tree and product pages.
const invalidateCatalogNames = () => {
  clearAllOneCCache();
  clearCatalogPageRouteCache();
  invalidateFullCatalogSnapshot();
  try {
    revalidateTag("product-tree", { expire: 0 });
    revalidateTag("product-page-data", { expire: 0 });
    revalidateTag(GROUP_RENAMES_TAG, { expire: 0 });
    revalidateTag(PRODUCER_NAMES_TAG, { expire: 0 });
    revalidatePath("/groups", "layout");
    revalidatePath("/katalog", "page");
  } catch {
    // Revalidation can throw outside a request context.
  }
};

export const GROUP_RENAMES_COLLECTION = "catalogGroupRenames";
export const GROUP_RENAMES_TAG = "catalog-group-renames";

export const renameCatalogGroup = async (
  code: string,
  name: string,
  admin: { uid: string; email: string }
) => {
  const result = await runOneCAction("ПерейменуватиГрупу", { Код: code, НоваНазва: name });
  const oldName = readString(result.old_name);
  const newName = readString(result.name) || name;
  if (oldName && oldName !== newName) {
    // Group URLs are built from names; this history lets the old URL
    // redirect to the renamed group (app/lib/group-rename-redirects.ts).
    await getFirebaseAdminDb().collection(GROUP_RENAMES_COLLECTION).add({
      code,
      from: oldName,
      to: newName,
      parentName: readString(result.parent_name),
      byUid: admin.uid,
      byEmail: admin.email,
      at: new Date(),
    }).catch(() => undefined);
  }
  invalidateCatalogNames();
  return { code, oldName, name: newName };
};

export const createCatalogProducer = async (name: string) => {
  const result = await runOneCAction("СтворитиВиробника", { Назва: name });
  invalidateCatalogNames();
  return {
    id: readString(result.id),
    name: readString(result.name) || name,
    created: result.created === true,
  };
};
