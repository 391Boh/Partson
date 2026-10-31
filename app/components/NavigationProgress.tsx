'use client';

import { useCallback, useEffect, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getInternalNavigationHref, getNavigationAnchor, installNavigationIntent } from 'app/lib/route-prefetch';

function RouteWatcher({ onComplete }: { onComplete: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialized = useRef(false);
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${pathname}||${searchParams?.toString() ?? ''}`;
    if (!initialized.current) {
      initialized.current = true;
      prevKey.current = key;
      return;
    }
    if (prevKey.current !== key) {
      prevKey.current = key;
      onComplete();
    }
  });

  return null;
}

export default function NavigationProgress() {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const animationRef = useRef<Animation | null>(null);

  const clearPending = useCallback(() => {
    if (startTimerRef.current !== null) { clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    if (timer1Ref.current !== null) { clearTimeout(timer1Ref.current); timer1Ref.current = null; }
    if (timer2Ref.current !== null) { clearTimeout(timer2Ref.current); timer2Ref.current = null; }
  }, []);

  const resetBar = useCallback(() => {
    animationRef.current?.cancel();
    animationRef.current = null;
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(0)';
    bar.style.opacity = '1';
    bar.style.visibility = 'hidden';
    bar.style.willChange = 'auto';
    isRunningRef.current = false;
  }, []);

  const complete = useCallback(() => {
    if (startTimerRef.current !== null) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    if (!isRunningRef.current) return;
    clearPending();
    const bar = barRef.current;
    if (!bar) return;

    isRunningRef.current = false;
    // Read only the compositor value, without forcing a layout calculation.
    const transform = getComputedStyle(bar).transform;
    animationRef.current?.cancel();
    bar.style.visibility = 'visible';
    bar.style.transform = 'scaleX(1)';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animationRef.current = bar.animate([{ transform }, { transform: 'scaleX(1)' }], {
        duration: 120,
        easing: 'ease-out',
      });
    }

    timer1Ref.current = setTimeout(() => {
      if (!barRef.current) return;
      barRef.current.style.transition = 'opacity 0.18s ease-out';
      barRef.current.style.opacity = '0';
      timer2Ref.current = setTimeout(resetBar, 200);
    }, 120);
  }, [clearPending, resetBar]);

  const runStart = useCallback(() => {
    clearPending();
    const bar = barRef.current;
    if (!bar) return;

    animationRef.current?.cancel();
    isRunningRef.current = true;
    bar.style.visibility = 'visible';
    bar.style.opacity = '1';
    bar.style.transition = 'none';
    bar.style.willChange = 'transform';
    bar.style.transform = 'scaleX(0.88)';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animationRef.current = bar.animate([{ transform: 'scaleX(0.04)' }, { transform: 'scaleX(0.88)' }], {
        duration: 1400,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      });
    }
    // An interrupted or failed navigation must never leave a permanent bar.
    timer2Ref.current = setTimeout(resetBar, 15_000);
  }, [clearPending, resetBar]);

  const start = useCallback(() => {
    if (startTimerRef.current !== null || isRunningRef.current) return;
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      runStart();
    }, 120);
  }, [runStart]);

  useEffect(() => {
    const uninstallIntent = installNavigationIntent(router);
    const routeKey = () => `${window.location.pathname}${window.location.search}`;
    let previousRoute = routeKey();

    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (!getNavigationAnchor(e.target)) return;
      start();
    };

    const handlePopState = () => {
      const nextRoute = routeKey();
      if (nextRoute === previousRoute) return;
      previousRoute = nextRoute;
      start();
    };

    const origPushState = window.history.pushState.bind(window.history);
    const origReplaceState = window.history.replaceState.bind(window.history);
    const startForHistoryUrl = (url?: string | URL | null) => {
      if (!url) return;
      try {
        if (getInternalNavigationHref(String(url), window.location.href)) start();
      } catch {
        // ignore
      }
    };

    window.history.pushState = (state: unknown, unused: string, url?: string | URL | null) => {
      startForHistoryUrl(url);
      origPushState(state, unused, url);
      previousRoute = routeKey();
    };

    window.history.replaceState = (state: unknown, unused: string, url?: string | URL | null) => {
      startForHistoryUrl(url);
      origReplaceState(state, unused, url);
      previousRoute = routeKey();
    };

    document.addEventListener('click', handleClick, { capture: true, passive: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      uninstallIntent();
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
    };
  }, [router, start]);

  useEffect(() => () => { clearPending(); animationRef.current?.cancel(); }, [clearPending]);

  return (
    <>
      <Suspense fallback={null}>
        <RouteWatcher onComplete={complete} />
      </Suspense>
      <div
        ref={barRef}
        aria-hidden="true"
        className="nav-progress-bar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '3px',
          zIndex: 9999,
          transform: 'scaleX(0)',
          transformOrigin: 'left',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
