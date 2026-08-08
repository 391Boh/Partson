"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import SectionBoundary from "./SectionBoundary";
import { scheduleIdle } from "app/lib/schedule-idle";

// Keep the placeholders close to the rendered height at every layout
// breakpoint. The sections become much taller in the one/two-column layouts;
// using only the desktop height here causes a large layout shift on phones and
// tablets as soon as the dynamic chunk resolves.
const ProductSectionFallback = () => (
  <div
    className="h-[1065px] bg-sky-50/60 sm:h-[1340px] lg:h-[568px]"
    aria-hidden="true"
  />
);

const AutoSectionFallback = () => (
  <div
    className="h-[750px] bg-slate-50/70 sm:h-[735px] lg:h-[460px] xl:h-[438px]"
    aria-hidden="true"
  />
);

const BrandsSectionFallback = () => (
  <div
    className="h-[573px] bg-[linear-gradient(180deg,#e2f0f7_0%,#c8e1ee_48%,#d8eaec_100%)] sm:h-[660px] lg:h-[617px]"
    aria-hidden="true"
  />
);

const loadProductSection = () => import("./tovar");
const loadAutoSection = () => import("./Auto");
const loadBrandsSection = () => import("./Brands");

const ProductFetcher = dynamic(loadProductSection, {
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
    return scheduleIdle(() => setStage((prev) => Math.min(2, prev + 1)));
  }, [stage]);

  // Warm both chunks' network fetch immediately, independent of `stage` —
  // only the render commit is deferred above. import() de-dupes against the
  // in-flight promise dynamic() later awaits, so this loses no load time
  // while still keeping the two commits apart.
  useEffect(() => {
    loadAutoSection();
    loadBrandsSection();
  }, []);

  return (
    <>
      {/* These sections deliberately render from the first pass. Deferring
          their mount until a scroll observer fires made fast vertical scroll
          depend on observer timing, chunk download and API startup. Dynamic
          imports still keep separate chunks, while rendering them here makes
          the browser request every chunk immediately and removes scroll as a
          loading trigger. Responsive fallbacks keep the document stable until
          each chunk is ready. */}
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
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto playEntranceAnimations={false} showSummary />
          </SectionBoundary>
        ) : (
          <AutoSectionFallback />
        )}
      </section>

      <section className="section-reveal home-section-stage relative w-full">
        {stage >= 2 ? (
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={false} initialSyncedBrands={initialSyncedBrands} />
          </SectionBoundary>
        ) : (
          <BrandsSectionFallback />
        )}
      </section>
    </>
  );
}
