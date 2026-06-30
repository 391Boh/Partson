"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredSectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: string;
  className?: string;
  initiallyVisible?: boolean;
  /** Fallback timeout to force mount on browsers where observers can be unreliable. */
  fallbackDelayMs?: number;
}

const parseRootMarginBuffer = (value: string) => {
  const match = value.trim().match(/-?\d+/);
  const numeric = match ? Number(match[0]) : 200;
  if (!Number.isFinite(numeric)) return 200;
  return Math.min(1600, Math.max(160, Math.abs(numeric)));
};

type RequestIdleCallback = (callback: () => void, options?: { timeout: number }) => number;

const scheduleIdleRender = (callback: () => void, timeout = 900) => {
  const win = window as Window & {
    requestIdleCallback?: RequestIdleCallback;
    cancelIdleCallback?: (id: number) => void;
  };
  let didRun = false;
  const runOnce = () => {
    if (didRun) return;
    didRun = true;
    callback();
  };

  if (typeof win.requestIdleCallback === "function") {
    const idleId = win.requestIdleCallback(runOnce, { timeout });
    const timeoutId = window.setTimeout(runOnce, timeout + 180);
    return () => {
      if (typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      window.clearTimeout(timeoutId);
    };
  }

  const timeoutId = window.setTimeout(runOnce, Math.min(timeout, 80));
  return () => window.clearTimeout(timeoutId);
};

const DeferredSection = ({
  children,
  fallback = null,
  rootMargin = "200px",
  minHeight = "1px",
  className,
  initiallyVisible = false,
  fallbackDelayMs = 10000,
}: DeferredSectionProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(initiallyVisible);

  useEffect(() => {
    if (initiallyVisible || isVisible) return;

    const node = containerRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const eagerBufferPx = parseRootMarginBuffer(rootMargin);
    if (rect.top <= viewportHeight + eagerBufferPx && rect.bottom >= -eagerBufferPx) {
      return scheduleIdleRender(() => setIsVisible(true), 160);
    }

    if (typeof IntersectionObserver === "undefined") {
      return scheduleIdleRender(() => setIsVisible(true), 160);
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, fallbackDelayMs);

    let cancelIdleRender: null | (() => void) = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        clearTimeout(timeoutId);
        cancelIdleRender = scheduleIdleRender(() => setIsVisible(true), 160);
      },
      { rootMargin, threshold: 0.01 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
      cancelIdleRender?.();
    };
  }, [fallbackDelayMs, initiallyVisible, isVisible, rootMargin]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        minHeight: isVisible ? undefined : minHeight,
      }}
    >
      {isVisible ? (
        <div className="deferred-section-content">{children}</div>
      ) : (
        <div className="deferred-section-fallback">{fallback}</div>
      )}
    </div>
  );
};

export default DeferredSection;
