"use client";

import { ChartNoAxesCombined, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { adminWindowDragHandle, useAdminWindowDrag } from "app/lib/use-admin-window-drag";
import AdminOverview from "./AdminOverview";
import AdminWindowResizeHandles from "./AdminWindowResizeHandles";

export default function AdminOverviewWindow({ onClose, onOpenOrder, onOpenCalls }: {
  onClose: () => void;
  onOpenOrder: (orderId: string, phone: string) => void;
  onOpenCalls: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useAdminWindowDrag(panelRef);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("[data-admin-dialog], .product-editor")) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);

  return <section
    ref={panelRef}
    id="admin-overview-window"
    data-admin-overlay
    data-admin-min-width="440"
    role="dialog"
    aria-modal="false"
    aria-labelledby="admin-overview-title"
    className="admin-overview-window app-overlay-panel"
  >
    <header {...adminWindowDragHandle} className="admin-overview-header">
      <span className="admin-overview-symbol"><ChartNoAxesCombined size={20} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 id="admin-overview-title">Огляд магазину</h2>
        <p>Продажі, замовлення та стан каталогу</p>
      </div>
      <button type="button" className="admin-overview-icon-button" aria-label="Відновити розмір і положення вікна"
        title="Початкові розмір і положення" onClick={() => panelRef.current?.dispatchEvent(new Event("partson:reset-admin-window"))}>
        <RotateCcw size={16} aria-hidden="true" />
      </button>
      <button ref={closeRef} type="button" className="admin-overview-icon-button" aria-label="Закрити огляд" title="Закрити" onClick={onClose}>
        <X size={19} aria-hidden="true" />
      </button>
    </header>
    <div className="admin-overview-scroll app-panel-scroll">
      <AdminOverview onOpenOrder={onOpenOrder} onOpenCalls={onOpenCalls} />
    </div>
    <AdminWindowResizeHandles />
  </section>;
}
