// ── Next.js Instrumentation — Server Startup Validation ──
// This file runs once when the Next.js server starts (both dev and production).
// It validates all critical environment variables BEFORE any request is processed.
// In production, missing required env vars will prevent the server from starting.

export async function register() {
  // Dynamic import to avoid loading in edge runtime or client bundles
  const { validateEnvOrThrow } = await import("@/lib/validate-env");
  validateEnvOrThrow();
}
