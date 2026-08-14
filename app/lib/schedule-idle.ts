// Waits for the requested minimum delay, then lets the browser choose an idle
// slice for expensive below-fold React work. The timeout keeps hidden tabs or
// continuously busy browsers from postponing the section forever. This keeps
// chunk evaluation out of active wheel/touch-scroll frames while preserving a
// predictable upper bound.
export const scheduleIdle = (callback: () => void, delayMs = 60): (() => void) => {
  if (typeof window === "undefined") return () => {};

  let idleId: number | null = null;
  let cancelled = false;
  const timeoutId = window.setTimeout(() => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(callback, {
        timeout: Math.max(2500, delayMs * 4),
      });
      return;
    }
    callback();
  }, delayMs);

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
    if (idleId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }
  };
};
