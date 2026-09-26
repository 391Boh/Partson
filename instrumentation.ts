import * as Sentry from "@sentry/nextjs";

// No-op until SENTRY_DSN is set — see .env.example. Sign up free at
// sentry.io, create a Next.js project, and paste its DSN into
// SENTRY_DSN (server/edge) and NEXT_PUBLIC_SENTRY_DSN (client, in
// instrumentation-client.ts) to activate.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Warm the shared full-catalog snapshot right away in the background —
    // it backs both the "Акційні товари" (promo-only) filter and the
    // in-memory search index (searchCatalogIndex) that answers header
    // quick-search/first-page-search requests without a live 1C call.
    // fetchPromoCatalogProducts only runs the underlying full scan
    // (~20 sequential, cursor-chained 1C calls — can't be parallelized,
    // each page's cursor depends on the previous one) when the cache is
    // genuinely empty; without this, that cost landed on whichever real
    // visitor happened to be first to open the promo filter or type a search
    // after every deploy/restart, instead of on the server itself at startup.
    void import("app/lib/catalog-server")
      .then((mod) => mod.fetchPromoCatalogProducts())
      .catch(() => undefined);

    // Warm the homepage's "Групи товарів" section data (getprod) the same
    // way /api/preload already does for a client-triggered warmup — but from
    // the server itself, at boot, so the very first real visitor to land
    // directly on "/" right after a deploy/restart doesn't eat the cold
    // fetch (dev-measured at several seconds; worse under real 1C load).
    // Nothing else warms this endpoint proactively: LayoutHost's own
    // client-side warmup pass explicitly skips it when already on "/"
    // (tovar.tsx fetches it itself once mounted) and only fires it from
    // other pages, which only helps if someone already visited one first.
    void import("app/api/_lib/oneC")
      .then((mod) =>
        mod.oneCRequest("getprod", {
          method: "POST",
          body: {},
          retries: 0,
          cacheTtlMs: 1000 * 60 * 60 * 6,
        })
      )
      .catch(() => undefined);
  }

  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      // Modest sampling to stay well inside the free-tier event quota —
      // raise once real traffic volume on Sentry's dashboard is known.
      tracesSampleRate: 0.1,
    });
  }
}

// Reports errors thrown inside Server Components / route handlers that
// Next.js's own error boundary can't otherwise see (see app/error.tsx for
// the ones it can).
export const onRequestError = Sentry.captureRequestError;
