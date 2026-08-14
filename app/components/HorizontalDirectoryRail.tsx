"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type HorizontalDirectoryRailProps = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  rows?: 1 | 2;
};

const railArrowClass =
  "absolute top-1/2 z-10 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-800 shadow-[0_10px_24px_rgba(14,165,233,0.16)] transition-[border-color,box-shadow,background-color,color] duration-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 hover:shadow-[0_13px_28px_rgba(14,165,233,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-30 sm:h-12 sm:w-12";

export default function HorizontalDirectoryRail({
  children,
  ariaLabel,
  className = "",
  rows = 1,
}: HorizontalDirectoryRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const updateControls = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const nextPageCount = Math.max(1, Math.ceil(rail.scrollWidth / rail.clientWidth));
    const nextPage =
      maxScroll > 0
        ? Math.round((rail.scrollLeft / maxScroll) * (nextPageCount - 1))
        : 0;
    setCanScrollBack(rail.scrollLeft > 4);
    setCanScrollForward(remaining > 4);
    setPageCount(nextPageCount);
    setCurrentPage(Math.min(nextPage, nextPageCount - 1));
  }, []);

  useEffect(() => {
    updateControls();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateControls);
    observer.observe(rail);
    return () => {
      observer.disconnect();
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [children, updateControls]);

  const handleScroll = () => {
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateControls();
    });
  };

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(280, rail.clientWidth * 0.82),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const goToPage = (page: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const target = pageCount > 1 ? maxScroll * (page / (pageCount - 1)) : 0;
    rail.scrollTo({
      left: target,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const visiblePages = Array.from({ length: Math.min(pageCount, 7) }, (_, index) => {
    if (pageCount <= 7) return index;
    const start = Math.min(Math.max(currentPage - 3, 0), pageCount - 7);
    return start + index;
  });

  return (
    <div className="relative">
      <div className="relative px-8 sm:px-12">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!canScrollBack}
          aria-label="Прокрутити список назад"
          className={`${railArrowClass} left-0`}
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>

        <div
          ref={railRef}
          role="region"
          aria-label={ariaLabel}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }}
          className={`directory-horizontal-rail snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-0.5 pb-3 pt-1 outline-none [scrollbar-color:rgba(14,165,233,0.45)_transparent] [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-sky-400/60 ${rows === 2 ? "grid grid-flow-col grid-rows-2" : "flex"} ${className}`}
        >
          {children}
        </div>

        <button
          type="button"
          onClick={() => move(1)}
          disabled={!canScrollForward}
          aria-label="Прокрутити список вперед"
          className={`${railArrowClass} right-0`}
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-2.5">
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-sky-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))] px-3 py-1.5 shadow-[0_10px_24px_rgba(14,165,233,0.1),inset_0_1px_0_white]">
          <div
            className="flex min-w-[4.5rem] items-center justify-center gap-1"
            aria-label={`Сторінка ${currentPage + 1} з ${pageCount}`}
          >
            {visiblePages.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => goToPage(page)}
                aria-label={`Перейти на сторінку ${page + 1}`}
                aria-current={page === currentPage ? "page" : undefined}
                className={`h-2 rounded-full transition-[width,background-color,box-shadow] duration-300 ${page === currentPage ? "w-5 bg-sky-600 shadow-[0_2px_7px_rgba(2,132,199,0.35)]" : "w-2 bg-sky-200 hover:bg-sky-400"}`}
              />
            ))}
          </div>

          <span className="min-w-[2.8rem] text-center text-[10px] font-black tabular-nums text-slate-500">
            {currentPage + 1}/{pageCount}
          </span>
        </div>
      </div>
    </div>
  );
}
