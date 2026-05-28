"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentType } from "react";

const HomeDeferredStack = dynamic(() => import("./HomeDeferredStack"), {
  ssr: false,
});
const AdvantagesSection = dynamic(() => import("./AdvantagesSection"), {
  ssr: false,
});
const Footer = dynamic(() => import("./footer"), {
  ssr: false,
});
const SectionBoundary = dynamic(() => import("./SectionBoundary"), {
  ssr: false,
});

type RequestIdleCallback = (callback: () => void, options?: { timeout: number }) => number;

const placeholderHeights = [
  "clamp(360px, 74svh, 520px)",
  "clamp(400px, 78svh, 560px)",
  "clamp(300px, 62svh, 380px)",
] as const;

const HomeDeferredStackPlaceholder = () => (
  <>
    {placeholderHeights.map((minHeight, index) => (
      <section
        key={`home-placeholder-${minHeight}`}
        className="home-section-stage relative w-full"
        aria-busy="true"
      >
        <div className="page-shell-inline">
          <div className="rounded-[20px] border border-sky-100/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:rounded-[28px] sm:p-5 sm:shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
            <div
              className="h-5 rounded-full bg-slate-200/80"
              style={{ width: index === 0 ? "9rem" : index === 1 ? "10rem" : "8rem" }}
            />
            <div
              className="mt-4 rounded-[22px] bg-[linear-gradient(135deg,rgba(226,232,240,0.8),rgba(255,255,255,0.92),rgba(224,242,254,0.76))]"
              style={{ minHeight }}
            />
          </div>
        </div>
      </section>
    ))}
  </>
);

const HomeFooterPlaceholder = () => (
  <div className="home-section-stage">
    <div className="page-shell-inline">
      <div className="h-24 rounded-[22px] border border-sky-100/70 bg-white/80 shadow-[0_12px_28px_rgba(15,23,42,0.05)]" />
    </div>
  </div>
);

export default function HomeBelowFoldClient() {
  const [BelowFoldComponent, setBelowFoldComponent] =
    useState<ComponentType | null>(null);
  const [shouldLoadBelowFold, setShouldLoadBelowFold] = useState(false);
  const deferredHomeSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shouldLoadBelowFold || BelowFoldComponent) return;

    let cancelled = false;
    const loadBelowFold = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const Component = () => (
        <>
          <HomeDeferredStack />
          <div className="home-section-stage">
            <SectionBoundary title="Інформаційний блок тимчасово недоступний">
              <AdvantagesSection />
            </SectionBoundary>
          </div>
          <Footer />
        </>
      );

      setBelowFoldComponent(() => Component);
    };

    void loadBelowFold().catch((error) => {
      if (!cancelled) {
        console.error("Failed to load home below-fold content:", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [BelowFoldComponent, shouldLoadBelowFold]);

  useEffect(() => {
    if (typeof window === "undefined" || shouldLoadBelowFold) return;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) {
        setShouldLoadBelowFold(true);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: RequestIdleCallback;
      cancelIdleCallback?: (id: number) => void;
    };

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                markReady();
              }
            },
            {
              rootMargin: "160px 0px",
            }
          )
        : null;

    if (observer && deferredHomeSentinelRef.current) {
      observer.observe(deferredHomeSentinelRef.current);
    }

    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(markReady, { timeout: 7000 });
    } else {
      timeoutId = window.setTimeout(markReady, 7000);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (idleId != null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldLoadBelowFold]);

  return (
    <>
      <div ref={deferredHomeSentinelRef} aria-hidden="true" className="h-px w-full" />

      {BelowFoldComponent ? (
        <BelowFoldComponent />
      ) : (
        <>
          <HomeDeferredStackPlaceholder />
          <HomeFooterPlaceholder />
        </>
      )}
    </>
  );
}
