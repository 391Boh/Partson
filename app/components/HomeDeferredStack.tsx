"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import SectionBoundary from "./SectionBoundary";
import { prefetchManufacturerCounts } from "app/lib/manufacturer-counts-client";

const loadProductSection = () => import("./tovar");
const loadAutoSection = () => import("./Auto");
const loadBrandsSection = () => import("./Brands");
// Footer has its own on-scroll-intersection mount (DeferredFooter.tsx) but,
// unlike the three sections above, was never part of this early background
// prefetch — its chunk only started downloading the moment it scrolled into
// view, with nothing warmed up in advance. Warming it here too means
// DeferredFooter's own dynamic import() just resolves against an
// already-fetched module instead of starting a fresh network request.
const loadFooterSection = () => import("./footer");

const ProductFetcher = dynamic(loadProductSection, {
  ssr: false,
  loading: () => null,
});
const Auto = dynamic(loadAutoSection, {
  ssr: false,
  loading: () => null,
});
const BrandCarousel = dynamic(loadBrandsSection, {
  ssr: false,
  loading: () => null,
});

type DeferredHomeSectionProps = {
  children: (onReady: () => void) => ReactNode;
  className: string;
  label: string;
  tone: "auto" | "product" | "brands";
};

function DeferredHomeSection({
  children,
  className,
  label,
  tone,
}: DeferredHomeSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [shouldMount, setShouldMount] = useState(false);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let mountTimer: number | null = null;
    const mountWhenScrollSettles = () => {
      if (document.documentElement.classList.contains("is-scrolling")) {
        mountTimer = window.setTimeout(mountWhenScrollSettles, 100);
        return;
      }
      startTransition(() => setShouldMount(true));
    };

    if (typeof IntersectionObserver === "undefined") {
      mountWhenScrollSettles();
      return () => {
        if (mountTimer !== null) window.clearTimeout(mountTimer);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        // Parsing/mounting a large catalogue tree in the middle of a wheel or
        // momentum gesture is the most visible source of dropped frames.
        // Wait for the shared scroll state to settle; the reserved skeleton
        // keeps geometry stable during this short delay.
        mountWhenScrollSettles();
      },
      // Start the network request before the section is visible without
      // competing with the hero image/font during the initial paint.
      { rootMargin: "250px 0px", threshold: 0 }
    );
    observer.observe(section);
    return () => {
      observer.disconnect();
      if (mountTimer !== null) window.clearTimeout(mountTimer);
    };
  }, []);

  useEffect(() => {
    if (!shouldMount || ready) return;
    // Never leave an error-boundary message hidden behind the preparation
    // layer if a data request or a chunk stalls on a poor connection.
    const safetyTimer = window.setTimeout(markReady, 8_000);
    return () => window.clearTimeout(safetyTimer);
  }, [markReady, ready, shouldMount]);

  return (
    <section
      ref={sectionRef}
      className={`section-reveal home-section-stage ${className} relative w-full ${ready ? "home-slot-ready" : ""}`}
      aria-busy={!ready}
      aria-label={label}
    >
      {shouldMount ? (
        <div className={`home-deferred-content ${ready ? "is-ready" : ""}`}>
          {children(markReady)}
        </div>
      ) : null}
      <div
        className={`home-section-skeleton home-section-skeleton-${tone} ${ready ? "is-ready" : ""}`}
        aria-hidden="true"
      />
    </section>
  );
}

type LegacyInitialDataProps = {
  initialSyncedBrands?: unknown;
  initialProductTree?: unknown;
};

export default function HomeDeferredStack(_legacyInitialData: LegacyInitialDataProps = {}) {
  // Kept temporarily for the older HomeBelowFoldClient call site; the data is
  // no longer serialized into the active homepage route.
  void _legacyInitialData;

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g"
    ) {
      return;
    }

    let idleId: number | null = null;
    let cancelled = false;
    const timers: number[] = [];
    const preloadBelowFoldChunks = () => {
      if (cancelled) return;
      // requestIdleCallback's timeout is allowed to fire while the browser is
      // busy. Re-check the real page state so a timeout never turns three
      // speculative module parses into dropped frames during a gesture.
      if (
        document.visibilityState === "hidden" ||
        document.documentElement.classList.contains("is-scrolling")
      ) {
        timers.push(window.setTimeout(preloadBelowFoldChunks, 700));
        return;
      }
      // Download code while the main thread/network are idle, but keep the
      // sections unmounted so their data requests and React work still happen
      // only near the viewport. Staggering avoids one large parse burst.
      // Tightened from 500/1000ms — Brands (Виробники) was reported as slow
      // to appear, and a fast scroller can reach it well before a 1000ms-
      // delayed prefetch (on top of this whole callback's own idle/1800ms
      // wait) has even started, let alone finished.
      //
      // The Brands section's own /api/manufacturer-counts request used to
      // only start once the component actually mounted (already gated
      // behind an IntersectionObserver + scroll-settle delay), so the
      // network round trip was the real bottleneck, not the JS chunk. Kick
      // it off first, right alongside the chunk prefetch — Brands.tsx reads
      // the same cached promise via getManufacturerCounts() instead of
      // firing a fresh fetch.
      void prefetchManufacturerCounts();
      void loadAutoSection();
      timers.push(window.setTimeout(() => void loadProductSection(), 300));
      timers.push(window.setTimeout(() => void loadBrandsSection(), 650));
      timers.push(window.setTimeout(() => void loadFooterSection(), 1100));
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(preloadBelowFoldChunks, {
        timeout: 3500,
      });
    } else {
      timers.push(window.setTimeout(preloadBelowFoldChunks, 1800));
    }

    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <>
      <DeferredHomeSection
        className="home-slot-auto"
        label="Підбір запчастин за автомобілем"
        tone="auto"
      >
        {(onReady) => (
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto playEntranceAnimations={false} showSummary onReady={onReady} />
          </SectionBoundary>
        )}
      </DeferredHomeSection>

      <DeferredHomeSection
        className="home-slot-product"
        label="Каталог груп товарів"
        tone="product"
      >
        {(onReady) => (
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher playEntranceAnimations={false} onReady={onReady} />
          </SectionBoundary>
        )}
      </DeferredHomeSection>

      <DeferredHomeSection
        className="home-slot-brands"
        label="Виробники автозапчастин"
        tone="brands"
      >
        {(onReady) => (
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={false} onReady={onReady} />
          </SectionBoundary>
        )}
      </DeferredHomeSection>
    </>
  );
}
