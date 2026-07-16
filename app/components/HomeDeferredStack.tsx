"use client";

import dynamic from "next/dynamic";

import SectionBoundary from "./SectionBoundary";

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
        <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
          <Auto playEntranceAnimations={false} showSummary />
        </SectionBoundary>
      </section>

      <section className="section-reveal home-section-stage relative w-full">
        <SectionBoundary title="Модуль брендів тимчасово недоступний">
          <BrandCarousel playEntranceAnimations={false} initialSyncedBrands={initialSyncedBrands} />
        </SectionBoundary>
      </section>
    </>
  );
}
