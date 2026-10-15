"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import CatalogLoaderCard from "./CatalogLoaderCard";
import { clearCatalogBrowserCache } from "app/lib/catalog-client-cache";

const THRESHOLD = 110;
const WHEEL_GESTURE_GAP = 600;

// Passive listeners keep ordinary scrolling on the compositor. The content
// becomes a translated layer only for the duration of a pull gesture.
export default function PullToRefresh({ contentRef, dark = false }: { contentRef: RefObject<HTMLElement | null>; dark?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "pull" | "ready" | "loading">("idle");

  useEffect(() => {
    let distance = 0;
    let loading = false;
    let touchStart: { x: number; y: number } | null = null;
    let lastWheel = 0;
    let wheelCanPull = false;
    let arrivedAtTop = 0;
    let isAtTop = window.scrollY <= 1;
    let timer = 0;
    let reloadTimer = 0;
    let frame = 0;
    let shownDistance = 0;
    let lastPaint = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const content = contentRef.current;
    const root = document.documentElement;
    root.classList.add("has-pull-refresh");

    const eligible = (target: EventTarget | null) => {
      if (!isAtTop || window.scrollY > 1 || document.body.style.overflow === "hidden" || root.style.overflow === "hidden") return false;
      let element = target instanceof Element ? target : null;
      if (element?.closest("header,nav,input,textarea,select,[role='dialog'],[contenteditable='true']")) return false;
      // A scrollable inner panel owns its gesture, even at its own top edge.
      while (element && element !== document.body && element !== root) {
        if (element.scrollHeight > element.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return false;
        element = element.parentElement;
      }
      return true;
    };
    const paint = (now: number) => {
      const elapsed = lastPaint ? Math.min(now - lastPaint, 64) : 16;
      lastPaint = now;
      const smoothing = distance === 0 ? 35 : touchStart ? 45 : 70;
      shownDistance += (distance - shownDistance) * (reducedMotion ? 1 : 1 - Math.exp(-elapsed / smoothing));
      if (Math.abs(distance - shownDistance) < (distance === 0 ? 0.25 : 0.08)) shownDistance = distance;
      panelRef.current?.style.setProperty("--pull-progress", String(Math.min(shownDistance / THRESHOLD, 1)));
      content?.style.setProperty("--pull-offset", `${(shownDistance * 0.55).toFixed(2)}px`);
      if (shownDistance !== distance) frame = requestAnimationFrame(paint);
      else {
        frame = 0;
        lastPaint = 0;
        if (distance === 0) {
          content?.classList.remove("pull-refresh-content");
          content?.style.removeProperty("--pull-offset");
          root.classList.remove("is-pulling-home", "is-pulling-refresh");
          setPhase("idle");
        }
      }
    };
    const update = (value: number) => {
      distance = Math.max(0, Math.min(value, THRESHOLD * 1.2));
      if (distance > 0) {
        content?.classList.add("pull-refresh-content");
        root.classList.add("is-pulling-refresh");
        if (dark) root.classList.add("is-pulling-home");
      }
      if (distance > 0) setPhase(distance >= THRESHOLD ? "ready" : "pull");
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const reset = () => {
      if (!loading && (distance !== 0 || shownDistance !== 0)) update(0);
    };
    const refresh = () => {
      if (loading) return;
      loading = true;
      window.clearTimeout(timer);
      update(0);
      setPhase("loading");
      // Return immediately, then reload as the brief return finishes.
      // Preserve the current URL and fetch fresh catalog data.
      reloadTimer = window.setTimeout(() => {
        clearCatalogBrowserCache();
        window.location.reload();
      }, 280);
    };
    // Normal scrolling needs only the two boundary transitions, not a read
    // and animation frame for every scroll tick. Observe the existing page
    // sentinel; retain a frame-coalesced fallback for older browsers.
    let scrollFrame = 0;
    const updateTop = (nextIsAtTop: boolean) => {
      if (isAtTop === nextIsAtTop) return;
      if (nextIsAtTop) {
        arrivedAtTop = performance.now();
        wheelCanPull = false;
      }
      isAtTop = nextIsAtTop;
      if (!isAtTop) { touchStart = null; reset(); }
    };
    const readScroll = () => {
      scrollFrame = 0;
      updateTop(window.scrollY <= 1);
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(readScroll);
    };
    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      // Decide once at the start of a wheel gesture. A gesture that starts
      // below the top stays ineligible through its entire momentum tail.
      // Every wheel event extends that gesture, including ordinary scrolling.
      const newGesture = lastWheel === 0 || now - lastWheel > WHEEL_GESTURE_GAP;
      lastWheel = now;
      if (loading || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        wheelCanPull = false;
        reset();
        return;
      }
      if (event.deltaY >= 0) { wheelCanPull = false; reset(); return; }
      // Downward scrolling and upward gestures below the page boundary never
      // need the ancestor geometry/style walk used to recognise a pull.
      if (newGesture) wheelCanPull = now - arrivedAtTop >= WHEEL_GESTURE_GAP && eligible(event.target);
      if (!wheelCanPull || !eligible(event.target)) { wheelCanPull = false; return; }
      const delta = -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      update(distance + Math.min(delta, 45));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (distance >= THRESHOLD) refresh(); else reset(); }, 70);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (loading || event.touches.length !== 1 || !eligible(event.target)) return;
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY - shownDistance / 0.65 };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touchStart || loading) return;
      if (event.touches.length !== 1) { touchStart = null; reset(); return; }
      const touch = event.touches[0];
      const dy = touch.clientY - touchStart.y;
      if (Math.abs(touch.clientX - touchStart.x) > Math.max(24, Math.abs(dy))) { touchStart = null; reset(); return; }
      update(dy * 0.65);
    };
    const onTouchEnd = () => {
      if (!touchStart) return;
      touchStart = null;
      if (distance >= THRESHOLD) refresh(); else reset();
    };
    const onTouchCancel = () => { touchStart = null; reset(); };
    const options = { passive: true };
    const sentinel = document.querySelector("[data-page-top-sentinel]");
    let topObserver: IntersectionObserver | null = null;
    if (sentinel && typeof IntersectionObserver !== "undefined") {
      topObserver = new IntersectionObserver(([entry]) => {
        if (entry) updateTop(entry.isIntersecting && entry.intersectionRatio >= 1);
      }, { threshold: 1, rootMargin: "1px 0px 0px 0px" });
      topObserver.observe(sentinel);
    } else {
      window.addEventListener("scroll", onScroll, options);
    }
    window.addEventListener("wheel", onWheel, options);
    window.addEventListener("touchstart", onTouchStart, options);
    window.addEventListener("touchmove", onTouchMove, options);
    window.addEventListener("touchend", onTouchEnd, options);
    window.addEventListener("touchcancel", onTouchCancel, options);
    return () => {
      root.classList.remove("has-pull-refresh", "is-pulling-home", "is-pulling-refresh");
      window.clearTimeout(timer);
      window.clearTimeout(reloadTimer);
      content?.classList.remove("pull-refresh-content");
      content?.style.removeProperty("--pull-offset");
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      topObserver?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [contentRef, dark]);

  return (
    <div ref={panelRef} className="pull-refresh" data-phase={phase} data-theme={dark ? "dark" : "light"} data-placement={dark ? "header" : "filters"} role="status" aria-live="polite" aria-atomic="true">
      {phase !== "idle" && <CatalogLoaderCard compact label="Завантаження" kicker="" />}
    </div>
  );
}
