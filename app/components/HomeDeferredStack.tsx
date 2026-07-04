"use client";

import dynamic from "next/dynamic";
import DeferredSection from "./DeferredSection";
import SectionBoundary from "./SectionBoundary";

function ProductFetcherSkeleton() {
  return (
    <div className="page-shell-inline relative z-10 grid grid-cols-1 items-start gap-6 py-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="hidden h-64 rounded-xl border border-sky-200/60 bg-sky-50/40 lg:block skeleton-item" />
      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-item h-[180px] rounded-xl border border-sky-200/50 bg-[image:linear-gradient(148deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.94)_52%,rgba(219,234,254,0.90)_100%)] sm:h-[215px]"
          />
        ))}
      </div>
    </div>
  );
}

const ProductFetcher = dynamic(() => import("./tovar"), {
  ssr: false,
  loading: ProductFetcherSkeleton,
});
const Auto = dynamic(() => import("./Auto"), {
  ssr: false,
  loading: () => null,
});
const BrandCarousel = dynamic(() => import("./Brands"), {
  loading: () => null,
});

export default function HomeDeferredStack() {
  return (
    <>
      <DeferredSection
        className="section-reveal home-section-stage relative w-full"
        minHeight="clamp(360px, 74svh, 520px)"
        rootMargin="420px"
        fallbackDelayMs={1400}
      >
        <section className="relative w-full">
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher playEntranceAnimations={false} />
          </SectionBoundary>
        </section>
      </DeferredSection>

      <DeferredSection
        className="section-reveal home-section-stage relative w-full"
        minHeight="clamp(260px, 48svh, 380px)"
        rootMargin="360px"
        fallbackDelayMs={1800}
      >
        <section className="relative w-full">
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto
              playEntranceAnimations={false}
              showSummary
            />
          </SectionBoundary>
        </section>
      </DeferredSection>

      <DeferredSection
        className="section-reveal home-section-stage relative w-full"
        minHeight="clamp(300px, 62svh, 380px)"
        rootMargin="320px"
        fallbackDelayMs={2200}
      >
        <section className="relative w-full">
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={false} />
          </SectionBoundary>
        </section>
      </DeferredSection>
    </>
  );
}
