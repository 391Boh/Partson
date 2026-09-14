// Shared guard for the paginated horizontal rails on the homepage and catalog
// filters (car brands/models/modifications, manufacturer grid, category
// groups, directory rail). Every one of them pairs a native
// `scroll-snap` + `overflow-x-auto` list with a React `page` state that a
// scroll listener keeps in sync via `Math.round(scrollLeft / pageWidth)`.
//
// The problem this solves: arrow taps, swipe-release and clamp corrections all
// call `container.scrollTo({ behavior: "smooth" })`. The browser then emits a
// stream of `scroll` events for the whole animation, and the sync listener
// drives `page` back through every intermediate rounded value the scroll
// passes over — the active page (and any virtualized neighbour it mounts)
// visibly flickers between pages, and in the swipe case a stale mid-gesture
// value can overwrite the intended target. Mandatory scroll-snap fighting the
// same smooth `scrollTo` in WebKit adds a bounce on top.
//
// While the guard is armed the caller skips its scroll-driven page sync (the
// `page` state was already set imperatively alongside the `scrollTo`). It
// releases as soon as the container reaches the target, or when a short
// safety deadline passes in case the smooth scroll is cut short.

export type PagedRailScrollGuard = {
  /** Call right before a programmatic `scrollTo` to the given left offset. */
  arm: (targetLeft: number, behavior: ScrollBehavior) => void;
  /**
   * True while a programmatic scroll is still settling — the caller should
   * not update page state from the current scroll position this frame.
   * Auto-releases (and returns false) once settled or past the deadline.
   */
  isSettling: (currentLeft: number) => boolean;
  /** Force-release the guard (e.g. a fresh pointer grab takes over). */
  release: () => void;
};

const SMOOTH_SETTLE_DEADLINE_MS = 700;
const INSTANT_SETTLE_DEADLINE_MS = 120;
const SETTLE_TOLERANCE_PX = 2;

export function createPagedRailScrollGuard(): PagedRailScrollGuard {
  let pending: { left: number; deadline: number } | null = null;

  return {
    arm(targetLeft, behavior) {
      pending = {
        left: targetLeft,
        deadline:
          performance.now() +
          (behavior === "smooth"
            ? SMOOTH_SETTLE_DEADLINE_MS
            : INSTANT_SETTLE_DEADLINE_MS),
      };
    },
    isSettling(currentLeft) {
      if (!pending) return false;
      if (
        Math.abs(currentLeft - pending.left) <= SETTLE_TOLERANCE_PX ||
        performance.now() >= pending.deadline
      ) {
        pending = null;
        return false;
      }
      return true;
    },
    release() {
      pending = null;
    },
  };
}
