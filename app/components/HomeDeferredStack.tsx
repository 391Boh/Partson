"use client";

import dynamic from "next/dynamic";
import DeferredSection from "./DeferredSection";
import SectionBoundary from "./SectionBoundary";

const ProductFetcher = dynamic(() => import("./tovar"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="520px" />,
});
const Auto = dynamic(() => import("./Auto"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="560px" />,
});
const BrandCarousel = dynamic(() => import("./Brands"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="380px" />,
});

const HomeSectionFallback = ({
  minHeight,
}: {
  minHeight: string;
}) => (
  <div className="page-shell-inline">
    <div className="rounded-[28px] border border-sky-100/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="h-5 w-36 rounded-full bg-slate-200/80" />
      <div
        className="mt-4 rounded-[22px] bg-[linear-gradient(135deg,rgba(226,232,240,0.8),rgba(255,255,255,0.92),rgba(224,242,254,0.76))]"
        style={{ minHeight }}
      />
    </div>
  </div>
);

export default function HomeDeferredStack() {
  return (
    <>
      <DeferredSection
        className="section-reveal relative w-full py-1"
        minHeight="560px"
        rootMargin="220px"
        fallbackDelayMs={10000}
        fallback={<HomeSectionFallback minHeight="520px" />}
      >
        <section className="relative w-full py-1">
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher playEntranceAnimations={false} />
          </SectionBoundary>
        </section>
      </DeferredSection>

      <DeferredSection
        className="section-reveal relative w-full py-1"
        minHeight="600px"
        rootMargin="180px"
        fallbackDelayMs={12000}
        fallback={<HomeSectionFallback minHeight="560px" />}
      >
        <section className="relative w-full py-1">
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto
              playEntranceAnimations={false}
              showSummary
            />
          </SectionBoundary>
        </section>
      </DeferredSection>

      <DeferredSection
        className="section-reveal relative w-full py-1"
        minHeight="420px"
        rootMargin="140px"
        fallbackDelayMs={14000}
        fallback={<HomeSectionFallback minHeight="380px" />}
      >
        <section className="relative w-full py-1">
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={false} />
          </SectionBoundary>
        </section>
      </DeferredSection>
    </>
  );
}
