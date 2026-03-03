"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredSectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: string;
  className?: string;
  /** Fallback timeout to force mount on browsers where observers can be unreliable. */
  fallbackDelayMs?: number;
}

const DeferredSection = ({
  children,
  fallback = null,
  rootMargin = "200px",
  minHeight = "1px",
  className,
  fallbackDelayMs = 1400,
}: DeferredSectionProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return;
    if (typeof window === "undefined") {
      setIsVisible(true);
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.top <= viewportHeight + 1100 && rect.bottom >= -1100) {
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
  }, [isVisible, fallbackDelayMs, rootMargin]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: isVisible ? undefined : minHeight }}
    >
      {isVisible ? children : fallback}
    </div>
  );
};

export default DeferredSection;
