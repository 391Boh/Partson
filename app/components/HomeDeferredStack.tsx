"use client";

import dynamic from "next/dynamic";

import DeferredSection from "./DeferredSection";
import SectionBoundary from "./SectionBoundary";

const ProductFetcher = dynamic(() => import("./tovar"), {
  loading: () => <div className="h-[320px] animate-pulse bg-sky-50/60" aria-hidden="true" />,
});
const Auto = dynamic(() => import("./Auto"), {
  loading: () => <div className="h-[420px] animate-pulse bg-slate-50/70" aria-hidden="true" />,
});
const BrandCarousel = dynamic(() => import("./Brands"), {
  loading: () => <div className="h-[300px] animate-pulse bg-sky-50/70" aria-hidden="true" />,
});

export default function HomeDeferredStack() {
  return (
    <>
      <section className="section-reveal home-section-stage relative w-full">
        <DeferredSection rootMargin="60px" minHeight="320px" fallback={<div className="h-[320px] bg-sky-50/40" />}>
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher playEntranceAnimations={false} />
          </SectionBoundary>
        </DeferredSection>
      </section>

      <section className="section-reveal home-section-stage relative w-full">
        <DeferredSection rootMargin="0px" minHeight="420px" fallback={<div className="h-[420px] bg-slate-50/40" />}>
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto playEntranceAnimations={false} showSummary />
          </SectionBoundary>
        </DeferredSection>
      </section>

      <section className="section-reveal home-section-stage relative w-full">
        <DeferredSection rootMargin="80px" minHeight="300px" fallback={<div className="h-[300px] bg-sky-50/40" />}>
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={false} />
          </SectionBoundary>
        </DeferredSection>
      </section>
    </>
  );
}
