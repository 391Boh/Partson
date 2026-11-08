const SCROLL_SETTLE_RETRY_MS = 200;

/** Runs `task` as soon as the page is not scrolling. Returns a cancel function. */
export const whenScrollSettles = (task: () => void): (() => void) => {
  let timerId: number | undefined;
  const attempt = () => {
    timerId = undefined;
    if (document.documentElement.classList.contains("is-scrolling")) {
      timerId = window.setTimeout(attempt, SCROLL_SETTLE_RETRY_MS);
      return;
    }
    task();
  };
  attempt();
  return () => {
    if (timerId !== undefined) window.clearTimeout(timerId);
  };
};
