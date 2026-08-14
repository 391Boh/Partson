"use client";

import dynamic from "next/dynamic";
import { startTransition, useEffect, useState } from "react";

import SectionBoundary from "./SectionBoundary";
import { scheduleIdle } from "app/lib/schedule-idle";

// Keep the placeholders close to the rendered height at every layout
// breakpoint. The sections become much taller in the one/two-column layouts;
// using only the desktop height here causes a large layout shift on phones and
// tablets as soon as the dynamic chunk resolves.
const ProductSectionFallback = () => (
  <div
    className="home-fade-in h-[1065px] bg-sky-50/60 sm:h-[1340px] lg:h-[568px]"
    aria-hidden="true"
  />
);

const AutoSectionFallback = () => (
  <div
    className="home-fade-in h-[750px] bg-slate-50/70 sm:h-[735px] lg:h-[460px] xl:h-[438px]"
    aria-hidden="true"
  />
);

const BrandsSectionFallback = () => (
  <div
    className="home-fade-in h-[573px] bg-[linear-gradient(180deg,#e2f0f7_0%,#c8e1ee_48%,#d8eaec_100%)] sm:h-[660px] lg:h-[617px]"
    aria-hidden="true"
  />
);

const loadProductSection = () => import("./tovar");
const loadAutoSection = () => import("./Auto");
const loadBrandsSection = () => import("./Brands");

const ProductFetcher = dynamic(loadProductSection, {
  // ProductFetcher derives parts of its first state from sessionStorage and
  // responsive media queries. Rendering it on the server can therefore
  // produce markup that differs from the first browser render on another
  // device or with a populated catalog cache, causing React hydration errors.
  // Keep only this interactive catalog browser client-only; the SEO section
  // below it is rendered as server HTML in app/page.tsx.
  ssr: false,
  loading: ProductSectionFallback,
});
const Auto = dynamic(loadAutoSection, {
  ssr: false,
  loading: AutoSectionFallback,
});
const BrandCarousel = dynamic(loadBrandsSection, {
  ssr: false,
  loading: BrandsSectionFallback,
});

type InitialSyncedBrand = {
  name: string;
  logo: string | null;
  description: string;
  productCount?: number;
  groupsCount?: number;
};

export default function HomeDeferredStack({
  initialSyncedBrands,
  initialProductTree,
}: {
  initialSyncedBrands?: InitialSyncedBrand[];
  initialProductTree?: unknown;
}) {
  // These three sections used to all start their dynamic import in the same
  // render, immediately on mount. Each is a heavy client bundle (framer-motion
  // + a few dozen DOM nodes), and having all three resolve and commit within
  // the same task is what produced ~150ms main-thread blocks — measured via
  // the Long Tasks API — landing right as a user scrolls past them on a fresh
  // homepage load. Staggering by a short delay per section keeps every chunk
  // requested almost immediately (still not scroll-triggered — the comment
  // below explains why that matters) while spreading their commits across
  // separate tasks so scroll input can interleave between them.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= 2) return;
    // Fetch/evaluate each following chunk in the first available idle slice,
    // then commit it as a transition. This keeps input responsive without the
    // former 1.5s artificial waterfall between Auto and Brands.
    const delay = stage === 0 ? 120 : 220;
    const preload = stage === 0 ? loadAutoSection : loadBrandsSection;
    return scheduleIdle(() => {
      const revealNextStage = () => {
        startTransition(() => setStage((prev) => Math.min(2, prev + 1)));
      };
      void preload().then(revealNextStage, revealNextStage);
    }, delay);
  }, [stage]);

  return (
    <>
      {/* The product section renders from the first pass because it is closest
          to the hero. Lower sections keep responsive placeholders and mount in
          spaced browser-idle slices, so layout stays stable without evaluating
          every heavy client chunk during the first scroll gesture. */}
      <section className="section-reveal home-section-stage relative w-full">
        <SectionBoundary title="Модуль товарів тимчасово недоступний">
          <ProductFetcher
            products={initialProductTree}
            playEntranceAnimations={false}
          />
        </SectionBoundary>
      </section>

      <section className="section-reveal home-section-stage relative w-full">
        {stage >= 1 ? (
          <div className="home-fade-in">
            <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
              <Auto playEntranceAnimations={false} showSummary />
            </SectionBoundary>
          </div>
        ) : (
          <AutoSectionFallback />
        )}
      </section>

      <section className="section-reveal home-section-stage relative w-full">
        {stage >= 2 ? (
          <div className="home-fade-in">
            <SectionBoundary title="Модуль брендів тимчасово недоступний">
              <BrandCarousel playEntranceAnimations={false} initialSyncedBrands={initialSyncedBrands} />
            </SectionBoundary>
          </div>
        ) : (
          <BrandsSectionFallback />
        )}
      </section>
    </>
  );
}
