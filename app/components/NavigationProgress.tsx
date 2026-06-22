'use client';

import { useCallback, useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

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
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const isRunningRef = useRef(false);

  const clearPending = useCallback(() => {
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
    if (!isRunningRef.current) return;
    clearPending();
    const bar = barRef.current;
    if (!bar) return;

    bar.style.visibility = 'visible';
    bar.style.transition = 'transform 0.16s ease-out';
    bar.style.transform = 'scaleX(1)';

    timer1Ref.current = setTimeout(() => {
      if (!barRef.current) return;
      barRef.current.style.transition = 'opacity 0.22s ease-out';
      barRef.current.style.opacity = '0';
      timer2Ref.current = setTimeout(resetBar, 240);
    }, 170);
  }, [clearPending, resetBar]);

  const start = useCallback(() => {
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
      const t = Math.min((now - startTimeRef.current) / 2600, 1);
      const scale = (1 - Math.pow(1 - t, 4)) * 0.82;
      barRef.current.style.transform = `scaleX(${scale.toFixed(4)})`;
      rafRef.current = requestAnimationFrame(animate);
    };

    // One-frame delay so the scaleX(0) reset is committed before animation starts
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(animate);
    });
  }, [clearPending]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const anchor = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank') return;
      const { href } = anchor;
      if (!href || href.startsWith('javascript:')) return;
      try {
        const url = new URL(href);
        if (url.origin !== window.location.origin) return;
        // Skip pure hash changes on same page
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      start();
    };

    const handlePopState = () => {
      if (isRunningRef.current) return;
      start();
    };

    const origPushState = window.history.pushState.bind(window.history);
    window.history.pushState = (state: unknown, unused: string, url?: string | URL | null) => {
      origPushState(state, unused, url);
      if (!url) return;
      try {
        const next = new URL(String(url), window.location.href);
        const isSamePage =
          next.pathname === window.location.pathname &&
          next.search === window.location.search;
        if (!isSamePage) start();
      } catch {
        // ignore
      }
    };

    document.addEventListener('click', handleClick, { capture: true, passive: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.history.pushState = origPushState;
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
    };
  }, [start]);

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
