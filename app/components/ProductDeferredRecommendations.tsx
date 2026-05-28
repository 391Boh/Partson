"use client";

import dynamic from "next/dynamic";

import DeferredSection from "app/components/DeferredSection";

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

const ProductRelatedItemsClientSection = dynamic(
  () => import("app/components/ProductRelatedItemsClientSection"),
  {
    ssr: false,
    loading: () => <RecommendationSkeleton titleWidth="w-72" cards={3} />,
  }
);

const ProductRecentlyViewedSection = dynamic(
  () => import("app/components/ProductRecentlyViewedSection"),
  {
    ssr: false,
    loading: () => <RecommendationSkeleton titleWidth="w-64" cards={3} />,
  }
);

const RecommendationSkeleton = ({
  titleWidth = "w-64",
  cards = 3,
}: {
  titleWidth?: string;
  cards?: number;
}) => (
  <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-white/92 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2.5">
      <div>
        <div className="h-3 w-24 animate-pulse rounded-full bg-sky-100" />
        <div className={`mt-2 h-6 ${titleWidth} max-w-full animate-pulse rounded-full bg-slate-100`} />
      </div>
      <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5">
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="h-[92px] min-w-0 animate-pulse rounded-[14px] border border-slate-200 bg-slate-100 sm:h-[88px]"
        />
      ))}
    </div>
  </section>
);

export default function ProductDeferredRecommendations({
  product,
  euroRate = 50,
}: ProductDeferredRecommendationsProps) {
  return (
    <div className="space-y-2.5">
      <DeferredSection
        rootMargin="260px"
        fallback={<RecommendationSkeleton titleWidth="w-72" cards={3} />}
        minHeight="196px"
        className="min-w-0"
        fallbackDelayMs={9000}
      >
        <ProductRelatedItemsClientSection
          product={product}
          initialItems={null}
          euroRate={euroRate}
        />
      </DeferredSection>

      <DeferredSection
        rootMargin="180px"
        fallback={<RecommendationSkeleton titleWidth="w-64" cards={2} />}
        minHeight="152px"
        className="min-w-0"
        fallbackDelayMs={12000}
      >
        <ProductRecentlyViewedSection product={product} euroRate={euroRate} />
      </DeferredSection>
    </div>
  );
}
