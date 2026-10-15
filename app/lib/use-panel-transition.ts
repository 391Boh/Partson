"use client";

import { useEffect, useRef, type RefObject } from "react";

/** A short, interruptible transition only when the visitor changes a view. */
export function usePanelTransition(
  ref: RefObject<HTMLElement | null>,
  view: string,
  selector?: string,
) {
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    const target = selector ? ref.current?.querySelector<HTMLElement>(selector) : ref.current;
    if (!target?.animate) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = target.animate(
      reduced
        ? [{ opacity: 0.92 }, { opacity: 1 }]
        : [{ opacity: 0.8, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: reduced ? 100 : 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [ref, view, selector]);
}
