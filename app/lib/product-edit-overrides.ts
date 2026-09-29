import "server-only";

import type { CatalogProduct } from "app/lib/catalog-server";

// app/product/[code]/page.tsx's fast path renders from a sitemap-derived
// lookup index that's built once per server process and never refreshes
// itself — an admin edit made after that build has no way to reach it, and
// the page's own live-refresh call was made fire-and-forget (not awaited)
// specifically to stop paying its ~2-4s latency on every request, so it no
// longer patches that one request's render either. Net effect: an edited
// product's name/quantity/price could keep reading back as the pre-edit
// value indefinitely (until the next deploy), which looks identical to "the
// edit didn't take" to whoever made it.
//
// This is a small, separate override layer for exactly that gap:
// product-update/route.ts records the values 1C just confirmed here right
// after a successful save, and the product page merges them on top of
// whatever the sitemap index still says — so an edit is visible on the very
// next request regardless of how stale that underlying index is, without
// needing to touch (or pay the cost of rebuilding) that index at all.
const OVERRIDE_TTL_MS = 1000 * 60 * 60 * 6; // matches catalog-server.ts's FULL_CATALOG_STALE_TTL_MS
const OVERRIDE_MAX_ENTRIES = 500;

type ProductOverride = Partial<CatalogProduct> & { setAt: number };

// Next dev (Turbopack) compiles route handlers and pages into separate
// module graphs and re-evaluates this file once per graph — confirmed by
// instrumentation: a single product-update POST followed immediately by
// rendering that same product's page produced two DIFFERENT instances of
// this module, each with its own empty `overrides` Map, so a plain
// module-level `const overrides = new Map()` here silently only ever wrote
// to one graph's copy and read from another's. Anchoring it on `globalThis`
// (the standard fix for this class of dev-HMR/Turbopack singleton bug, also
// used for e.g. Prisma clients) makes every module instance share the one
// true process-wide Map regardless of how many graphs re-evaluate this file.
declare global {
  var __partsonProductEditOverrides: Map<string, ProductOverride> | undefined;
}

const overrides =
  globalThis.__partsonProductEditOverrides ??
  (globalThis.__partsonProductEditOverrides = new Map<string, ProductOverride>());

const normalizeKey = (code: string) => code.trim().toLowerCase();

export function setProductEditOverride(
  code: string,
  patch: Partial<Omit<CatalogProduct, "code">>
) {
  const key = normalizeKey(code);
  if (!key) return;

  if (overrides.size >= OVERRIDE_MAX_ENTRIES && !overrides.has(key)) {
    const oldestKey = overrides.keys().next().value;
    if (oldestKey !== undefined) overrides.delete(oldestKey);
  }

  overrides.set(key, { ...overrides.get(key), ...patch, setAt: Date.now() });
}

export function getProductEditOverride(
  code: string
): Partial<CatalogProduct> | null {
  const key = normalizeKey(code);
  const entry = overrides.get(key);
  if (!entry) return null;

  if (Date.now() - entry.setAt > OVERRIDE_TTL_MS) {
    overrides.delete(key);
    return null;
  }

  const patch: Partial<CatalogProduct> & { setAt?: number } = { ...entry };
  delete patch.setAt;
  return patch;
}
