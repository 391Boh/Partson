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
  return Math.min(320, Math.max(120, Math.abs(numeric)));
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
      const frameId = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    if (typeof IntersectionObserver === "undefined") {
      const frameId = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, fallbackDelayMs);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
        clearTimeout(timeoutId);
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
      style={{ minHeight: isVisible ? undefined : minHeight }}
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
