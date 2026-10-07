"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { canUseTimelineParallax, registerParallax } from "app/lib/parallax-controller";

const BASE_SCALE = 1.025;
const PROGRESS_STEPS = 1024;

export default function HeroParallaxBackground({ children }: { children: ReactNode }) {
  const photoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const photo = photoRef.current;
    const section = photo?.closest("section");
    if (!photo || !section) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 641px)");
    let visible = false;
    let lastStep = -1;
    let handle: ReturnType<typeof registerParallax> | null = null;

    const stop = () => {
      handle?.release();
      handle = null;
      photo.style.willChange = "";
    };

    // Compositor path: globals.css animates the photo on the section's own
    // view timeline ([data-hero-plx]) with the same curve, so nothing runs per
    // scroll frame. The JS controller below is the fallback.
    if (canUseTimelineParallax()) {
      section.dataset.heroPlx = "";
      return () => {
        delete section.dataset.heroPlx;
      };
    }

    const sync = () => {
      stop();
      if (reducedMotion.matches) {
        photo.style.transform = `scale(${BASE_SCALE})`;
        return;
      }
      if (!visible || document.hidden) return;
      const factor = desktop.matches ? 1 : 0.46;
      lastStep = -1;
      photo.style.willChange = "transform";
      handle = registerParallax({
        el: section,
        compute: (scrollY, _vh, top, height) =>
          Math.min(Math.max((scrollY - top) / height, 0), 1),
        apply: (progress) => {
          const step = Math.round(progress * PROGRESS_STEPS);
          if (step === lastStep) return;
          lastStep = step;
          const p = step / PROGRESS_STEPS;
          const eased = p * p * (3 - 2 * p);
          photo.style.transform = `translate3d(0,${(eased * 5 * factor).toFixed(3)}%,0) scale(${(BASE_SCALE + eased * 0.11 * factor).toFixed(4)})`;
        },
        // Brief smoothing keeps wheel input fluid and direction changes crisp.
        ease: true,
        heavy: true,
      });
    };

    const observer = new IntersectionObserver(([entry]) => {
      const next = Boolean(entry?.isIntersecting);
      if (visible === next) return;
      visible = next;
      sync();
    });
    observer.observe(section);
    reducedMotion.addEventListener("change", sync);
    desktop.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", sync);
      desktop.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, []);

  return (
    <div aria-hidden="true" className="hero-photo-in pointer-events-none absolute inset-0 z-0">
      <div
        ref={photoRef}
        className="hero-photo absolute inset-0"
        style={{
          transform: `scale(${BASE_SCALE})`,
        }}
      >
        {children}
      </div>
      <span className="hero-parallax-spotlight absolute inset-0" />
    </div>
  );
}
