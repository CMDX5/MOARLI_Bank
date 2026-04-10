import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // DSN will be set via SENTRY_DSN environment variable
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Replay settings
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  // Performance monitoring
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Debug mode (disable in production)
  debug: process.env.NODE_ENV !== "production",

  // Environment
  environment: process.env.NODE_ENV || "development",

  // Release
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,

  // Ignore common non-critical errors
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    "Network request failed",
    "Failed to fetch",
    "AbortError",
    "Navigation cancelled",
  ],

  // Attach stack traces to all messages
  attachStacktrace: true,

  // Don't send PII
  sendDefaultPii: false,

  // Before send: strip sensitive data
  beforeSend(event) {
    // Strip sensitive headers
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-api-key"];
    }

    // Strip sensitive data from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.filter((bc) => {
        const url = bc.data?.url as string | undefined;
        if (url && (url.includes("apiKey") || url.includes("secret"))) return false;
        return true;
      });
    }

    return event;
  },
});
