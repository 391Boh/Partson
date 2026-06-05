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
    let pendingFrameId: number | null = null;
    let pendingIdleId: number | null = null;
    let pendingTimeoutId: number | null = null;
    const markReady = () => {
      if (!cancelled && !shouldLoadBelowFold) {
        setShouldLoadBelowFold(true);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: RequestIdleCallback;
      cancelIdleCallback?: (id: number) => void;
    };
    const scheduleReady = (timeout = 700) => {
      if (pendingFrameId != null || pendingIdleId != null || pendingTimeoutId != null) return;

      const runWhenIdle = () => {
        if (cancelled) return;
        if (typeof win.requestIdleCallback === "function") {
          pendingIdleId = win.requestIdleCallback(() => {
            pendingIdleId = null;
            markReady();
          }, { timeout });
          return;
        }

        pendingTimeoutId = window.setTimeout(() => {
          pendingTimeoutId = null;
          markReady();
        }, Math.min(timeout, 220));
      };

      pendingFrameId = window.requestAnimationFrame(() => {
        pendingFrameId = null;
        runWhenIdle();
      });
    };

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                scheduleReady(320);
              }
            },
            {
              rootMargin: "1000px 0px",
            }
          )
        : null;

    if (observer && deferredHomeSentinelRef.current) {
      observer.observe(deferredHomeSentinelRef.current);
    }

    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(markReady, { timeout: 2200 });
    } else {
      timeoutId = window.setTimeout(markReady, 2200);
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
      if (pendingFrameId != null) {
        window.cancelAnimationFrame(pendingFrameId);
      }
      if (pendingIdleId != null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(pendingIdleId);
      }
      if (pendingTimeoutId != null) {
        window.clearTimeout(pendingTimeoutId);
      }
    };
  }, [shouldLoadBelowFold]);

  return (
    <>
      <div ref={deferredHomeSentinelRef} aria-hidden="true" className="h-px w-full" />

      {BelowFoldComponent ? (
        <BelowFoldComponent />
      ) : null}
    </>
  );
}
