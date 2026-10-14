"use client";

import dynamic from "next/dynamic";

import DeferredSection from "app/components/DeferredSection";
import ProductRecentlyViewedTracker from "app/components/ProductRecentlyViewedTracker";

type RecommendationProduct = {
  code: string;
  article: string;
  name?: string;
  producer?: string;
  quantity?: number;
  priceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
};

type ProductDeferredRecommendationsProps = {
  product: RecommendationProduct;
  euroRate?: number;
};

const ProductRecentlyViewedSection = dynamic(
  () => import("app/components/ProductRecentlyViewedSection"),
  {
    ssr: false,
    // No skeleton: most visitors have no recently viewed products, so the
    // section renders nothing and a placeholder would only collapse under the
    // reader (CLS). It mounts 500px before the viewport, out of sight.
    loading: () => null,
  }
);

export default function ProductDeferredRecommendations({
  product,
  euroRate = 50,
}: ProductDeferredRecommendationsProps) {
  return (
    <div className="space-y-2.5">
      <ProductRecentlyViewedTracker product={product} />
      <DeferredSection
        rootMargin="500px"
        fallback={null}
        minHeight="0px"
        className="min-w-0"
      >
        <ProductRecentlyViewedSection product={product} euroRate={euroRate} />
      </DeferredSection>
    </div>
  );
}
