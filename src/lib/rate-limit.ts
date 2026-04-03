/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window per IP + endpoint combination.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  /** Max requests allowed in the window (default: 30) */
  maxRequests?: number;
  /** Window duration in seconds (default: 60) */
  windowSec?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request should be rate-limited.
 * Returns { allowed, remaining, resetAt }.
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): RateLimitResult {
  const maxRequests = config.maxRequests ?? 30;
  const windowMs = (config.windowSec ?? 60) * 1000;
  const now = Date.now();

  const entry = store.get(identifier);

  if (!entry || entry.resetAt <= now) {
    // New window
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get a client identifier from a Request object (IP + user agent hash).
 */
export function getClientId(req: Request): string {
  // Try X-Forwarded-For first (behind proxy/gateway)
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  // Include user-agent for better fingerprinting
  const ua = req.headers.get("user-agent") || "";
  const uaHash = ua.slice(0, 16).replace(/[^a-zA-Z0-9]/g, "_");

  return `${ip}:${uaHash}`;
}
