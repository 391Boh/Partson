// Resolves once the global stylesheet has loaded. On the homepage it loads
// without blocking first paint (see the loader script in app/layout.tsx), so
// content that mounts right after hydration — outside the inlined critical
// CSS — waits for it instead of flashing unstyled. Everywhere else the
// stylesheet is render-blocking and this resolves immediately.
const FULL_STYLESHEET_MAX_WAIT_MS = 10_000;

declare global {
  interface Window {
    __partsonCssReady?: Promise<void>;
  }
}

export const whenFullStylesheetReady = (): Promise<void> => {
  if (typeof window === "undefined" || !window.__partsonCssReady) return Promise.resolve();
  return Promise.race([
    window.__partsonCssReady,
    new Promise<void>((resolve) => window.setTimeout(resolve, FULL_STYLESHEET_MAX_WAIT_MS)),
  ]);
};
