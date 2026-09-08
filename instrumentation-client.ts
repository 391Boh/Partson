// No-op until NEXT_PUBLIC_SENTRY_DSN is set — see .env.example and
// instrumentation.ts. Session Replay is left off by default: this is a
// checkout flow with names/phones/addresses typed into real form fields,
// and replay recording is a privacy decision worth making deliberately,
// not a default.
//
// The `@sentry/nextjs` import is dynamic and gated behind the DSN check on
// purpose: a static top-level `import * as Sentry from "@sentry/nextjs"`
// bundles the full client SDK (~450KB, ~2.4s of main-thread execution per
// Lighthouse on the catalog page) into the shared chunk loaded on every
// route, even in this environment where no DSN is configured and Sentry
// never actually initializes. Dynamic import lets the bundler code-split it
// out entirely, so unconfigured environments pay nothing for it.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  });
}
