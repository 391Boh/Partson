"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import HomeDeferredStack from "./HomeDeferredStack";
import SectionBoundary from "./SectionBoundary";
import { scheduleIdle } from "app/lib/schedule-idle";

// This block changes from a long single-column layout on mobile to a compact
// desktop layout, so its placeholder must be responsive too. Heights include
// the Google-rating badge next to the intro paragraph — it's now always fed
// from the server (see app/page.tsx), so it's present from the first paint
// instead of popping in and growing the section after a client fetch
// resolves.
const AdvantagesSectionFallback = () => (
  <div
    className="home-fade-in h-[2450px] bg-cyan-50/60 sm:h-[1850px] lg:h-[1280px] xl:h-[1220px]"
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
  // This is the fourth heavy client bundle. Keep it away from the initial
  // input window and from the Auto/Brands commits so a quick vertical scroll
  // never competes with several React trees mounting at once.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    return scheduleIdle(() => setReady(true), 1900);
  }, [ready]);

  return (
    <>
      <HomeDeferredStack
        initialSyncedBrands={initialSyncedBrands}
        initialProductTree={initialProductTree}
      />
      <div className="home-section-stage">
        {ready ? (
          <div className="home-fade-in">
            <SectionBoundary title="Інформаційний блок тимчасово недоступний">
              <AdvantagesSection
                googleRatingValue={googleRatingValue}
                googleReviewCount={googleReviewCount}
              />
            </SectionBoundary>
          </div>
        ) : (
          <AdvantagesSectionFallback />
        )}
      </div>
    </>
  );
}
