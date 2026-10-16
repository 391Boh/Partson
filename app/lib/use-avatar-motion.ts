"use client";

import { useEffect, useRef } from "react";

// One observer and visibility listener for every animated avatar. No scroll
// handlers, animation timers, or React updates during animation.
const targets = new Map<HTMLElement, boolean>();
let observer: IntersectionObserver | null = null;
function updateVisibility() {
  targets.forEach((visible, element) => {
    element.dataset.avatarMoving = String(visible && !document.hidden);
  });
}
export function useAvatarMotion(animated: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !animated) return;
    if (!targets.size) {
      document.addEventListener("visibilitychange", updateVisibility);
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            const target = entry.target as HTMLElement;
            if (targets.has(target)) targets.set(target, entry.isIntersecting);
          });
          updateVisibility();
        });
      }
    }
    targets.set(element, !observer);
    observer?.observe(element);
    updateVisibility();
    return () => {
      observer?.unobserve(element);
      targets.delete(element);
      element.dataset.avatarMoving = "false";
      if (!targets.size) {
        observer?.disconnect();
        observer = null;
        document.removeEventListener("visibilitychange", updateVisibility);
      }
    };
  }, [animated]);
  return ref;
}
