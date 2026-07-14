"use client";

import dynamic from "next/dynamic";

import DeferredSection from "./DeferredSection";
import HomeDeferredStack from "./HomeDeferredStack";
import SectionBoundary from "./SectionBoundary";

const AdvantagesSection = dynamic(() => import("./AdvantagesSection"), {
  loading: () => <div className="h-[320px] animate-pulse bg-cyan-50/60" aria-hidden="true" />,
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
}: {
  initialSyncedBrands?: InitialSyncedBrand[];
}) {
  return (
    <>
      <HomeDeferredStack initialSyncedBrands={initialSyncedBrands} />
      <div className="home-section-stage">
        <DeferredSection rootMargin="80px" minHeight="320px" fallback={<div className="h-[320px] bg-cyan-50/40" />}>
          <SectionBoundary title="Інформаційний блок тимчасово недоступний">
            <AdvantagesSection />
          </SectionBoundary>
        </DeferredSection>
      </div>
    </>
  );
}
