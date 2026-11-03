"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

const PHONE_QUERY = "(max-width: 767px)";
const SWIPE_COMMIT_PX = 56;
const SWIPE_INTENT_PX = 10;

// The list's own page arrows (toolbar or flanking chevrons) own the paging
// state; a swipe presses the same button so both paths stay identical.
const findPageButton = (rail: HTMLElement, direction: "prev" | "next") => {
  const label = direction === "next" ? "Наступна сторінка" : "Попередня сторінка";
  const scope = rail.closest(".home-picker-section") ?? document;
  for (let node: HTMLElement | null = rail.parentElement; node; node = node.parentElement) {
    const button = node.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (button) return button;
    if (node === scope) break;
  }
  return null;
};

/** Phone pickers show one complete grid; larger screens retain their rail. */
export function useHomePagedGrid(ref: RefObject<HTMLDivElement | null>, activePage: number) {
  // The grid can remount after search, a vehicle step or a brand detail panel.
  // Annotate after every commit, before paint, without another React render.
  useLayoutEffect(() => {
    const rail = ref.current;
    if (!rail?.closest(".home-static")) return;
    if (!rail.hasAttribute("data-home-paged-grid")) rail.setAttribute("data-home-paged-grid", "");
    Array.from(rail.firstElementChild?.children ?? []).forEach((page, index) => {
      page.toggleAttribute("data-home-page-active", index === activePage);
    });
  });

  useEffect(() => {
    const query = matchMedia(PHONE_QUERY);
    const align = () => {
      const rail = ref.current;
      if (!rail?.closest(".home-static")) return;
      rail.style.scrollSnapType = "";
      rail.scrollTo({ left: query.matches ? 0 : activePage * rail.clientWidth, behavior: "instant" });
    };
    query.addEventListener("change", align);
    return () => query.removeEventListener("change", align);
  }, [ref, activePage]);

  // Phone swipe: the active page follows the finger horizontally while the
  // browser keeps vertical page scrolling (touch-action: pan-y). Past the
  // threshold the page turns; otherwise it springs back. At the first/last
  // page the drag is damped so the edge reads as an edge.
  useEffect(() => {
    const rail = ref.current;
    if (!rail?.closest(".home-static")) return;
    const query = matchMedia(PHONE_QUERY);
    let gesture: { id: number; x: number; y: number; horizontal: boolean | null; page: HTMLElement | null; dx: number } | null = null;

    const activePageEl = () => rail.querySelector<HTMLElement>(":scope > div > [data-home-page-active]");
    const release = (page: HTMLElement | null) => {
      if (!page) return;
      page.style.transition = "transform 220ms cubic-bezier(.22,1,.36,1), opacity 220ms ease-out";
      page.style.transform = "";
      page.style.opacity = "";
      window.setTimeout(() => { page.style.transition = ""; }, 240);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !query.matches || gesture) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: null, page: activePageEl(), dx: 0 };
    };
    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.horizontal === null) {
        if (Math.abs(dx) < SWIPE_INTENT_PX && Math.abs(dy) < SWIPE_INTENT_PX) return;
        gesture.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!gesture.horizontal) { gesture = null; return; }
      }
      const target = findPageButton(rail, dx < 0 ? "next" : "prev");
      const damped = !target || target.disabled ? dx * 0.25 : dx;
      gesture.dx = dx;
      if (gesture.page) {
        gesture.page.style.transition = "none";
        gesture.page.style.transform = `translate3d(${damped}px,0,0)`;
        gesture.page.style.opacity = String(1 - Math.min(Math.abs(damped) / rail.clientWidth, 1) * 0.35);
      }
    };
    const onEnd = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const { dx, horizontal, page } = gesture;
      gesture = null;
      if (!horizontal) return;
      const direction = dx < 0 ? "next" : "prev";
      const button = findPageButton(rail, direction);
      if (Math.abs(dx) >= SWIPE_COMMIT_PX && button && !button.disabled) {
        if (page) { page.style.transition = ""; page.style.transform = ""; page.style.opacity = ""; }
        rail.setAttribute("data-home-swipe", direction);
        button.click();
        window.setTimeout(() => rail.removeAttribute("data-home-swipe"), 320);
        return;
      }
      release(page);
    };
    // A completed horizontal drag must not also tap the card under the finger.
    const onClick = (event: MouseEvent) => {
      if (!rail.hasAttribute("data-home-swipe")) return;
      event.preventDefault();
      event.stopPropagation();
    };

    rail.addEventListener("pointerdown", onDown, { passive: true });
    rail.addEventListener("pointermove", onMove, { passive: true });
    rail.addEventListener("pointerup", onEnd, { passive: true });
    rail.addEventListener("pointercancel", onEnd, { passive: true });
    rail.addEventListener("click", onClick, true);
    return () => {
      rail.removeEventListener("pointerdown", onDown);
      rail.removeEventListener("pointermove", onMove);
      rail.removeEventListener("pointerup", onEnd);
      rail.removeEventListener("pointercancel", onEnd);
      rail.removeEventListener("click", onClick, true);
    };
    // No deps: the rail element itself remounts after search or a step change.
  });
}
