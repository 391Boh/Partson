import "server-only";

import { getSnapshotPriceLookup } from "./catalog-server";
import { getProductEditOverride } from "./product-edit-overrides";

export type PublicProductPriceSource = { code: string; article?: string; priceEuro?: number | null };
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/** Google, the page and Merchant Center use the regular public sale price.
 * Exact product codes win over articles, which can repeat across brands.
 * Explicitly removing a price must not resurrect an older sitemap value. */
export function resolvePublicProductPriceEuro(
  product: PublicProductPriceSource,
  prices?: ReturnType<typeof getSnapshotPriceLookup>
): number | null {
  const code = (product.code || "").trim();
  const override = code ? getProductEditOverride(code) : null;
  if (override && Object.hasOwn(override, "priceEuro")) return positive(override.priceEuro);
  const current = code ? (prices ?? getSnapshotPriceLookup([code]))[code.toLowerCase()] : undefined;
  if (current) return positive(current.priceEuro);
  return positive(product.priceEuro);
}
