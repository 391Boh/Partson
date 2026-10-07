"use client";

import { useEffect } from "react";

const HOVER_SELECTOR = ".card-metal, .home-feature-card, .reveal-adv-cards > article";

/** Pointer-follow data for the homepage hover signatures. Scroll motion
 * (parallax, sliding panels, stage transitions) is pure CSS scroll-driven
 * animation in globals.css, so this component never runs on scroll. */
export default function HomeScrollMotion() {
  useEffect(() => {
    const home = document.querySelector<HTMLElement>(".home-static");
    if (!home || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let card: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let point = { x: 0, y: 0 };
    let frame = 0;

    // Pointer position as card-local custom properties. The rect is read once
    // per card entry (before any tilt applies) and dropped on scroll, so the
    // per-frame work is two style writes on one element and no layout reads.
    const paint = () => {
      frame = 0;
      if (!card || !rect) return;
      const x = Math.max(0, Math.min(rect.width, point.x - rect.left));
      const y = Math.max(0, Math.min(rect.height, point.y - rect.top));
      card.style.setProperty("--mx", `${x.toFixed(1)}px`);
      card.style.setProperty("--my", `${y.toFixed(1)}px`);
      card.style.setProperty("--dx", ((x / rect.width) * 2 - 1).toFixed(3));
      card.style.setProperty("--dy", ((y / rect.height) * 2 - 1).toFixed(3));
    };
    const release = () => {
      if (card) {
        card.style.setProperty("--dx", "0");
        card.style.setProperty("--dy", "0");
      }
      card = null;
      rect = null;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(HOVER_SELECTOR) ?? null;
      if (target !== card) {
        release();
        card = target;
        rect = target?.getBoundingClientRect() ?? null;
      }
      point = { x: event.clientX, y: event.clientY };
      if (card && !frame) frame = requestAnimationFrame(paint);
    };
    const onScroll = () => { rect = null; card = null; };

    home.addEventListener("pointermove", onMove, { passive: true });
    home.addEventListener("pointerleave", release);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      home.removeEventListener("pointermove", onMove);
      home.removeEventListener("pointerleave", release);
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
