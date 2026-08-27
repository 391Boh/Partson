"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import SectionBoundary from "./SectionBoundary";

// Keep the placeholders close to the rendered height at every layout
// breakpoint. The sections become much taller in the one/two-column layouts;
// using only the desktop height here causes a large layout shift on phones and
// tablets as soon as the dynamic chunk resolves.
function HomeSectionFallback({
  ready = false,
  tone,
}: {
  ready?: boolean;
  tone: "product" | "auto" | "brands";
}) {
  return (
    <div
      className={`home-section-skeleton home-section-skeleton-${tone} ${ready ? "is-ready" : ""}`}
      aria-hidden="true"
    />
  );
}

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
  loading: () => null,
});
const Auto = dynamic(loadAutoSection, {
  ssr: false,
  loading: () => null,
});
// Unlike ProductFetcher/Auto, BrandCarousel's first-render state comes
// entirely from the initialSyncedBrands prop passed down from the server —
// no sessionStorage/media-query read, so no hydration-mismatch risk. Leaving
// ssr enabled (the dynamic() default) lets its manufacturer-logo <Image>
// tags go out in the initial server HTML instead of waiting for the client
// JS chunk to load and execute before those requests are even discovered.
const BrandCarousel = dynamic(loadBrandsSection, {
  loading: () => null,
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
  const [readySections, setReadySections] = useState(0);

  // The three dynamic components below mount during the same render, so Next
  // requests their chunks in parallel. Do not gate them behind a preliminary
  // Promise: that used to add an extra render and made every section wait for
  // the slowest chunk before any useful content could appear.
  useEffect(() => {
    // Error boundaries must never remain covered by a loading veil. This is a
    // fallback only; normal sections reveal themselves on their first stable
    // layout, usually hundreds of milliseconds earlier.
    const safetyTimer = window.setTimeout(() => setReadySections(7), 4_000);
    return () => window.clearTimeout(safetyTimer);
  }, []);

  const markSectionReady = useCallback((flag: number) => {
    setReadySections((current) => current | flag);
  }, []);
  const handleProductReady = useCallback(() => markSectionReady(1), [markSectionReady]);
  const handleAutoReady = useCallback(() => markSectionReady(2), [markSectionReady]);
  const handleBrandsReady = useCallback(() => markSectionReady(4), [markSectionReady]);

  const renderSectionState = (flag: number) => {
    const ready = (readySections & flag) === flag;
    return {
      ready,
      contentClassName: `home-deferred-content ${ready ? "is-ready" : ""}`,
      slotClassName: ready ? "home-slot-ready" : "",
    };
  };
  const productState = renderSectionState(1);
  const autoState = renderSectionState(2);
  const brandsState = renderSectionState(4);

  return (
    <>
      <section className={`section-reveal home-section-stage home-slot-product relative w-full ${productState.slotClassName}`} aria-busy={!productState.ready}>
        <div className={productState.contentClassName}>
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher products={initialProductTree} playEntranceAnimations={false} onReady={handleProductReady} />
          </SectionBoundary>
        </div>
        <HomeSectionFallback tone="product" ready={productState.ready} />
      </section>

      <section className={`section-reveal home-section-stage home-slot-auto relative w-full ${autoState.slotClassName}`} aria-busy={!autoState.ready}>
        <div className={autoState.contentClassName}>
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto playEntranceAnimations={false} showSummary onReady={handleAutoReady} />
          </SectionBoundary>
        </div>
        <HomeSectionFallback tone="auto" ready={autoState.ready} />
      </section>

      <section className={`section-reveal home-section-stage home-slot-brands relative w-full ${brandsState.slotClassName}`} aria-busy={!brandsState.ready}>
        <div className={brandsState.contentClassName}>
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={false} initialSyncedBrands={initialSyncedBrands} onReady={handleBrandsReady} />
          </SectionBoundary>
        </div>
        <HomeSectionFallback tone="brands" ready={brandsState.ready} />
      </section>
    </>
  );
}
