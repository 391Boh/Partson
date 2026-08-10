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
    <div
      ref={anchorRef}
      // Reserves roughly the real footer's height so it doesn't pop in from
      // ~0px and jolt the page/scroll position the moment the lazy chunk
      // resolves — sized per breakpoint since the footer's columns stack on
      // narrow screens (measured against the real footer at each width).
      className={FooterComponent ? undefined : "h-[900px] sm:h-[700px] lg:h-[600px] xl:h-[560px]"}
    >
      {FooterComponent ? <FooterComponent /> : null}
    </div>
  );
}
