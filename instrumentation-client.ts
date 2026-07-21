import * as Sentry from "@sentry/nextjs";

// No-op until NEXT_PUBLIC_SENTRY_DSN is set — see .env.example and
// instrumentation.ts. Session Replay is left off by default: this is a
// checkout flow with names/phones/addresses typed into real form fields,
// and replay recording is a privacy decision worth making deliberately,
// not a default.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
