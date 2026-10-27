"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// Year filter that lives inside the results column of the homepage vehicle
// picker (model step): one horizontal strip of year chips above the list
// instead of a separate <select> in the introduction rail. "Усі" clears the
// filter; the selected chip is kept in view when the list remounts.
export default function VehicleYearRail({ value, years, loading = false, onChange }: {
  value: number | null;
  years: readonly number[];
  loading?: boolean;
  onChange: (year: number | null) => void;
}) {
  const options = [...new Set(years.filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))].sort((a, b) => b - a);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const syncEdges = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const start = node.scrollLeft <= 2;
    const end = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  const optionsKey = options.join(",");
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    // Scroll only the strip, never the page (scrollIntoView would).
    const active = node.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (active) {
      const target = active.offsetLeft - (node.clientWidth - active.offsetWidth) / 2;
      node.scrollLeft = Math.max(0, target);
    }
    syncEdges();
  }, [optionsKey, value, syncEdges]);

  const page = (direction: 1 | -1) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: "smooth" });
  };

  if (!loading && options.length === 0) return null;

  return (
    <div className="vehicle-year-rail" role="group" aria-label="Рік випуску">
      <span className="vehicle-year-rail-label">
        <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
        Рік
      </span>
      <div className="vehicle-year-rail-track" data-at-start={edges.start || undefined} data-at-end={edges.end || undefined}>
        {!edges.start && (
          <button type="button" className="vehicle-year-rail-arrow" data-side="start" onClick={() => page(-1)} aria-label="Попередні роки" tabIndex={-1}>
            <ChevronLeft size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
        <div ref={scrollerRef} className="vehicle-year-rail-scroller no-scrollbar" onScroll={syncEdges} aria-busy={loading || undefined}>
          {loading ? (
            Array.from({ length: 7 }, (_, index) => <span key={index} className="vehicle-year-chip" data-placeholder aria-hidden="true" />)
          ) : (
            <>
              <button type="button" className="vehicle-year-chip" data-any aria-pressed={value == null} onClick={() => onChange(null)}>
                Усі роки
              </button>
              {options.map(year => (
                <button key={year} type="button" className="vehicle-year-chip" aria-pressed={value === year} onClick={() => onChange(value === year ? null : year)}>
                  {year}
                </button>
              ))}
            </>
          )}
        </div>
        {!edges.end && (
          <button type="button" className="vehicle-year-rail-arrow" data-side="end" onClick={() => page(1)} aria-label="Наступні роки" tabIndex={-1}>
            <ChevronRight size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
