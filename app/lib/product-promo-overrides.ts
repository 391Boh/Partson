import "server-only";

type PromoOverride = { value: number; at: number };
declare global {
  var __partsonProductPromoOverrides: Map<string, PromoOverride> | undefined;
}

// Shared across Next's route module graphs, like product-edit-overrides.
// Never add the partner amount to CatalogProduct/public listing payloads.
const overrides = globalThis.__partsonProductPromoOverrides ??
  (globalThis.__partsonProductPromoOverrides = new Map<string, PromoOverride>());
const normalize = (key: string) => key.replace(/\s+/g, " ").trim().toLowerCase();
const TTL_MS = 6 * 60 * 60 * 1000;

export function setProductPromoPriceOverride(code: string, article: string, value: number) {
  const entry = { value, at: Date.now() };
  for (const rawKey of [code, article]) {
    const key = normalize(rawKey);
    if (!key) continue;
    if (overrides.size >= 1000 && !overrides.has(key)) {
      const oldest = overrides.keys().next().value;
      if (oldest !== undefined) overrides.delete(oldest);
    }
    overrides.set(key, entry);
  }
}

export function getProductPromoPriceOverride(key: string, snapshotStartedAt: number): number | undefined {
  const entry = overrides.get(normalize(key));
  if (!entry) return undefined;
  if (Date.now() - entry.at > TTL_MS) { overrides.delete(normalize(key)); return undefined; }
  // A scan started after the confirmed write is authoritative again.
  return entry.at >= snapshotStartedAt ? entry.value : undefined;
}
