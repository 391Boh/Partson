"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import SectionBoundary from "./SectionBoundary";
import { prefetchManufacturerCounts } from "app/lib/manufacturer-counts-client";
import { scheduleBackgroundTask } from "app/lib/schedule-background-task";

const MAX_SCROLL_MOUNT_DELAY_MS = 320;
const SCROLL_SETTLE_RETRY_MS = 80;
// Auto/product/brands each watch their own 800px-early IntersectionObserver
// independently. On a normal-to-fast scroll, two or three of them can cross
// that threshold within the same second and commit their (real, non-trivial)
// React trees back to back — profiling a scroll through the homepage showed
// this compounding into the worst style-recalc/paint stalls (150ms+), well
// above any single section's own cost. Staggering actual mounts across
// sibling sections spreads that unavoidable paint cost over more frames
// instead of letting it land in one burst.
const MIN_SECTION_MOUNT_STAGGER_MS = 220;
let lastSectionMountAt = 0;

const loadProductSection = () => import("./tovar");
const loadAutoSection = () => import("./Auto");
const loadBrandsSection = () => import("./Brands");
const preloadBrandsSection = () => {
  void prefetchManufacturerCounts();
  return loadBrandsSection();
};

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
  preload: () => Promise<unknown>;
  tone: "auto" | "product" | "brands";
};

function DeferredHomeSection({
  children,
  className,
  label,
  preload,
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
    let mountRequestedAt = 0;
    let mountRequested = false;
    let cancelled = false;
    let cancelBackgroundTask: (() => void) | null = null;
    let nearObserver: IntersectionObserver | null = null;
    let visibleObserver: IntersectionObserver | null = null;
    const mountWhenScrollSettles = () => {
      if (cancelled) return;
      const isScrolling = document.documentElement.classList.contains("is-scrolling");
      const waitedMs = performance.now() - mountRequestedAt;

      // Avoid committing a large React tree on the first frame of a gesture,
      // but keep the wait bounded. Previously a long trackpad gesture or a
      // scrollbar drag could postpone mounting indefinitely, leaving a user
      // who had already reached the section looking at only its skeleton.
      // startTransition below still lets React yield to input if the gesture
      // is active when the short deadline expires.
      if (isScrolling && waitedMs < MAX_SCROLL_MOUNT_DELAY_MS) {
        mountTimer = window.setTimeout(mountWhenScrollSettles, SCROLL_SETTLE_RETRY_MS);
        return;
      }

      const now = performance.now();
      const sinceLastMount = now - lastSectionMountAt;
      if (sinceLastMount < MIN_SECTION_MOUNT_STAGGER_MS) {
        mountTimer = window.setTimeout(
          mountWhenScrollSettles,
          MIN_SECTION_MOUNT_STAGGER_MS - sinceLastMount
        );
        return;
      }

      lastSectionMountAt = now;
      startTransition(() => setShouldMount(true));
    };

    const requestMount = () => {
      if (cancelled || mountRequested) return;
      mountRequested = true;
      cancelBackgroundTask?.();
      nearObserver?.disconnect();
      visibleObserver?.disconnect();
      // Fetch while the bounded scroll-settle delay runs. Only this section's
      // chunk/data are warmed; unused catalogue modules stay off the network.
      // The dynamic component/error boundary handles an actual load failure.
      // Start the mount queue only when code is available. Otherwise several
      // suspended dynamic imports can resolve and commit together, bypassing
      // the spacing between setShouldMount calls entirely.
      void preload().catch(() => undefined).then(() => {
        if (cancelled) return;
        mountRequestedAt = performance.now();
        mountWhenScrollSettles();
      });
    };

    const cleanup = () => {
      cancelled = true;
      cancelBackgroundTask?.();
      nearObserver?.disconnect();
      visibleObserver?.disconnect();
      if (mountTimer !== null) window.clearTimeout(mountTimer);
    };

    if (typeof IntersectionObserver === "undefined") {
      requestMount();
      return cleanup;
    }

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const conserveData = connection?.saveData ||
      connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";

    nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || mountRequested) return;
        nearObserver?.disconnect();
        // Only an actual scrolled/restored position means the visitor already
        // moved past the hero and needs this section promptly. A section
        // merely being visible at scrollY 0 is not that — on a common
        // ~900px-tall laptop viewport, the hero (~500-600px incl. header)
        // already leaves Auto's slot peeking into view on first paint, so
        // checking visibility alone made this fire immediately for most
        // real users, mounting a full section tree while the hero photo/LCP
        // was still loading (measured: this is what regressed LCP and CLS).
        if (window.scrollY > 0) {
          requestMount();
          return;
        }
        // At the top of the page the 800px margin can include multiple
        // sections. Their speculative work must wait for the hero resources,
        // then start in separate idle slots instead of racing the LCP image.
        const sectionIndex = tone === "auto" ? 0 : tone === "product" ? 1 : 2;
        cancelBackgroundTask = scheduleBackgroundTask(requestMount, {
          delayMs: sectionIndex * MIN_SECTION_MOUNT_STAGGER_MS,
        });
      },
      { rootMargin: conserveData ? "0px" : "800px 0px", threshold: 0 }
    );
    // If the user reaches a queued section before window.load/an idle slot,
    // bypass that background wait. Fast scrolling cannot leave it parked
    // behind a slow image or an unrelated third-party request.
    //
    // IntersectionObserver always delivers one callback immediately on
    // observe() reporting the *current* state — for a section already inside
    // the viewport at scrollY 0 (a common ~900px laptop viewport already
    // shows part of Auto below a ~500-600px hero), that first callback alone
    // used to trigger an unconditional, unstaggered requestMount() here,
    // reintroducing the exact premature-mount-during-LCP regression the
    // nearObserver fix above addresses. Skip that initial snapshot and only
    // act on a real, later transition into view from an actual scroll.
    let visibleObserverPrimed = false;
    visibleObserver = new IntersectionObserver(([entry]) => {
      if (!visibleObserverPrimed) {
        visibleObserverPrimed = true;
        return;
      }
      if (entry?.isIntersecting) requestMount();
    });
    nearObserver.observe(section);
    visibleObserver.observe(section);
    return cleanup;
  }, [preload, tone]);

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

  return (
    <>
      <DeferredHomeSection
        className="home-slot-auto"
        label="Підбір запчастин за автомобілем"
        preload={loadAutoSection}
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
        preload={loadProductSection}
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
        preload={preloadBrandsSection}
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
