import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProductSitemapEntry } from "app/lib/product-sitemap";

// 1C has no per-product "updated at", so the product sitemap had no <lastmod>
// at all and Google kept serving product pages from crawls months old. This
// remembers a fingerprint of what each product page shows and the date it
// last changed, so <lastmod> moves only when the page really did.
const LASTMOD_PATH = path.join(process.cwd(), ".cache/product-sitemap-lastmod.json");

// Bump when the product page's markup changes for every product at once
// (e.g. new structured data): no product's lastmod is older than this.
const PRODUCT_PAGE_REVISED_AT = "2026-10-15T00:00:00.000Z";

type LastmodRecord = { f: string; d: string };

let store: Record<string, LastmodRecord> | null = null;
let loading: Promise<Record<string, LastmodRecord>> | null = null;
let writing: Promise<void> = Promise.resolve();

const loadStore = () => {
  if (store) return Promise.resolve(store);
  loading ??= readFile(LASTMOD_PATH, "utf8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, LastmodRecord>) : {};
    })
    .catch(() => ({}))
    .then((loaded) => (store = loaded));
  return loading;
};

const fingerprint = (entry: ProductSitemapEntry) =>
  [
    entry.name,
    entry.article,
    entry.producer,
    entry.group,
    entry.subGroup,
    entry.category,
    entry.hasPhoto ? 1 : 0,
    entry.priceEuro ?? "",
    entry.quantity > 0 ? 1 : 0,
  ].join("|");

/** Per-product lastmod (ISO), keyed by product code. */
export async function getProductSitemapLastModified(
  entries: ProductSitemapEntry[]
): Promise<Map<string, string>> {
  const records = await loadStore();
  const now = new Date().toISOString();
  const result = new Map<string, string>();
  let changed = false;

  for (const entry of entries) {
    const code = entry.code.trim();
    if (!code) continue;
    const f = fingerprint(entry);
    const known = records[code];
    if (!known || known.f !== f) {
      records[code] = { f, d: now };
      changed = true;
    }
    const date = records[code].d;
    result.set(code, date > PRODUCT_PAGE_REVISED_AT ? date : PRODUCT_PAGE_REVISED_AT);
  }

  if (changed) {
    // Serialized so the sitemap chunks rendering in parallel don't interleave
    // writes; a failed write only costs the next run a fresh date.
    writing = writing
      .then(async () => {
        await mkdir(path.dirname(LASTMOD_PATH), { recursive: true });
        await writeFile(LASTMOD_PATH, JSON.stringify(records));
      })
      .catch((error) => {
        console.warn("Failed to persist product sitemap lastmod", error);
      });
    await writing;
  }

  return result;
}
