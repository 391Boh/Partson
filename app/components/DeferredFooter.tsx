"use client";

import { scheduleBackgroundTask } from "app/lib/schedule-background-task";
import { whenFullStylesheetReady } from "app/lib/full-stylesheet";

import { startTransition, useEffect, useRef, useState, type ComponentType } from "react";

// Bounds how long a footer that has already scrolled into view can be left
// showing only its skeleton. Waiting out an entire long trackpad/momentum
// gesture used to be unbounded here — a user who scrolled straight to the
// bottom and stopped right at the edge of a still-active gesture could be
// looking at 900px of empty skeleton indefinitely. Same cap and retry cadence
// as HomeDeferredStack/DeferredHomeVisuals use for the homepage sections.
const MAX_SCROLL_LOAD_DELAY_MS = 320;
const SCROLL_SETTLE_RETRY_MS = 80;

export default function DeferredFooter() {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [FooterComponent, setFooterComponent] =
    useState<ComponentType | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || FooterComponent) return;

    let cancelled = false;
    let nearViewport = false;
    let requested = false;
    let attempts = 0;
    let loadedFooter: ComponentType | null = null;
    let settleTimer: number | null = null;
    let mountRequestedAt = 0;
    let cancelMount: (() => void) | undefined;

    const commitFooter = () => {
      if (cancelled || !loadedFooter) return;
      const component = loadedFooter;
      startTransition(() => setFooterComponent(() => component));
    };
    const mountWhenScrollSettles = () => {
      if (cancelled || !loadedFooter) return;
      if (document.documentElement.classList.contains("is-scrolling") &&
          performance.now() - mountRequestedAt < MAX_SCROLL_LOAD_DELAY_MS) {
        settleTimer = window.setTimeout(mountWhenScrollSettles, SCROLL_SETTLE_RETRY_MS);
        return;
      }
      commitFooter();
    };
    const loadFooter = () => {
      if (cancelled || requested) return;
      requested = true;
      attempts += 1;
      void Promise.all([import("./footer"), whenFullStylesheetReady()]).then(([module]) => {
        if (cancelled) return;
        loadedFooter = module.default;
        // Near the viewport the bounded path owns the commit. Do not put it
        // back behind an idle scheduler that can wait forever during scroll.
        if (nearViewport) mountWhenScrollSettles();
        else if (document.documentElement.classList.contains("is-scrolling")) {
          cancelMount = scheduleBackgroundTask(commitFooter, { waitForLoad: false });
        } else commitFooter();
      }).catch(() => {
        requested = false;
        if (!cancelled && nearViewport && attempts < 2) {
          settleTimer = window.setTimeout(loadFooter, 500);
        }
      });
    };

    // Warm after the initial DOM/paint, independent of slow images/iframes.
    // A long page's footer should already be available before it is reached.
    const cancelPreparation = scheduleBackgroundTask(loadFooter, { delayMs: 500, idleTimeoutMs: 250, waitForLoad: false });
    const requestVisibleFooter = () => {
      if (cancelled || nearViewport) return;
      nearViewport = true;
      mountRequestedAt = performance.now();
      cancelPreparation();
      cancelMount?.();
      if (loadedFooter) mountWhenScrollSettles();
      else loadFooter();
    };
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      requestVisibleFooter();
    } else {
      observer = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        observer?.disconnect();
        requestVisibleFooter();
      }, { rootMargin: "1600px 0px", threshold: 0.01 });
      observer.observe(anchor);
    }
    return () => {
      cancelled = true;
      cancelPreparation();
      cancelMount?.();
      observer?.disconnect();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [FooterComponent]);

  if (FooterComponent) {
    return (
      <div data-deferred-footer className="min-h-[1200px] sm:min-h-[1160px] md:min-h-[700px] lg:min-h-[600px] xl:min-h-[560px]">
        <FooterComponent />
      </div>
    );
  }

  return (
    <div
      data-deferred-footer
      ref={anchorRef}
      // Reserves roughly the real footer's height so it doesn't pop in from
      // ~0px and jolt the page/scroll position the moment the lazy chunk
      // resolves — sized per breakpoint since the footer's columns stack on
      // narrow screens (measured against the real footer at each width).
      className="h-[1200px] overflow-hidden py-8 sm:h-[1160px] sm:py-10 md:h-[700px] lg:h-[600px] xl:h-[560px]"
      aria-hidden="true"
    >
      <div className="page-shell-inline">
        <div className="grid grid-cols-1 items-stretch gap-y-8 md:grid-cols-3 md:gap-x-12 lg:gap-x-16">
          {/* Col 1: brand + social */}
          <div className="flex flex-col items-center gap-4 md:pr-8 md:pt-8">
            <div className="footer-skeleton-block h-[62px] w-[138px]" />
            <div className="footer-skeleton-block h-3 w-40" />
            <div className="mt-4 flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="footer-skeleton-block h-10 w-10 !rounded-xl" />
              ))}
            </div>
            <div className="footer-skeleton-block h-8 w-full max-w-[220px] !rounded-2xl" />
          </div>

          {/* Col 2: info links */}
          <div className="flex flex-col md:pr-8">
            <div className="footer-skeleton-block mb-4 h-3 w-24" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="footer-skeleton-block h-3 w-full max-w-[110px]" />
              ))}
            </div>
          </div>

          {/* Col 3: contacts */}
          <div className="flex flex-col gap-3 md:pl-2">
            <div className="footer-skeleton-block mb-1 h-3 w-24" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="footer-skeleton-block h-8 w-8 shrink-0 !rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <div className="footer-skeleton-block h-2.5 w-16" />
                  <div className="footer-skeleton-block h-3.5 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 border-t border-slate-200/70 pt-5">
          <div className="footer-skeleton-block h-11 w-64 !rounded-2xl" />
          <div className="footer-skeleton-block h-3 w-48" />
        </div>
      </div>
    </div>
  );
}
