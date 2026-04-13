import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // DSN will be set via SENTRY_DSN environment variable
  dsn: process.env.SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Performance monitoring
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Debug mode (disable in production)
  debug: process.env.NODE_ENV !== "production",

  // Environment
  environment: process.env.NODE_ENV || "development",

  // Release
  release: process.env.SENTRY_RELEASE || undefined,

  // Ignore common non-critical errors
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
  ],

  // Attach stack traces
  attachStacktrace: true,

  // Don't send PII
  sendDefaultPii: false,

  // Before send: strip sensitive data from server
  beforeSend(event) {
    // Strip all request headers
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-api-key"];
      delete event.request.headers["x-forwarded-for"];
    }

    // Strip user IP
    if (event.request) {
      delete (event.request as Record<string, unknown>).ip_address;
    }

    // Sanitize user data
    if (event.user) {
      event.user = {
        id: event.user.id,
        // Don't send email, IP, or other PII
      };
    }

    return event;
  },
});
