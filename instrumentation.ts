import * as Sentry from "@sentry/nextjs";

// No-op until SENTRY_DSN is set — see .env.example. Sign up free at
// sentry.io, create a Next.js project, and paste its DSN into
// SENTRY_DSN (server/edge) and NEXT_PUBLIC_SENTRY_DSN (client, in
// instrumentation-client.ts) to activate.
export async function register() {
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
