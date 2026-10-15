"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Keep customer panels usable with the mobile keyboard and keyboard navigation. */
export function useCustomerDialog(ref: RefObject<HTMLDivElement | null>, onClose: () => void, viewKey?: string | boolean) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const previousFocus = document.activeElement;
    const viewport = window.visualViewport;
    const updateViewport = () => {
      panel.style.setProperty("--dialog-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      panel.style.setProperty("--dialog-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    viewport?.addEventListener("resize", updateViewport, { passive: true });
    viewport?.addEventListener("scroll", updateViewport, { passive: true });
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    )).filter(element => element.getClientRects().length > 0 && element.tabIndex >= 0);
    panel.querySelector<HTMLElement>('button[aria-label^="Закрити"]')?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs.length && dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === "Tab") {
        const items = controls();
        const target = event.shiftKey ? items[items.length - 1] : items[0];
        if (target && (!panel.contains(document.activeElement) ||
          document.activeElement === (event.shiftKey ? items[0] : items[items.length - 1]))) {
          event.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [ref, viewKey]);
}
