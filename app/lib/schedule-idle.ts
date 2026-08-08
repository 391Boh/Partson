// Schedules `callback` after a short, fixed delay. Deliberately not built on
// requestIdleCallback: idle callbacks are tied to the browser's internal idle
// scheduler, which in a backgrounded/hidden tab can stall for seconds and
// then fire several pending callbacks in the same burst — defeating the
// whole point of staggering below-the-fold section mounts apart. A fixed
// timeout is predictable regardless of tab visibility state.
// Returns a cleanup function that cancels the pending callback.
export const scheduleIdle = (callback: () => void, delayMs = 60): (() => void) => {
  if (typeof window === "undefined") return () => {};
  const id = window.setTimeout(callback, delayMs);
  return () => window.clearTimeout(id);
};
