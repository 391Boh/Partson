type BackgroundTaskOptions = {
  delayMs?: number;
  idleTimeoutMs?: number;
};

// requestIdleCallback alone can run while the browser is still downloading
// the LCP image. Wait for page resources first, then use an idle slot so
// optional requests do not take bandwidth or main-thread time from the page.
export const scheduleBackgroundTask = (
  task: () => void,
  { delayMs = 0, idleTimeoutMs = 2_000 }: BackgroundTaskOptions = {}
): (() => void) => {
  let cancelled = false;
  let timerId: number | undefined;
  let idleId: number | undefined;

  const run = () => {
    idleId = undefined;
    if (cancelled) return;
    if (
      document.visibilityState === "hidden" ||
      document.documentElement.classList.contains("is-scrolling")
    ) {
      timerId = window.setTimeout(scheduleIdle, 500);
      return;
    }
    task();
  };

  const scheduleIdle = () => {
    timerId = undefined;
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: idleTimeoutMs });
    } else {
      timerId = window.setTimeout(run, 100);
    }
  };

  const onLoad = () => {
    if (!cancelled) timerId = window.setTimeout(scheduleIdle, delayMs);
  };

  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener("load", onLoad);
    if (timerId !== undefined) window.clearTimeout(timerId);
    if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
  };
};
