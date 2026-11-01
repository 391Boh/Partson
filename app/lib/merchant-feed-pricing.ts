import "server-only";

import { createHash } from "node:crypto";
import { getSnapshotPriceLookup, toPriceUah } from "./catalog-server";
import { resolvePublicProductPriceEuro } from "./public-product-price";

export type MerchantFeedPricing = {
  version: 1;
  generatedAt: number;
  xmlHash: string;
  pricesEuro: Record<string, number>;
};
export const merchantFeedHash = (xml: string) => createHash("sha256").update(xml).digest("hex");
export const createMerchantFeedPricing = (xml: string, pricesEuro: Record<string, number>): MerchantFeedPricing => ({
  version: 1, generatedAt: Date.now(), xmlHash: merchantFeedHash(xml), pricesEuro,
});

export function isMerchantFeedPricing(value: unknown, xml: string): value is MerchantFeedPricing {
  if (!value || typeof value !== "object") return false;
  const data = value as MerchantFeedPricing;
  return data.version === 1 && Number.isFinite(data.generatedAt) && data.generatedAt <= Date.now() + 60_000 &&
    Date.now() - data.generatedAt < 24 * 60 * 60 * 1000 && data.xmlHash === merchantFeedHash(xml) &&
    !!data.pricesEuro && typeof data.pricesEuro === "object" && !Array.isArray(data.pricesEuro) &&
    Object.values(data.pricesEuro).every(price => typeof price === "number" && Number.isFinite(price) && price > 0);
}

/** Only rewrite prices on our own generated item nodes, never shipping rates.
 * Stored EUR values let a daily feed follow today's rate without a 1C sweep. */
export function repriceMerchantFeed(xml: string, pricing: MerchantFeedPricing, euroRate: number): string {
  if (!isMerchantFeedPricing(pricing, xml) || !Number.isFinite(euroRate) || euroRate <= 0) {
    throw new Error("Invalid Merchant price snapshot");
  }
  const current = getSnapshotPriceLookup(Object.keys(pricing.pricesEuro));
  return xml.replace(/<item>[^]*?<\/item>/g, (item) => {
    const encodedCode = item.match(/<g:id>([^]*?)<\/g:id>/)?.[1];
    if (!encodedCode) return "";
    const code = encodedCode.replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[entity]!);
    if (!Object.hasOwn(pricing.pricesEuro, code)) return "";
    const priceEuro = resolvePublicProductPriceEuro({ code, priceEuro: pricing.pricesEuro[code] }, current);
    const price = toPriceUah(priceEuro, euroRate);
    if (price == null) return "";
    return item.replace(/<g:price>[^]*?<\/g:price>/, `<g:price>${price.toFixed(2)} UAH</g:price>`);
  });
}
