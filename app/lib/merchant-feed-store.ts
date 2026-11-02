import "server-only";

import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { isMerchantFeedPricing, type MerchantFeedPricing } from "./merchant-feed-pricing";
import { isPublicCatalogProduct } from "./public-catalog-product";
import type { ProductSitemapEntry } from "./product-sitemap";

type SavedFeed = { xml: string; pricing: MerchantFeedPricing; catalogEntries?: ProductSitemapEntry[] };
const directory = () => path.join(process.cwd(), ".cache");

export async function readMerchantFeedSnapshot(root = directory()): Promise<SavedFeed | null> {
  try {
    const [xml, raw] = await Promise.all([
      readFile(path.join(root, "google-merchant-feed.xml"), "utf8"),
      readFile(path.join(root, "google-merchant-feed.pricing.json"), "utf8"),
    ]);
    const pricing: unknown = JSON.parse(raw);
    return xml.trim() && isMerchantFeedPricing(pricing, xml) ? { xml, pricing } : null;
  } catch { return null; }
}

export async function writeMerchantFeedSnapshot(snapshot: SavedFeed, root = directory()) {
  if (!isMerchantFeedPricing(snapshot.pricing, snapshot.xml)) throw new Error("Invalid Merchant snapshot pair");
  await mkdir(root, { recursive: true });
  const token = `${process.pid}-${Date.now()}`;
  const xml = path.join(root, "google-merchant-feed.xml"), json = path.join(root, "google-merchant-feed.pricing.json");
  await Promise.all([
    // The public XML may be served by nginx's static alias, under another UID.
    writeFile(`${xml}.${token}.tmp`, snapshot.xml, { mode: 0o644 }),
    writeFile(`${json}.${token}.tmp`, JSON.stringify(snapshot.pricing), { mode: 0o600 }),
  ]);
  // A concurrent reader either sees a matching pair or refuses it and retries.
  await rename(`${json}.${token}.tmp`, json);
  await rename(`${xml}.${token}.tmp`, xml);
  if (snapshot.catalogEntries) {
    const entries = snapshot.catalogEntries.filter(isPublicCatalogProduct);
    const source = JSON.stringify({ generatedAt: new Date(snapshot.pricing.generatedAt).toISOString(), count: entries.length, entries });
    for (const name of ["product-sitemap-entries.json", "product-sitemap-priced-entries.json"]) {
      const file = path.join(root, name);
      await writeFile(`${file}.${token}.tmp`, source, { mode: 0o600 });
      await rename(`${file}.${token}.tmp`, file);
    }
  }
}
