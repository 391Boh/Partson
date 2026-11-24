"use client";

import { useEffect, type RefObject } from "react";

export const adminWindowDragHandle = {
  "data-admin-drag-handle": true,
  tabIndex: 0,
  title: "Перетягніть, щоб пересунути вікно. Стрілки — пересунути, Home — початкові розмір і положення.",
};

type Bounds = { left: number; top: number; width: number; height: number };
type Gesture = {
  id: number; startX: number; startY: number; x: number; y: number;
  handle: HTMLElement; edge?: string; rect: Bounds;
};

/** Shared desktop movement and resizing, without rerendering window contents. */
export function useAdminWindowDrag(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const properties = ["position", "translate", "left", "top", "right", "bottom", "width", "height", "max-width", "max-height"];
    const original = properties.map(key => [key, panel.style.getPropertyValue(key)] as const);
    let x = 0;
    let y = 0;
    let sized = false;
    let drag: Gesture | null = null;
    const minTop = () => Math.max(8, document.querySelector<HTMLElement>(".site-header-shell")?.getBoundingClientRect().bottom ?? 64) + 8;
    const limits = () => ({
      width: Math.max(1, window.innerWidth - 16),
      height: Math.max(1, window.innerHeight - minTop() - 8),
    });
    const fit = (rect: Bounds): Bounds => {
      const max = limits();
      const width = Math.min(rect.width, max.width);
      const height = Math.min(rect.height, max.height);
      return {
        width, height,
        left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.left)),
        top: Math.min(window.innerHeight - height - 8, Math.max(minTop(), rect.top)),
      };
    };
    const applyRect = (rect: Bounds) => {
      x = y = 0;
      sized = true;
      Object.assign(panel.style, {
        position: "fixed", translate: "none", right: "auto", bottom: "auto",
        left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
        maxWidth: "none", maxHeight: "none",
      });
      panel.setAttribute("data-admin-window-sized", "");
    };
    const restore = () => {
      x = y = 0;
      sized = false;
      original.forEach(([key, value]) => value ? panel.style.setProperty(key, value) : panel.style.removeProperty(key));
      panel.removeAttribute("data-admin-window-sized");
    };
    const move = (nextX: number, nextY: number) => {
      const rect = panel.getBoundingClientRect();
      const left = rect.left - x;
      const top = rect.top - y;
      x = Math.min(Math.max(8, window.innerWidth - rect.width - 8), Math.max(8, left + nextX)) - left;
      y = Math.min(Math.max(minTop(), window.innerHeight - rect.height - 8), Math.max(minTop(), top + nextY)) - top;
      panel.style.translate = `${x}px ${y}px`;
    };
    const resize = (rect: Bounds, edge: string, dx: number, dy: number) => {
      const max = limits();
      const minWidth = Math.min(Number(panel.dataset.adminMinWidth) || 360, max.width);
      const minHeight = Math.min(300, max.height);
      let { left, top, width, height } = rect;
      const right = left + width;
      const bottom = top + height;
      if (edge.includes("e")) width = Math.max(minWidth, Math.min(window.innerWidth - left - 8, width + dx));
      if (edge.includes("s")) height = Math.max(minHeight, Math.min(window.innerHeight - top - 8, height + dy));
      if (edge.includes("w")) {
        left = Math.max(8, Math.min(right - minWidth, left + dx));
        width = right - left;
      }
      if (edge.includes("n")) {
        top = Math.max(minTop(), Math.min(bottom - minHeight, top + dy));
        height = bottom - top;
      }
      applyRect(fit({ left, top, width, height }));
    };
    const finish = () => {
      if (!drag) return;
      const { handle, id } = drag;
      drag = null;
      panel.removeAttribute("data-admin-dragging");
      panel.removeAttribute("data-admin-resizing");
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    };
    const handleFor = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      if (target.closest("button,a,input,select,textarea,[role='button'],[contenteditable='true']")) return null;
      const handle = target.closest<HTMLElement>("[data-admin-drag-handle]");
      return handle && panel.contains(handle) ? handle : null;
    };
    const resizeHandleFor = (target: EventTarget | null) => {
      const handle = target instanceof Element ? target.closest<HTMLElement>("[data-admin-resize]") : null;
      return handle && panel.contains(handle) ? handle : null;
    };
    const onDown = (event: PointerEvent) => {
      const resizeHandle = resizeHandleFor(event.target);
      const handle = resizeHandle ?? handleFor(event.target);
      if (!desktop.matches || !handle || event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      finish();
      if (resizeHandle) applyRect(fit(panel.getBoundingClientRect()));
      if (handle.tabIndex >= 0) handle.focus({ preventScroll: true });
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, handle,
        edge: resizeHandle?.dataset.adminResize, rect: panel.getBoundingClientRect() };
      handle.setPointerCapture(event.pointerId);
      panel.setAttribute(resizeHandle ? "data-admin-resizing" : "data-admin-dragging", "");
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.edge) resize(drag.rect, drag.edge, dx, dy);
      else move(drag.x + dx, drag.y + dy);
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId === drag?.id) finish();
    };
    const onKey = (event: KeyboardEvent) => {
      const resizeHandle = resizeHandleFor(event.target);
      if (!desktop.matches || (!resizeHandle && !handleFor(event.target))) return;
      const step = event.shiftKey ? 40 : 10;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      if (event.key === "Home") {
        event.preventDefault();
        finish();
        restore();
      } else if (directions[event.key]) {
        event.preventDefault();
        const [dx, dy] = directions[event.key];
        if (resizeHandle) resize(fit(panel.getBoundingClientRect()), "se", dx, dy);
        else move(x + dx, y + dy);
      }
    };
    const onResize = () => {
      finish();
      if (!desktop.matches) restore();
      else if (sized) applyRect(fit(panel.getBoundingClientRect()));
      else move(x, y);
    };
    panel.addEventListener("pointerdown", onDown);
    panel.addEventListener("keydown", onKey);
    panel.addEventListener("lostpointercapture", onEnd);
    panel.addEventListener("partson:reset-admin-window", restore);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("blur", finish);
    window.addEventListener("resize", onResize);
    return () => {
      finish();
      restore();
      panel.removeEventListener("pointerdown", onDown);
      panel.removeEventListener("keydown", onKey);
      panel.removeEventListener("lostpointercapture", onEnd);
      panel.removeEventListener("partson:reset-admin-window", restore);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", finish);
      window.removeEventListener("resize", onResize);
    };
  }, [active, ref]);
}
