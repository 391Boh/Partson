"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type HomePickerSearchControlProps = {
  children: ReactNode;
  mount?: HTMLElement | null;
  count: number | null;
  unit: string;
  tone: "sky" | "blue" | "indigo";
};

export default function HomePickerSearchControl({
  children,
  mount,
  count,
  unit,
  tone,
}: HomePickerSearchControlProps) {
  const control = (
    <div className={`home-picker-search-control home-picker-search-control--${tone}`}>
      <div className="home-picker-search-control-content">{children}</div>
      {count !== null ? (
        <span className="home-picker-search-count" aria-live="polite">
          <span className="home-picker-search-count-label">Доступно</span>
          <span className="home-picker-search-count-value">
            <strong>{count}</strong>
            <span>{unit}</span>
          </span>
        </span>
      ) : null}
    </div>
  );
  return mount ? createPortal(control, mount) : control;
}
