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
    loading: () => <RecommendationSkeleton titleWidth="w-56" cards={3} />,
  }
);

const ProductRecentlyViewedSection = dynamic(
  () => import("app/components/ProductRecentlyViewedSection"),
  {
    ssr: false,
    loading: () => <RecommendationSkeleton titleWidth="w-52" cards={3} />,
  }
);

const RecommendationSkeleton = ({
  titleWidth = "w-64",
  cards = 3,
}: {
  titleWidth?: string;
  cards?: number;
}) => {
  const listClass =
    cards > 2
      ? "mt-3 grid grid-flow-col grid-rows-1 auto-cols-[minmax(276px,92%)] gap-2 overflow-hidden sm:auto-cols-[minmax(320px,72%)] sm:gap-2.5 lg:grid-rows-2 lg:auto-cols-[minmax(280px,31%)] lg:gap-2.5"
      : "mt-3 grid grid-flow-col grid-rows-1 auto-cols-[minmax(276px,92%)] gap-2 overflow-hidden sm:auto-cols-[minmax(320px,72%)] sm:gap-2.5 lg:auto-cols-[minmax(280px,31%)] lg:gap-2.5";

  return (
    <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.92),rgba(248,250,252,0.98))] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.055)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
      <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2.5">
        <div>
          <div className="h-3 w-24 animate-pulse rounded-full bg-sky-100" />
          <div className={`mt-2 h-6 ${titleWidth} max-w-full animate-pulse rounded-full bg-slate-100`} />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className={listClass}>
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            className="h-[92px] min-w-0 animate-pulse rounded-[14px] border border-slate-200 bg-slate-100 sm:h-[88px]"
          />
        ))}
      </div>
    </section>
  );
};

export default function ProductDeferredRecommendations({
  product,
  euroRate = 50,
}: ProductDeferredRecommendationsProps) {
  return (
    <div className="space-y-2.5">
      <DeferredSection
        rootMargin="1120px"
        fallback={<RecommendationSkeleton titleWidth="w-56" cards={3} />}
        minHeight="172px"
        className="min-w-0"
        initiallyVisible
        fallbackDelayMs={180}
      >
        <ProductRelatedItemsClientSection
          product={product}
          initialItems={null}
          euroRate={euroRate}
        />
      </DeferredSection>

      <DeferredSection
        rootMargin="1400px"
        fallback={<RecommendationSkeleton titleWidth="w-52" cards={3} />}
        minHeight="172px"
        className="min-w-0"
        initiallyVisible
        fallbackDelayMs={220}
      >
        <ProductRecentlyViewedSection product={product} euroRate={euroRate} />
      </DeferredSection>
    </div>
  );
}
