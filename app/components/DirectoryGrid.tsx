"use client";

import { Children, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/** A horizontal gesture changes the same page used by the numbered controls. */
export default function DirectoryGrid({ children, ariaLabel, variant = "compact", page, pageCount, onPageChange }: {
  children: ReactNode;
  ariaLabel: string;
  variant?: "compact" | "groups";
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null);
  const suppressClick = useRef(false);
  const rail = useRef<HTMLDivElement>(null);
  const wheelGesture = useRef({ last: 0, distance: 0, direction: 0, consumed: false });
  const previousPage = useRef(page);
  const motion = useRef<Animation | null>(null);
  const changingPage = useRef(false);
  const contentKey = Children.toArray(children).map(child =>
    typeof child === "object" && child !== null && "key" in child ? child.key : ""
  ).join("|");

  const move = (direction: number) => {
    const next = Math.max(1, Math.min(pageCount, page + direction));
    const element = rail.current;
    if (changingPage.current) return;
    if (next === page) { settle(); return; }
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onPageChange(next); return;
    }
    const from = getComputedStyle(element).transform;
    motion.current?.cancel();
    element.style.transform = "";
    changingPage.current = true;
    const exit = element.animate([
      { transform: from === "none" ? "translateX(0px)" : from, opacity: 1 },
      { transform: `translateX(${-direction * element.clientWidth * .85}px)`, opacity: 0 },
    ], { duration: 170, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    motion.current = exit;
    // Cancellation (search, resize, numbered navigation, unmount) must never
    // apply an old gesture to a newer list.
    void exit.finished.then(() => onPageChange(next)).catch(() => {});
  };

  const displace = (distance: number) => {
    const element = rail.current;
    if (!element || changingPage.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    motion.current?.cancel();
    const atEdge = distance > 0 ? page === 1 : page === pageCount;
    const limit = element.clientWidth * .85;
    // Follow the finger almost one-to-one; soften only the actual list edges.
    const offset = atEdge ? Math.sign(distance) * 44 * (1 - Math.exp(-Math.abs(distance) / 150)) : Math.max(-limit, Math.min(limit, distance * .95));
    element.style.transform = `translateX(${offset}px)`;
  };
  const settle = () => {
    const element = rail.current;
    if (!element) return;
    if (changingPage.current) return;
    const from = getComputedStyle(element).transform;
    element.style.transform = "";
    motion.current?.cancel();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      motion.current = element.animate([{ transform: from }, { transform: "translateX(0px)" }],
        { duration: 230, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  };

  useLayoutEffect(() => {
    const direction = Math.sign(page - previousPage.current);
    previousPage.current = page;
    const element = rail.current;
    changingPage.current = false;
    if (!element) return;
    element.style.transform = "";
    motion.current?.cancel();
    if (direction && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      motion.current = element.animate([
        { transform: `translateX(${direction * element.clientWidth * .85}px)`, opacity: .2 },
        { transform: "translateX(0px)", opacity: 1 },
      ], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
    }
    return () => motion.current?.cancel();
  }, [page, contentKey]);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    let returnTimer: ReturnType<typeof setTimeout> | undefined;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      // Trackpads emit wheel events rather than touch/pointer gestures.
      // Shift + wheel also provides horizontal navigation with a mouse.
      const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (!delta || (!event.shiftKey && Math.abs(delta) <= Math.abs(event.deltaY) * 1.3)) return;
      event.preventDefault();
      const now = performance.now();
      const state = wheelGesture.current;
      const direction = Math.sign(delta);
      if (now - state.last > 400 || direction !== state.direction) {
        state.distance = 0;
        state.consumed = false;
      }
      state.last = now;
      state.direction = direction;
      if (state.consumed || changingPage.current) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
      state.distance += Math.abs(delta) * scale;
      clearTimeout(returnTimer);
      if (state.distance < 48) {
        displace(-direction * state.distance);
        returnTimer = setTimeout(settle, 140);
        return;
      }
      state.consumed = true;
      displace(-direction * state.distance);
      move(direction);
    };
    // React wheel listeners are passive; native binding lets us contain only
    // horizontal gestures while retaining normal vertical scrolling and zoom.
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => { clearTimeout(returnTimer); element.removeEventListener("wheel", handleWheel); };
    // Gesture helpers use this page's bounds and are refreshed with the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageCount, onPageChange]);

  return (
    <div className={`directory-swipe directory-swipe--${variant}`}>
      <div className="directory-swipe-viewport">
      <div ref={rail} className={`directory-results directory-results--${variant} directory-swipe-track`}
        role="list" aria-label={ariaLabel} tabIndex={0}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || changingPage.current) return;
          suppressClick.current = false;
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
        }}
        onPointerMove={event => {
          const start = gesture.current;
          if (!start || start.id !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (!start.horizontal) {
            if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; return; }
            if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.3) return;
            start.horizontal = true;
            suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          displace(dx);
        }}
        onPointerUp={event => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || start.id !== event.pointerId || !start.horizontal) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          const dx = event.clientX - start.x;
          if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.3) {
            const direction = dx < 0 ? 1 : -1;
            if ((direction < 0 && page === 1) || (direction > 0 && page === pageCount)) settle();
            else move(direction);
          } else settle();
        }}
        onPointerCancel={() => { gesture.current = null; settle(); }}
        onClickCapture={event => {
          if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
        }}
        onDragStart={event => event.preventDefault()}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}>
        {children}
      </div>
      </div>
    </div>
  );
}
