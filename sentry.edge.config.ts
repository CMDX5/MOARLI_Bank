import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // DSN will be set via SENTRY_DSN environment variable
  dsn: process.env.SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Debug mode
  debug: process.env.NODE_ENV !== "production",

  // Environment
  environment: process.env.NODE_ENV || "development",

  // Don't send PII
  sendDefaultPii: false,
});
