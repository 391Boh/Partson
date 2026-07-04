"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { scheduleCatalogPrefetch } from "app/lib/products-prefetch";

const HomeDeferredStack = dynamic(() => import("./HomeDeferredStack"));
const AdvantagesSection = dynamic(() => import("./AdvantagesSection"));
const SectionBoundary = dynamic(() => import("./SectionBoundary"));

// Kick off catalog data prefetch and chunk preloads before the below-fold
// content even mounts — katkomp finds warm data when it renders.
if (typeof window !== "undefined") {
  scheduleCatalogPrefetch();
  queueMicrotask(() => {
    void import("./HomeDeferredStack");
    void import("./katkomp");
  });
}

const scheduleHomeBelowFoldMount = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let didRun = false;
  const runOnce = () => {
    if (cancelled || didRun) return;
    didRun = true;
    callback();
  };
  const win = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof win.requestIdleCallback === "function") {
    const idleId = win.requestIdleCallback(runOnce, { timeout: 80 });
    const timeoutId = window.setTimeout(runOnce, 130);

    return () => {
      cancelled = true;
      win.cancelIdleCallback?.(idleId);
      window.clearTimeout(timeoutId);
    };
  }

  const timeoutId = window.setTimeout(runOnce, 80);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
};

export default function HomeBelowFoldClient() {
  const [shouldMountBelowFold, setShouldMountBelowFold] = useState(false);

  useEffect(
    () => scheduleHomeBelowFoldMount(() => setShouldMountBelowFold(true)),
    []
  );

  if (!shouldMountBelowFold) return null;

  return (
    <>
      <HomeDeferredStack />
      <div className="home-section-stage">
        <SectionBoundary title="Інформаційний блок тимчасово недоступний">
          <AdvantagesSection />
        </SectionBoundary>
      </div>
    </>
  );
}
