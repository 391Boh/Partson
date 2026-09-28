"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared pagination control for the homepage's three catalogue widgets
// (Auto/tovar/Brands). Deliberately unboxed — no shared bordered/shadowed
// "chip" wrapping the whole control. A pair of plain circular icon buttons
// flank a compact page counter with a thin progress line underneath, so the
// control reads as light, modern UI chrome rather than a separate card
// sitting in the section. `tone` keeps each section's own accent colour so
// the three widgets stay visually distinct, matching the rest of the
// homepage's per-section colour identity.
type SectionPaginationTone = "sky" | "blue" | "indigo";

const TONE = {
  sky: {
    icon: "text-slate-500 hover:bg-sky-50 hover:text-sky-700",
    active: "text-sky-700",
    fill: "bg-sky-500",
  },
  blue: {
    icon: "text-slate-500 hover:bg-blue-50 hover:text-blue-700",
    active: "text-blue-700",
    fill: "bg-blue-500",
  },
  indigo: {
    icon: "text-slate-500 hover:bg-indigo-50 hover:text-indigo-700",
    active: "text-indigo-700",
    fill: "bg-indigo-500",
  },
} as const satisfies Record<SectionPaginationTone, { icon: string; active: string; fill: string }>;

type SectionPaginationProps = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  tone?: SectionPaginationTone;
  className?: string;
};

export default function SectionPagination({
  page,
  totalPages,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  tone = "sky",
  className = "",
}: SectionPaginationProps) {
  if (totalPages <= 1) return null;
  const t = TONE[tone];
  const progress = totalPages > 1 ? (page - 1) / (totalPages - 1) : 1;

  return (
    <div
      role="group"
      aria-label={`Сторінка ${page} з ${totalPages}`}
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label="Попередня сторінка"
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${t.icon} disabled:pointer-events-none disabled:opacity-25`}
      >
        <ChevronLeft size={17} strokeWidth={2.6} />
      </button>

      <div className="flex flex-col items-center gap-1 px-0.5">
        <span className="text-[11px] font-bold leading-none tabular-nums">
          <span className={t.active}>{page}</span>
          <span className="text-slate-400"> / {totalPages}</span>
        </span>
        <span aria-hidden="true" className="relative h-[3px] w-11 overflow-hidden rounded-full bg-slate-200/80">
          <span
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out ${t.fill}`}
            style={{ width: `${Math.max(10, progress * 100)}%` }}
          />
        </span>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Наступна сторінка"
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${t.icon} disabled:pointer-events-none disabled:opacity-25`}
      >
        <ChevronRight size={17} strokeWidth={2.6} />
      </button>
    </div>
  );
}
