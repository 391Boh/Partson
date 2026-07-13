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
  // Mirror the actual IntersectionObserver margin. The previous 160px floor
  // made even `rootMargin="0px"` eager and caused consecutive home sections
  // to mount together during the initial render.
  return Math.min(1600, Math.max(0, Math.abs(numeric)));
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
      // Already within the reveal buffer on mount — no reason to wait for an
      // idle slot, that only adds visible pop-in lag once the user scrolls here.
      setIsVisible(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, fallbackDelayMs);

    // rootMargin already gives us hundreds of pixels of advance notice before
    // the section is actually on screen, so once it fires we mount right away
    // instead of layering a requestIdleCallback wait on top of that head start.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        clearTimeout(timeoutId);
        setIsVisible(true);
      },
      { rootMargin, threshold: 0.01 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, [fallbackDelayMs, initiallyVisible, isVisible, rootMargin]);

  return (
    <div
      ref={containerRef}
      className={className}
      // minHeight only reserves space while the real content is still
      // loading (prevents layout shift once it mounts). Once visible, drop
      // it — otherwise a section that legitimately renders nothing (e.g.
      // "recently viewed" with no history) leaves permanent empty space.
      style={isVisible ? undefined : { minHeight }}
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
