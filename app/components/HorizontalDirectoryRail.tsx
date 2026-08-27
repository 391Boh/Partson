"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type HorizontalDirectoryRailProps = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  rows?: 1 | 2;
};

export function DirectoryPagePagination({
  currentPage,
  pageCount,
  className = "",
}: {
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const safePage = Math.min(Math.max(currentPage, 0), pageCount - 1);

  // One consistent compact "current / total" counter everywhere (brand,
  // category, producer, ...) instead of a numbered-pill strip — a row of
  // page buttons doesn't fit a phone width once a list needs many pages
  // (single-column mobile cards only fit 1-2 items per page), and jumping
  // to an arbitrary page deep in a long list isn't useful anyway. The
  // prev/next arrows next to the rail handle navigation.
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-white px-3.5 py-1.5 text-[12px] font-bold tabular-nums text-sky-800 shadow-sm">
        <span className="text-sky-600">{safePage + 1}</span>
        <span className="h-3 w-px bg-sky-200" aria-hidden="true" />
        <span className="text-slate-400">{pageCount}</span>
      </span>
    </div>
  );
}

// Arrows render at every breakpoint, including mobile. Card widths are
// container-relative (w-full / fixed px from sm: up), not viewport-relative,
// so reserving side padding here for the arrows shrinks the rail's box and
// the cards inside shrink right along with it — no overflow.
const railArrowClass =
  "absolute top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-800 shadow-[0_10px_24px_rgba(14,165,233,0.16)] transition-[border-color,box-shadow,background-color,color] duration-200 active:scale-[0.92] hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 hover:shadow-[0_13px_28px_rgba(14,165,233,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-30 sm:h-12 sm:w-12";

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
  // How many columns actually fit in the visible rail at once — a "page" is
  // one full screen of columns, not a single column. Starts at the safe
  // mobile default (1) since it can only be measured once the rail has real
  // layout; updateControls() corrects it on mount and on resize.
  const [columnsPerPage, setColumnsPerPage] = useState(1);
  const itemsPerColumn = rows === 2 ? 2 : 1;
  // Computed from the children prop (known at first render, no DOM needed)
  // instead of a hardcoded 1 — otherwise the pagination bar renders as
  // absent on first paint and pops in once the post-mount effect measures
  // the real count, which is a guaranteed layout shift on every page load.
  // Assumes columnsPerPage=1 (matches the eventual mobile measurement); on
  // wider screens updateControls() corrects the page count right after
  // mount, which only changes the button count within the same-height row —
  // not a layout shift the way the bar's presence/absence was.
  const [pageCount, setPageCount] = useState(() =>
    Math.max(1, Math.ceil(Children.count(children) / itemsPerColumn))
  );

  const updateControls = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const totalItems = rail.children.length;
    const totalColumns = Math.max(1, Math.ceil(totalItems / itemsPerColumn));

    // Column width + gap, measured from real layout (not assumed) — the
    // gap between column 0 and column 1's start is exactly one "step".
    const firstColumn = rail.children[0] as HTMLElement | undefined;
    const secondColumn = rail.children[itemsPerColumn] as HTMLElement | undefined;
    const columnStep =
      firstColumn && secondColumn
        ? secondColumn.offsetLeft - firstColumn.offsetLeft
        : rail.clientWidth || 1;
    const nextColumnsPerPage =
      columnStep > 0 ? Math.max(1, Math.round(rail.clientWidth / columnStep)) : 1;
    const nextPageCount = Math.max(1, Math.ceil(totalColumns / nextColumnsPerPage));

    // Pages line up with actual page-start column boundaries (not a
    // scrollWidth ratio, which drifts once there are dozens of pages), so
    // read the real offsetLeft of each page's first card instead of
    // interpolating. Nearest match rather than a strict "<= scrollLeft"
    // cutoff, since the settled scrollLeft after a snap/clamp near the end
    // can land a few px short of the exact target.
    let nextPage = 0;
    let bestDelta = Infinity;
    for (let columnIndex = 0; columnIndex < totalColumns; columnIndex += nextColumnsPerPage) {
      const child = rail.children[columnIndex * itemsPerColumn] as HTMLElement | undefined;
      if (!child) break;
      const delta = Math.abs(child.offsetLeft - rail.scrollLeft);
      if (delta < bestDelta) {
        bestDelta = delta;
        nextPage = columnIndex / nextColumnsPerPage;
      } else if (child.offsetLeft > rail.scrollLeft) {
        break;
      }
    }

    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    setCanScrollBack(rail.scrollLeft > 4);
    setCanScrollForward(remaining > 4);
    setColumnsPerPage(nextColumnsPerPage);
    setPageCount(nextPageCount);
    setCurrentPage(nextPage);
  }, [itemsPerColumn]);

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

  const goToPage = (page: number, behavior: ScrollBehavior = "auto") => {
    const rail = railRef.current;
    if (!rail) return;
    const clampedPage = Math.min(Math.max(page, 0), pageCount - 1);
    const itemIndex = clampedPage * columnsPerPage * itemsPerColumn;
    const target = rail.children[itemIndex] as HTMLElement | undefined;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // "auto" (instant) for direct page-number jumps: a jump can span many
    // page-boundaries at once, and Chrome's smooth-scroll can get
    // intercepted by scroll-snap mid-flight and stop short of the actual
    // target. move() below always requests a single adjacent page, where
    // smooth reads better and isn't at risk of that.
    rail.scrollTo({
      left: target ? Math.min(target.offsetLeft, maxScrollLeft) : 0,
      behavior: reduceMotion ? "auto" : behavior,
    });
    // Trust the explicit target instead of re-measuring: a trailing page
    // near the end can't scroll its column flush to the left edge (there's
    // no more room past it), so the scroll clamps — and re-deriving "current
    // page" from that clamped position via updateControls() would land on
    // an earlier page than the one actually clicked.
    setCurrentPage(clampedPage);
    setCanScrollBack(clampedPage > 0);
    setCanScrollForward(clampedPage < pageCount - 1);
  };

  const move = (direction: -1 | 1) => goToPage(currentPage + direction, "smooth");

  // A swipe should move by a full page (every column currently visible),
  // not by a single column — so only the first column of each page group
  // is a snap point. Overriding via inline style (wins over the caller's
  // own `snap-start snap-always` Tailwind classes) keeps this dynamic:
  // columnsPerPage changes with viewport width, so which columns are
  // page-starts can't be baked into a static className.
  const snapAwareChildren = Children.toArray(children).map((child, index) => {
    if (!isValidElement(child)) return child;
    const columnIndex = Math.floor(index / itemsPerColumn);
    const isPageStart = columnIndex % columnsPerPage === 0;
    const element = child as ReactElement<{ style?: React.CSSProperties }>;
    return cloneElement(element, {
      style: {
        ...element.props.style,
        scrollSnapAlign: isPageStart ? "start" : "none",
        scrollSnapStop: isPageStart ? "always" : "normal",
      },
    });
  });

  return (
    <div className="relative">
      <div className="relative px-10 sm:px-12">
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
          {snapAwareChildren}
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

      {pageCount > 1 ? (
        <DirectoryPagePagination
          currentPage={currentPage}
          pageCount={pageCount}
          onPageChange={goToPage}
          className="mt-1.5"
        />
      ) : null}
    </div>
  );
}
