// Resolves once the global stylesheet has loaded. On the homepage it loads
// without blocking first paint (see the loader script in app/layout.tsx), so
// content that mounts right after hydration — outside the inlined critical
// CSS — waits for it instead of flashing unstyled. Everywhere else the
// stylesheet is render-blocking and this resolves immediately.
const FULL_STYLESHEET_MAX_WAIT_MS = 10_000;

declare global {
  interface Window {
    __partsonCssReady?: Promise<void>;
    __partsonEnsureCss?: () => void;
  }
}

export const whenFullStylesheetReady = (options?: { priority?: "high" | "low" }): Promise<void> => {
  if (typeof window === "undefined" || !window.__partsonCssReady) return Promise.resolve();
  // A clicked window or a scrolled-to section should not wait behind an
  // optional, low-priority stylesheet download. The loader deduplicates this
  // with its DOMContentLoaded start and keeps the elevated priority on retry.
  if (options?.priority !== "low") window.__partsonEnsureCss?.();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Не вдалося завантажити оформлення сторінки")), FULL_STYLESHEET_MAX_WAIT_MS);
    window.__partsonCssReady!.then(
      () => { window.clearTimeout(timeout); resolve(); },
      (error: unknown) => { window.clearTimeout(timeout); reject(error); },
    );
  });
};
