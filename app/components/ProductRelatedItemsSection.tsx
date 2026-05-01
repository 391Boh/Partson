import "server-only";

import type { RelatedProductCardItem } from "app/lib/product-related";
import { getRelatedProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";

// Cap the SSR prefetch so the Suspense boundary does not hold the page past this.
// On cache hit (unstable_cache, 10 min TTL) the call returns in < 100 ms.
// On a cold miss the sequential 1C lookups can be slow; bail out quickly and
// let the client component continue after the main product content is visible.
const RELATED_SSR_TIMEOUT_MS = 900;

type ProductRelatedItemsSectionProps = {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    group?: string;
    subGroup?: string;
    category?: string;
  };
  euroRate?: number;
};

export default async function ProductRelatedItemsSection({
  product,
  euroRate = 50,
}: ProductRelatedItemsSectionProps) {
  const article = (product.article || "").trim();
  const code = (product.code || "").trim();
  const name = (product.name || "").trim();
  const producer = (product.producer || "").trim();
  const group = (product.group || "").trim();
  const subGroup = (product.subGroup || "").trim();
  const category = (product.category || "").trim();

  const fetched = await resolveWithTimeout<RelatedProductCardItem[] | null>(
    () => getRelatedProducts(article, code, name, producer, group, subGroup, category),
    null,
    RELATED_SSR_TIMEOUT_MS
  );

  // Pass null (not []) on timeout or empty so the client can fall back to
  // the similar-products fetch instead of rendering nothing.
  const initialItems = fetched && fetched.length > 0 ? fetched : null;

  return (
    <ProductRelatedItemsClientSection
      product={product}
      initialItems={initialItems}
      euroRate={euroRate}
    />
  );
}
