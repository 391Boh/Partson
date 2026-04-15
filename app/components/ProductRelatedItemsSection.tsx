import "server-only";

import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";
import { getRelatedProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_RELATED_INITIAL_TIMEOUT_MS = 1700;

type ProductRelatedItemsSectionProps = {
  product: {
    code: string;
    article: string;
  };
};

export default async function ProductRelatedItemsSection({
  product,
}: ProductRelatedItemsSectionProps) {
  const initialItems = await resolveWithTimeout(
    () => getRelatedProducts(product.article, product.code),
    null,
    PRODUCT_RELATED_INITIAL_TIMEOUT_MS
  );

  return (
    <ProductRelatedItemsClientSection
      product={product}
      initialItems={Array.isArray(initialItems) ? initialItems : null}
    />
  );
}
