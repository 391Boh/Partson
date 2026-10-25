"use client";

import type { ReactNode } from "react";

// Jumps to a homepage section. A plain #anchor without JS; with JS a smooth
// scroll that re-aligns once deferred sections above the target finish
// mounting (their real height can differ from the reserved one). The
// re-align only runs after the smooth scroll has settled and stops for good
// as soon as the visitor scrolls, taps or presses a key themselves — it used
// to pull the page back to the section while they were already reading on.

const USER_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
const REALIGN_INTERVAL_MS = 250;
const REALIGN_WINDOW_MS = 2400;

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

        let stopped = false;
        let timer = 0;
        let lastY = window.scrollY;
        const startedAt = performance.now();
        const stop = () => {
          stopped = true;
          window.clearTimeout(timer);
          for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
        };
        for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
        const realign = () => {
          if (stopped) return;
          const moving = Math.abs(window.scrollY - lastY) > 1;
          lastY = window.scrollY;
          // Only once the smooth scroll has come to rest: correcting mid-flight
          // cut it short with a jump.
          if (!moving) {
            const offset = Math.abs(target.getBoundingClientRect().top - parseFloat(getComputedStyle(target).scrollMarginTop || "0"));
            if (offset > 12) target.scrollIntoView({ behavior: "auto", block: "start" });
          }
          if (performance.now() - startedAt < REALIGN_WINDOW_MS) timer = window.setTimeout(realign, REALIGN_INTERVAL_MS);
          else stop();
        };
        timer = window.setTimeout(realign, REALIGN_INTERVAL_MS * 2);
      }}
    >
      {children}
    </a>
  );
}
