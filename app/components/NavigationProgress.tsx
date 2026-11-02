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
    bar.dataset.state = 'idle';
    delete bar.dataset.paused;
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
    bar.dataset.state = 'complete';
    bar.style.transform = 'scaleX(1)';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animationRef.current = bar.animate([{ transform }, { transform: 'scaleX(1)' }], {
        duration: 160,
        easing: 'ease-out',
      });
      if (document.visibilityState === 'hidden') animationRef.current.pause();
    }

    timer1Ref.current = setTimeout(() => {
      if (!barRef.current) return;
      barRef.current.style.transition = 'opacity 0.2s ease-out';
      barRef.current.style.opacity = '0';
      timer2Ref.current = setTimeout(resetBar, 220);
    }, 180);
  }, [clearPending, resetBar]);

  const runStart = useCallback(() => {
    clearPending();
    const bar = barRef.current;
    if (!bar) return;

    animationRef.current?.cancel();
    isRunningRef.current = true;
    bar.style.visibility = 'visible';
    bar.style.opacity = '1';
    bar.dataset.state = 'loading';
    bar.dataset.paused = String(document.visibilityState === 'hidden');
    bar.style.transition = 'none';
    bar.style.willChange = 'transform';
    bar.style.transform = 'scaleX(0.94)';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animationRef.current = bar.animate([{ transform: 'scaleX(0.035)' }, { transform: 'scaleX(0.94)' }], {
        duration: 8_000,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      });
      if (document.visibilityState === 'hidden') animationRef.current.pause();
    }
    // An interrupted or failed navigation must never leave a permanent bar.
    timer2Ref.current = setTimeout(resetBar, 15_000);
  }, [clearPending, resetBar]);

  const start = useCallback(() => {
    if (startTimerRef.current !== null || isRunningRef.current) return;
    // A new navigation owns the bar; the previous fade must not hide it.
    if (barRef.current?.dataset.state === 'complete') {
      clearPending();
      resetBar();
    }
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      runStart();
    }, 120);
  }, [clearPending, resetBar, runStart]);

  useEffect(() => {
    const uninstallIntent = installNavigationIntent(router);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onVisibilityChange = () => {
      const bar = barRef.current;
      if (!bar || bar.dataset.state === 'idle') return;
      const paused = document.visibilityState === 'hidden';
      bar.dataset.paused = String(paused);
      const animation = animationRef.current;
      if (paused && animation?.playState === 'running') {
        // pause() takes effect on the next frame; pinning the current time
        // freezes the bar at once instead of one frame later.
        const time = animation.currentTime;
        animation.pause();
        animation.currentTime = time;
      }
      else if (!paused && animation?.playState === 'paused') animation.play();
    };
    const onMotionChange = () => {
      if (!reducedMotion.matches) return;
      animationRef.current?.cancel();
      animationRef.current = null;
    };
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
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', onMotionChange);
    window.addEventListener('popstate', handlePopState);

    return () => {
      uninstallIntent();
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener('change', onMotionChange);
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
        data-state="idle"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '4px',
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
