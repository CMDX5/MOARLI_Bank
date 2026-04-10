/**
 * Hybrid rate limiter — Firestore-backed (by uid) with memory fallback (by IP).
 *
 * SECURITY improvement over IP-only limiting:
 * - Primary: Uses uid:endpoint as key (persisted in Firestore, survives restarts)
 * - Fallback: Uses ip:endpoint as key (in-memory, for unauthenticated routes)
 * - Cannot be bypassed by VPN/proxy/rotating IPs when uid is available
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup stale memory entries every 5 minutes
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt <= now) memoryStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  /** Max requests allowed in the window (default: 30) */
  maxRequests?: number;
  /** Window duration in seconds (default: 60) */
  windowSec?: number;
  /** Use uid-based limiting (default: true for authenticated routes) */
  useUid?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory rate limit check (used as fallback when Firestore unavailable).
 */
function memoryRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  const maxRequests = config.maxRequests ?? 30;
  const windowMs = (config.windowSec ?? 60) * 1000;
  const now = Date.now();

  const entry = memoryStore.get(identifier);

  if (!entry || entry.resetAt <= now) {
    memoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Firestore-backed rate limit check (uid-based, persistent).
 * Uses a single document per uid:endpoint with a counter and TTL.
 */
async function firestoreRateLimit(
  uid: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<RateLimitResult | null> {
  const maxRequests = config.maxRequests ?? 30;
  const windowSec = config.windowSec ?? 60;
  const now = Date.now();
  const resetAt = now + windowSec * 1000;
  const docId = `${uid}:${endpoint}`;

  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) return null;

    const docRef = adminDb.collection("rateLimits").doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists || (docSnap.data()?.resetAt ?? 0) <= now) {
      // New window — set counter to 1
      await docRef.set({ count: 1, resetAt, updatedAt: new Date().toISOString() });
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    const data = docSnap.data()!;
    if (data.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: data.resetAt };
    }

    // Increment counter (fire-and-forget for performance)
    docRef.update({ count: data.count + 1 }).catch(() => {});

    return { allowed: true, remaining: maxRequests - data.count - 1, resetAt: data.resetAt };
  } catch {
    return null; // Fallback to memory
  }
}

/**
 * Rate limit check — hybrid Firestore + memory.
 *
 * Usage with uid (authenticated routes):
 *   const rl = await rateLimit(uid, "transactions:create", { maxRequests: 30, windowSec: 60 });
 *
 * Usage with IP (unauthenticated routes):
 *   const clientId = getClientId(req);
 *   const rl = rateLimitByIp(clientId, "sms:verify-otp", { maxRequests: 10, windowSec: 60 });
 */
export async function rateLimit(
  uid: string | undefined | null,
  endpoint: string,
  config: RateLimitConfig = {}
): Promise<RateLimitResult> {
  // If we have a uid, try Firestore first (persistent, by-user)
  if (uid) {
    const firestoreResult = await firestoreRateLimit(uid, endpoint, config);
    if (firestoreResult) return firestoreResult;
  }

  // Fallback: in-memory by uid (if available) or by IP
  const identifier = uid ? `${uid}:${endpoint}` : `unknown:${endpoint}`;
  return memoryRateLimit(identifier, config);
}

/**
 * IP-based rate limit (synchronous, memory only).
 * Use for unauthenticated routes (OTP, login, etc.)
 */
export function rateLimitByIp(
  identifier: string,
  config: RateLimitConfig = {}
): RateLimitResult {
  return memoryRateLimit(identifier, config);
}

/**
 * Get a client identifier from a Request object (IP + user agent hash).
 * Used as fallback when uid is not available.
 */
export function getClientId(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const ua = req.headers.get("user-agent") || "";
  const uaHash = ua.slice(0, 16).replace(/[^a-zA-Z0-9]/g, "_");

  return `${ip}:${uaHash}`;
}
