// Waits for the requested minimum delay, then lets the browser choose an idle
// slice for expensive below-fold React work. This keeps chunk evaluation out
// of active wheel/touch-scroll frames while preserving a predictable upper
// bound once the tab is actually visible.
export const scheduleIdle = (callback: () => void, delayMs = 60): (() => void) => {
  if (typeof window === "undefined") return () => {};

  const startedAt = Date.now();
  let idleId: number | null = null;
  let cancelled = false;
  let fired = false;

  const runOnce = () => {
    if (fired || cancelled) return;
    fired = true;
    callback();
  };

  const timeoutId = window.setTimeout(() => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(runOnce, {
        timeout: Math.max(2500, delayMs * 4),
      });
      return;
    }
    runOnce();
  }, delayMs);

  // A tab opened in the background (middle-clicked link, "open in new tab")
  // throttles both setTimeout and requestIdleCallback near-indefinitely —
  // this isn't just a requestIdleCallback quirk, the outer setTimeout above
  // can also sit unfired for as long as the tab stays hidden. Without this,
  // switching back to a homepage tab that loaded in the background could
  // leave the Auto/Brands sections stuck on their skeleton fallback long
  // after the page "finished loading". Firing once visibility returns — but
  // only once the requested delay has genuinely elapsed, so a quick tab
  // switch doesn't pull every section's commit back into the same frame —
  // restores the original bound.
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && Date.now() - startedAt >= delayMs) {
      runOnce();
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
    if (idleId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
};
