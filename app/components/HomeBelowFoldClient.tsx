"use client";

import dynamic from "next/dynamic";

import HomeDeferredStack from "./HomeDeferredStack";
import SectionBoundary from "./SectionBoundary";

// This block changes from a long single-column layout on mobile to a compact
// desktop layout, so its placeholder must be responsive too. A single 1200px
// height still left a shift of more than 800px on tablet-sized viewports.
const AdvantagesSectionFallback = () => (
  <div
    className="h-[2446px] bg-cyan-50/60 sm:h-[2050px] lg:h-[1330px] xl:h-[1200px]"
    aria-hidden="true"
  />
);

const loadAdvantagesSection = () => import("./AdvantagesSection");

const AdvantagesSection = dynamic(loadAdvantagesSection, {
  ssr: false,
  loading: AdvantagesSectionFallback,
});

type InitialSyncedBrand = {
  name: string;
  logo: string | null;
  description: string;
  productCount?: number;
  groupsCount?: number;
};

export default function HomeBelowFoldClient({
  initialSyncedBrands,
  initialProductTree,
}: {
  initialSyncedBrands?: InitialSyncedBrand[];
  initialProductTree?: unknown;
}) {
  return (
    <>
      <HomeDeferredStack
        initialSyncedBrands={initialSyncedBrands}
        initialProductTree={initialProductTree}
      />
      <div className="home-section-stage">
        <SectionBoundary title="Інформаційний блок тимчасово недоступний">
          <AdvantagesSection />
        </SectionBoundary>
      </div>
    </>
  );
}
