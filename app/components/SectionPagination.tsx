"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared pagination control for the homepage's three catalogue widgets
// (Auto/tovar/Brands) — each used to build its own: small bare circles,
// slightly-different-sized bare circles, and a pair of large borderless
// floating arrows pinned to the grid's edges. One bounded "chip" reads as a
// single deliberate control instead of three loose pieces, and unifies size/
// shape across all three; `tone` keeps each section's own accent colour so
// the widgets stay visually distinct from one another, matching the rest of
// the homepage's per-section colour identity.
type SectionPaginationTone = "sky" | "blue";

const TONE = {
  sky: {
    ring: "border-sky-200/80 bg-white/85",
    icon: "text-sky-700 hover:bg-sky-50 hover:text-cyan-600",
    active: "text-sky-800",
    divider: "text-cyan-400",
  },
  blue: {
    ring: "border-blue-200/80 bg-white/85",
    icon: "text-blue-700 hover:bg-blue-50 hover:text-sky-600",
    active: "text-blue-800",
    divider: "text-sky-400",
  },
} as const satisfies Record<
  SectionPaginationTone,
  { ring: string; icon: string; active: string; divider: string }
>;

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

  return (
    <div
      role="group"
      aria-label={`Сторінка ${page} з ${totalPages}`}
      className={`inline-flex items-center gap-0.5 rounded-full border ${t.ring} p-1 shadow-[0_6px_18px_-8px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label="Попередня сторінка"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${t.icon} disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8`}
      >
        <ChevronLeft size={16} strokeWidth={2.8} />
      </button>
      <span className="inline-flex items-center gap-1 px-1.5 text-[11px] font-bold tabular-nums sm:text-xs">
        <span className={`text-[15px] font-black ${t.active}`}>{page}</span>
        <span className={`font-semibold ${t.divider}`}>/</span>
        <span className="font-extrabold text-slate-500">{totalPages}</span>
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Наступна сторінка"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${t.icon} disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8`}
      >
        <ChevronRight size={16} strokeWidth={2.8} />
      </button>
    </div>
  );
}
