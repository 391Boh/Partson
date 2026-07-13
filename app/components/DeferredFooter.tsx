"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

export default function DeferredFooter() {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [FooterComponent, setFooterComponent] =
    useState<ComponentType | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || FooterComponent) return;

    let cancelled = false;
    const loadFooter = () => {
      void import("./footer").then((module) => {
        if (!cancelled) setFooterComponent(() => module.default);
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      loadFooter();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        loadFooter();
      },
      { rootMargin: "400px 0px", threshold: 0.01 }
    );

    observer.observe(anchor);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [FooterComponent]);

  return (
    <div ref={anchorRef} className="min-h-px">
      {FooterComponent ? <FooterComponent /> : null}
    </div>
  );
}
