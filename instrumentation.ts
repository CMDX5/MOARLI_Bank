export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try { await import("./sentry.server.config"); } catch {}
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    try { await import("./sentry.edge.config"); } catch {}
  }
}
