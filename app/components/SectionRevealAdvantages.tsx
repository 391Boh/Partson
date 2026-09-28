"use client";

import type { ReactNode } from "react";

import { useSectionReveal } from "app/lib/use-section-reveal";

// AdvantagesSection.tsx is a server component (its content should render in
// the initial HTML for SEO), but the scroll-into-view entrance defined in
// globals.css under `.section-reveal-advantages:not(.is-revealed) …` needs a
// live IntersectionObserver to toggle `.is-revealed` — which only a client
// component can run. This thin wrapper owns just that observer; the actual
// section content is passed through as `children` and keeps rendering
// server-side as usual (a Server Component can be passed as a child to a
// Client Component without itself becoming a client component).
export default function SectionRevealAdvantages({ children }: { children: ReactNode }) {
  const { ref } = useSectionReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="section-reveal-advantages page-shell-inline relative z-10 space-y-7 sm:space-y-10"
    >
      {children}
    </div>
  );
}
