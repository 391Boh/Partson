"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Only toggles CSS playback; photos and banner content stay server-rendered. */
export default function HomeArrivalBackdropMotion({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const section = container?.closest("section");
    if (!container || !section || typeof IntersectionObserver === "undefined") return;

    const desktop = window.matchMedia("(min-width: 1280px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    const syncPlayback = () => {
      container.dataset.moving = String(
        inView && desktop.matches && !reducedMotion.matches && document.visibilityState === "visible"
      );
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0 });

    observer.observe(section);
    desktop.addEventListener("change", syncPlayback);
    reducedMotion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", syncPlayback);
      reducedMotion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }, []);

  return <div ref={containerRef} className="home-arrival-decor hidden xl:block">{children}</div>;
}
