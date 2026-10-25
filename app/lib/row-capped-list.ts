"use client";

import { useEffect, type RefObject } from "react";

// Catalog filter lists (brands, models, modifications, categories,
// producers) show at most this many rows; the rest scrolls inside the list.
export const FILTER_LIST_VISIBLE_ROWS = 4;

// Measures the real rows of a vertical grid/flex list (cards can be taller
// than their min-height once a name wraps) and caps it at
// FILTER_LIST_VISIBLE_ROWS through `--list-row-cap` + `data-row-cap`. The
// globals.css rule for [data-row-cap] does the scrolling and fades the edge
// that has more items behind it (`data-more-above` / `data-more-below`).
// A list that already fits, or one laid out horizontally, is left alone.
export function useRowCappedList(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  contentKey: unknown,
) {
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    if (!enabled) {
      list.style.removeProperty("--list-row-cap");
      list.removeAttribute("data-row-cap");
      return;
    }

    let measureFrame = 0;
    let scrollFrame = 0;

    const syncEdges = () => {
      const capped = list.hasAttribute("data-row-cap");
      const below = list.scrollHeight - list.clientHeight - list.scrollTop;
      list.dataset.moreAbove = String(capped && list.scrollTop > 2);
      list.dataset.moreBelow = String(capped && below > 2);
    };

    const measure = () => {
      measureFrame = 0;
      const items = list.children;
      const first = items[0]?.getBoundingClientRect();
      let columns = 0;
      if (first) {
        while (
          columns < items.length &&
          Math.abs(items[columns].getBoundingClientRect().top - first.top) < 2
        ) {
          columns += 1;
        }
      }
      const nextRow = first && columns ? items[columns * FILTER_LIST_VISIBLE_ROWS] : undefined;
      let cap = 0;
      if (first && nextRow) {
        const style = getComputedStyle(list);
        const rowGap = parseFloat(style.rowGap) || 0;
        cap =
          nextRow.getBoundingClientRect().top -
          first.top -
          rowGap +
          (parseFloat(style.paddingTop) || 0) +
          (parseFloat(style.paddingBottom) || 0);
      }
      if (cap > 0) {
        list.style.setProperty("--list-row-cap", `${Math.ceil(cap)}px`);
        list.setAttribute("data-row-cap", "");
      } else {
        list.style.removeProperty("--list-row-cap");
        list.removeAttribute("data-row-cap");
      }
      syncEdges();
    };

    const scheduleMeasure = () => {
      if (!measureFrame) measureFrame = window.requestAnimationFrame(measure);
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        syncEdges();
      });
    };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(list);
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    list.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", onScroll);
      if (measureFrame) window.cancelAnimationFrame(measureFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      // The cap stays on between runs: dropping it would reset the list's
      // scroll position on every parent re-render.
    };
  }, [ref, enabled, contentKey]);
}
