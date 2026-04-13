// ── MORALI PAY — Sentry Monitoring Utilities ──
// Centralized error tracking helpers for API routes and client code

import type { ZodError } from "zod";

type SeverityLevel = "debug" | "info" | "warning" | "error" | "fatal";

/**
 * Safely capture an exception in Sentry.
 * Only reports in production; logs to console in development.
 */
export function captureError(
  error: unknown,
  context?: {
    action?: string;
    uid?: string;
    route?: string;
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: SeverityLevel;
  },
) {
  // Lazy import to avoid loading Sentry in environments where it's not configured
  const maybeSentry = typeof window !== "undefined"
    ? (globalThis as Record<string, unknown>).__sentry_client__
    : null;

  // Build context data
  const extra: Record<string, unknown> = {
    ...context?.extra,
    timestamp: new Date().toISOString(),
  };
  if (context?.action) extra.action = context.action;
  if (context?.route) extra.route = context.route;

  // Sanitize the error
  const sanitizedError = sanitizeError(error);

  if (process.env.NODE_ENV === "development") {
    console.error(`[Sentry Dev] ${context?.level || "error"}:`, sanitizedError.message, extra);
    return;
  }

  // Try to capture via Sentry SDK
  try {
    const Sentry = require("@sentry/nextjs");
    Sentry.withScope((scope: Record<string, unknown>) => {
      if (context?.tags) {
        (scope as Record<string, (tags: Record<string, string>) => void>).setTags?.(context.tags);
      }
      if (context?.uid) {
        (scope as Record<string, (user: Record<string, string>) => void>).setUser?.({ id: context.uid });
      }
      if (context?.level) {
        (scope as Record<string, (level: string) => void>).setLevel?.(context.level);
      }
      (scope as Record<string, (extra: Record<string, unknown>) => void>).setExtras?.(extra);
      (Sentry as Record<string, (err: Error) => void>).captureException?.(sanitizedError);
    });
  } catch {
    // Sentry not configured — silent fail
    console.error("[Sentry] Failed to capture:", sanitizedError.message);
  }
}

/**
 * Log a security-relevant event (failed login, rate limit, suspicious activity)
 */
export function captureSecurityEvent(
  event: string,
  context?: {
    uid?: string;
    ip?: string;
    details?: Record<string, unknown>;
  },
) {
  captureError(new Error(`[SECURITY] ${event}`), {
    action: "security_event",
    tags: { security: "true", event },
    extra: {
      ...context?.details,
      uid: context?.uid || "anonymous",
    },
    level: "warning",
  });
}

/**
 * Log a Zod validation error with details
 */
export function captureValidationError(
  error: ZodError,
  context?: {
    route?: string;
    uid?: string;
    body?: unknown;
  },
) {
  captureError(error, {
    action: "validation_error",
    route: context?.route,
    uid: context?.uid,
    extra: {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
      body: context?.body ? truncateValue(context.body) : undefined,
    },
    level: "warning",
  });
}

/**
 * Sanitize an error for Sentry reporting
 * Removes PII and sensitive data
 */
function sanitizeError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message
      .replace(/Bearer\s+[^\s]+/g, "Bearer ***")
      .replace(/apiKey[=:]\s*[^\s]+/gi, "apiKey=***")
      .replace(/secret[=:]\s*[^\s]+/gi, "secret=***")
      .replace(/password[=:]\s*[^\s]+/gi, "password=***");

    const sanitized = new Error(message);
    sanitized.name = error.name;

    // Copy stack but remove query params from URLs
    if (error.stack) {
      sanitized.stack = error.stack.replace(/\?.*/g, "?***");
    }

    return sanitized;
  }

  return new Error(String(error));
}

/**
 * Truncate large values to prevent Sentry payload bloat
 */
function truncateValue(value: unknown, maxLen = 500): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > maxLen ? value.slice(0, maxLen) + "..." : value;
  if (Array.isArray(value)) return value.map((v) => truncateValue(v, maxLen));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = truncateValue(val, maxLen);
    }
    return result;
  }
  return value;
}

/**
 * Create a performance transaction span for API routes
 */
export function startTransaction(
  name: string,
  op: string,
  data?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "development") return null;

  try {
    const Sentry = require("@sentry/nextjs");
    return (Sentry as Record<string, unknown>).startSpan?.({
      name,
      op,
      data,
    }) || null;
  } catch {
    return null;
  }
}
