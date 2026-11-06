"use client";

import { useEffect } from "react";

const HERO_SELECTOR = ".directory-intro, .directory-detail-hero";

/** Lets the directory hero's grid and light follow a fine pointer. One
 * delegated listener, one style write per frame, idle when off the hero. */
export default function DirectoryHeroSpotlight() {
  useEffect(() => {
    const query = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!query.matches) return;
    let frame = 0;
    let active: HTMLElement | null = null;
    let point = { x: 0, y: 0 };

    const release = () => {
      if (active) delete active.dataset.spot;
      active = null;
    };
    const paint = () => {
      frame = 0;
      if (!active) return;
      const rect = active.getBoundingClientRect();
      active.style.setProperty("--spot-x", `${Math.round(point.x - rect.left)}px`);
      active.style.setProperty("--spot-y", `${Math.round(point.y - rect.top)}px`);
      active.dataset.spot = "on";
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const hero = (event.target instanceof Element ? event.target.closest<HTMLElement>(HERO_SELECTOR) : null);
      const backdrop = hero?.querySelector<HTMLElement>(":scope > .directory-hero-backdrop") ?? null;
      if (backdrop !== active) release();
      if (!backdrop) return;
      active = backdrop;
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", release);
    return () => {
      cancelAnimationFrame(frame);
      release();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", release);
    };
  }, []);
  return null;
}
