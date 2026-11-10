"use client";

import { usePathname } from "next/navigation";
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
  const isHome = usePathname() === "/";
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [FooterComponent, setFooterComponent] =
    useState<ComponentType | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

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
      void Promise.all([
        import("./footer"),
        whenFullStylesheetReady({ priority: nearViewport ? "high" : "low" }),
      ]).then(([module]) => {
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
        } else if (!cancelled && nearViewport) {
          setLoadFailed(true);
        }
      });
    };

    // Warm after the initial DOM/paint, independent of slow images/iframes.
    // A long page's footer should already be available before it is reached.
    // The long homepage has no footer in its initial viewport. Proximity
    // already warms it 1600px ahead; an unconditional timer only competes
    // with the first account interaction and catalogue preparation.
    const cancelPreparation = isHome
      ? () => {}
      : scheduleBackgroundTask(loadFooter, { delayMs: 500, idleTimeoutMs: 250, waitForLoad: false });
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
  }, [FooterComponent, isHome, retryToken]);

  if (FooterComponent) {
    return <div data-deferred-footer className="footer-frame"><FooterComponent /></div>;
  }

  return (
    <div data-deferred-footer ref={anchorRef} className="footer-frame footer-placeholder" aria-hidden={loadFailed ? undefined : true}>
      {loadFailed ? (
        <div className="footer-load-error" role="status">
          <p>Не вдалося завантажити контакти та посилання.</p>
          <button type="button" onClick={() => {
            setLoadFailed(false);
            setRetryToken((value) => value + 1);
          }} aria-label="Повторити завантаження підвалу">
            Повторити завантаження
          </button>
        </div>
      ) : null}
      <div className="page-shell-inline" aria-hidden="true">
        <div className="footer-placeholder-intro">
          <div><div className="footer-skeleton-block" /><div className="footer-skeleton-block" /></div>
          <div className="footer-skeleton-block" />
        </div>
        <div className="site-footer-main">
          <div className="site-footer-brand footer-placeholder-brand">
            <div className="footer-skeleton-block" /><div className="footer-skeleton-block" />
          </div>
          {[4, 6, 4].map((count, index) => (
            <div key={index} className={index === 2 ? "site-footer-contacts" : ""}>
              <div className="footer-skeleton-block footer-placeholder-title" />
              {Array.from({length:count}, (_, key) => <div key={key} className="footer-skeleton-block footer-placeholder-link" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
