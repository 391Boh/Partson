import type { ReactNode } from "react";

const BASE_SCALE = 1.025;

// Static hero photo, like /partnership. The photo used to drift and zoom with
// the scroll (a scroll-timeline animation, or a per-frame JS fallback where
// timelines are unsupported); a full-width filtered image recomposited on
// every frame was a large part of the homepage scroll lag.
export default function HeroParallaxBackground({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="hero-photo-in pointer-events-none absolute inset-0 z-0">
      <div
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
