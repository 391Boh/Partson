"use client";

import type { ReactNode } from "react";

// Jumps to a homepage section. A plain #anchor without JS; with JS a smooth
// scroll that re-aligns once deferred sections above the target finish
// mounting (their real height can differ from the reserved one).
export default function HeroSectionLink({
  targetId,
  className,
  ariaLabel,
  children,
}: {
  targetId: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        event.preventDefault();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        target.focus({ preventScroll: true });
        let checks = 0;
        const realign = () => {
          checks += 1;
          const offset = Math.abs(target.getBoundingClientRect().top - parseFloat(getComputedStyle(target).scrollMarginTop || "0"));
          if (offset > 12 && checks > 1) target.scrollIntoView({ behavior: "auto", block: "start" });
          if (checks < 4) window.setTimeout(realign, 450);
        };
        window.setTimeout(realign, 700);
      }}
    >
      {children}
    </a>
  );
}
