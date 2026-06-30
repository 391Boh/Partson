"use client";

import dynamic from "next/dynamic";
import DeferredSection from "./DeferredSection";
import SectionBoundary from "./SectionBoundary";

const ProductFetcher = dynamic(() => import("./tovar"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="clamp(360px, 74svh, 520px)" />,
});
const Auto = dynamic(() => import("./Auto"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="112px" />,
});
const BrandCarousel = dynamic(() => import("./Brands"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="clamp(300px, 62svh, 380px)" />,
});

const HomeSectionFallback = ({
  minHeight,
}: {
  minHeight: string;
}) => (
  <div className="page-shell-inline">
    <div className="rounded-[18px] border border-sky-100/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] p-2.5 shadow-[0_10px_22px_rgba(15,23,42,0.045)] sm:rounded-[28px] sm:p-5 sm:shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="h-4 w-32 rounded-full bg-slate-200/80 sm:h-5 sm:w-36" />
      <div
        className="mt-3 rounded-[18px] bg-[linear-gradient(135deg,rgba(226,232,240,0.76),rgba(255,255,255,0.9),rgba(224,242,254,0.7))] sm:mt-4 sm:rounded-[22px]"
        style={{ minHeight }}
      />
    </div>
  </div>
);

export default function HomeDeferredStack() {
  return (
    <>
      <DeferredSection
        className="section-reveal home-section-stage relative w-full"
        minHeight="clamp(360px, 74svh, 520px)"
        rootMargin="1180px"
        fallbackDelayMs={1000}
        fallback={<HomeSectionFallback minHeight="clamp(360px, 74svh, 520px)" />}
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
        rootMargin="1120px"
        fallbackDelayMs={400}
        fallback={<HomeSectionFallback minHeight="clamp(260px, 48svh, 380px)" />}
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
        rootMargin="1040px"
        fallbackDelayMs={1800}
        fallback={<HomeSectionFallback minHeight="clamp(300px, 62svh, 380px)" />}
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
