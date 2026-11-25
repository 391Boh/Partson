import "server-only";

import { oneCRequest } from "app/api/_lib/oneC";

// Analog numbers from the 1C register ор_ГруппыАналогов: the "auto-…" groups
// built from the "(…)" lists in product names and the "bm-…" groups loaded
// from supplier catalogs (BM Parts). Read through the admin action
// АналогиТоварів on the edit endpoint (see ВыполнитьАдминДию).
export type RegisterAnalog = { article: string; brand: string; code: string };

const ONEC_EDIT_ENDPOINT = (process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").trim();
const CACHE_TTL_MS = 30 * 60 * 1000;
const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1" ||
  process.env.npm_lifecycle_event === "build";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function getProductRegisterAnalogs(code: string): Promise<RegisterAnalog[]> {
  const productCode = code.trim();
  // The build renders from recorded snapshots; the action is not one of
  // them, and the page fills the list on its first revalidation.
  if (!productCode || isProductionBuildPhase) return [];
  try {
    const response = await oneCRequest(ONEC_EDIT_ENDPOINT, {
      method: "POST",
      body: { Дія: "АналогиТоварів", Коди: [productCode] },
      timeoutMs: 4_000,
      retries: 0,
      cacheTtlMs: CACHE_TTL_MS,
    });
    if (response.status < 200 || response.status >= 300) return [];
    const payload = JSON.parse(response.text) as {
      success?: boolean;
      items?: Array<{ code?: unknown; analogs?: unknown }>;
    };
    // An older 1C module answers with "Невідома дія" (success false).
    if (payload.success !== true || !Array.isArray(payload.items)) return [];
    const item = payload.items.find((entry) => text(entry.code) === productCode);
    if (!item || !Array.isArray(item.analogs)) return [];
    return item.analogs
      .map((entry) => {
        const record = (entry ?? {}) as Record<string, unknown>;
        return { article: text(record.article), brand: text(record.brand), code: text(record.code) };
      })
      .filter((entry) => entry.article.length > 0);
  } catch {
    return [];
  }
}
