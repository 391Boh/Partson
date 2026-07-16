'use client';

import { useCallback, useEffect, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
  const rafRef = useRef<number | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const clearPending = useCallback(() => {
    if (startTimerRef.current !== null) { clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timer1Ref.current !== null) { clearTimeout(timer1Ref.current); timer1Ref.current = null; }
    if (timer2Ref.current !== null) { clearTimeout(timer2Ref.current); timer2Ref.current = null; }
  }, []);

  const resetBar = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(0)';
    bar.style.opacity = '1';
    bar.style.visibility = 'hidden';
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

    bar.style.visibility = 'visible';
    bar.style.transition = 'transform 0.12s ease-out';
    bar.style.transform = 'scaleX(1)';

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

    isRunningRef.current = true;
    bar.style.visibility = 'visible';
    bar.style.opacity = '1';
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(0)';
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      if (!isRunningRef.current || !barRef.current) return;
      const t = Math.min((now - startTimeRef.current) / 1400, 1);
      const scale = (1 - Math.pow(1 - t, 3)) * 0.88;
      barRef.current.style.transform = `scaleX(${scale.toFixed(4)})`;
      rafRef.current = requestAnimationFrame(animate);
    };

    // One-frame delay so the scaleX(0) reset is committed before animation starts
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(animate);
    });
  }, [clearPending]);

  const start = useCallback(() => {
    if (startTimerRef.current !== null || isRunningRef.current) return;
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      runStart();
    }, 8);
  }, [runStart]);

  useEffect(() => {
    const getInternalNavigationHref = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.(
        'a[href]'
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank') return null;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return null;
      }

      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return null;
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return null;
        }
        return `${url.pathname}${url.search}`;
      } catch {
        return null;
      }
    };

    const warmRoute = (event: Event) => {
      const route = getInternalNavigationHref(event);
      if (!route || prefetchedRoutesRef.current.has(route)) return;
      prefetchedRoutesRef.current.add(route);
      router.prefetch(route);
    };

    const warmRouteOnHover = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      warmRoute(event);
    };

    const handleClick = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (!getInternalNavigationHref(e)) return;
      warmRoute(e);
      start();
    };

    const handlePopState = () => {
      if (isRunningRef.current) return;
      start();
    };

    const origPushState = window.history.pushState.bind(window.history);
    const origReplaceState = window.history.replaceState.bind(window.history);
    const startForHistoryUrl = (url?: string | URL | null) => {
      if (!url) return;
      try {
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const next = new URL(String(url), window.location.href);
        const isSamePage =
          next.pathname === currentPath &&
          next.search === currentSearch;
        if (!isSamePage) start();
      } catch {
        // ignore
      }
    };

    window.history.pushState = (state: unknown, unused: string, url?: string | URL | null) => {
      startForHistoryUrl(url);
      origPushState(state, unused, url);
    };

    window.history.replaceState = (state: unknown, unused: string, url?: string | URL | null) => {
      startForHistoryUrl(url);
      origReplaceState(state, unused, url);
    };

    document.addEventListener('pointerover', warmRouteOnHover, { capture: true, passive: true });
    document.addEventListener('focusin', warmRoute, { capture: true, passive: true });
    document.addEventListener('click', handleClick, { capture: true, passive: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
      document.removeEventListener('pointerover', warmRouteOnHover, { capture: true });
      document.removeEventListener('focusin', warmRoute, { capture: true });
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
    };
  }, [router, start]);

  useEffect(() => () => clearPending(), [clearPending]);

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
          willChange: 'transform',
        }}
      />
    </>
  );
}
