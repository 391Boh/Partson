"use client";

import { useEffect, useRef } from "react";

import { observeNearViewport } from "app/lib/shared-intersection-observer";

// Drives the scroll-into-view entrance for the car-picker and categories blocks
// (both client-only, ssr:false — so there is no server-rendered flash to guard).
//
// The pre-reveal (hidden/offset) state lives in globals.css under
// `.section-reveal-{auto,cats}:not(.is-revealed) …`. This hook only adds
// `.is-revealed` to the container — the first time it scrolls into view, or
// after a safety timeout, or immediately under reduced motion. Both blocks share
// one IntersectionObserver (same rootMargin key in observeNearViewport).
const REVEAL_MARGIN = "0px 0px -12% 0px";
// Long enough that a real visitor always reaches the section by scrolling
// first (so the entrance plays as a scroll-into-view reveal, never as a
// timed pop while the block is still far below the fold). This is only a
// last-resort guard for the case where IntersectionObserver never fires at
// all (unsupported / hard-throttled background tab) so content can't stay
// stuck hidden.
const SAFETY_MS = 9000;

export function useSectionReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-revealed");
      return;
    }

    // Adding one DOM class avoids rerendering the entire interactive catalog,
    // car picker or brand directory at the exact moment it enters viewport.
    const reveal = () => el.classList.add("is-revealed");
    const safety = window.setTimeout(reveal, SAFETY_MS);
    const stop = observeNearViewport(el, REVEAL_MARGIN, reveal);

    return () => {
      window.clearTimeout(safety);
      stop();
    };
  }, []);

  return { ref, className: "" };
}
