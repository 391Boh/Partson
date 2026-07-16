"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredSectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: string;
  className?: string;
  initiallyVisible?: boolean;
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
}: DeferredSectionProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(initiallyVisible);

  useEffect(() => {
    if (initiallyVisible || isVisible) return;

    const node = containerRef.current;
    if (!node) return;

    const eagerBufferPx = parseRootMarginBuffer(rootMargin);
    const isCloseEnoughToReveal = () => {
      const rect = node.getBoundingClientRect();
      // Do not require rect.bottom to remain below the upper buffer. During a
      // fast swipe the browser can move a whole section from below to above
      // the observer area between two frames. Such a section has already been
      // reached and must be mounted instead of remaining a permanent fallback.
      return rect.top <= window.innerHeight + eagerBufferPx;
    };

    if (isCloseEnoughToReveal()) {
      // Already within the reveal buffer on mount — no reason to wait for an
      // idle slot, that only adds visible pop-in lag once the user scrolls here.
      setIsVisible(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    let proximityFrameId = 0;
    const checkProximity = () => {
      if (proximityFrameId) return;
      proximityFrameId = window.requestAnimationFrame(() => {
        proximityFrameId = 0;
        if (isCloseEnoughToReveal()) setIsVisible(true);
      });
    };

    // IntersectionObserver callbacks may be coalesced while the main thread is
    // busy resolving a dynamic chunk. A passive, frame-batched scroll check
    // closes that gap and also handles a gesture that skips the observer area
    // entirely. It is removed as soon as this section mounts.
    window.addEventListener("scroll", checkProximity, { passive: true });
    window.addEventListener("resize", checkProximity, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setIsVisible(true);
      },
      { rootMargin, threshold: 0.01 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", checkProximity);
      window.removeEventListener("resize", checkProximity);
      if (proximityFrameId) window.cancelAnimationFrame(proximityFrameId);
    };
  }, [initiallyVisible, isVisible, rootMargin]);

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
