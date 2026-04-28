import "server-only";

import ProductRelatedItemsClientSection from "app/components/ProductRelatedItemsClientSection";

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
};

export default function ProductRelatedItemsSection({
  product,
}: ProductRelatedItemsSectionProps) {
  return (
    <ProductRelatedItemsClientSection
      product={product}
      initialItems={null}
    />
  );
}
