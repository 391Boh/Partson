import type { ReactNode } from "react";

/** Server-visible copy and map: no hydration-dependent hiding or entrance flash. */
export default function SectionRevealAdvantages({ children }: { children: ReactNode }) {
  return <div className="section-reveal-advantages is-revealed page-shell-inline relative z-10 space-y-7 sm:space-y-10">{children}</div>;
}
