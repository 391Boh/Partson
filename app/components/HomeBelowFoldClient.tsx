"use client";

import dynamic from "next/dynamic";

import HomeDeferredStack from "./HomeDeferredStack";
import SectionBoundary from "./SectionBoundary";

// This block changes from a long single-column layout on mobile to a compact
// desktop layout, so its placeholder must be responsive too. Heights include
// the Google-rating badge in AdvantagesPhotoSlider's header row — it's now
// always fed from the server (see app/page.tsx), so it's present from the
// first paint instead of popping in and growing the section after a client
// fetch resolves.
const AdvantagesSectionFallback = () => (
  <div
    className="h-[2446px] bg-cyan-50/60 sm:h-[2130px] lg:h-[1330px] xl:h-[1280px]"
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
  googleRatingValue,
  googleReviewCount,
}: {
  initialSyncedBrands?: InitialSyncedBrand[];
  initialProductTree?: unknown;
  googleRatingValue?: number;
  googleReviewCount?: number;
}) {
  return (
    <>
      <HomeDeferredStack
        initialSyncedBrands={initialSyncedBrands}
        initialProductTree={initialProductTree}
      />
      <div className="home-section-stage">
        <SectionBoundary title="Інформаційний блок тимчасово недоступний">
          <AdvantagesSection
            googleRatingValue={googleRatingValue}
            googleReviewCount={googleReviewCount}
          />
        </SectionBoundary>
      </div>
    </>
  );
}
